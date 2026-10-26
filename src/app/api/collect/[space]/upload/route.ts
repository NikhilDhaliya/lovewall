import { z } from "zod";
import { one } from "@/lib/db";
import { createUpload } from "@/lib/data/files";
import { ensureDefaultForm, getForm } from "@/lib/data/forms";
import { ipKey } from "@/lib/ip";
import { rateLimitAll, tooMany } from "@/lib/rate-limit";
import { storageConfigured } from "@/lib/storage";
import type { Space } from "@/lib/types";

const body = z.object({
  kind: z.enum(["avatar", "video", "poster"]),
  type: z.string().max(100),
  size: z.number().int().positive(),
  formId: z
    .string()
    .regex(/^[0-9A-Za-z]{8,32}$/)
    .nullable()
    .optional(),
});

// Public: a visitor on the collect page asks for a presigned PUT for their photo, video or poster.
export async function POST(request: Request, ctx: RouteContext<"/api/collect/[space]/upload">) {
  const { space: spaceId } = await ctx.params;
  if (!storageConfigured()) return Response.json({ error: "Uploads are off" }, { status: 503 });
  if (!/^[0-9A-Za-z]{8,32}$/.test(spaceId)) return Response.json({ error: "Not found" }, { status: 404 });
  const json = await request.json().catch(() => null);
  const parsed = body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ip = ipKey(request.headers);
  const limit = await rateLimitAll([
    [`upload:ip:${ip}`, 30, 600],
    [`upload:space:${spaceId}`, 300, 3600],
  ]);
  if (!limit.ok) return tooMany(limit);
  const space = await one<Space>("select * from spaces where id = $1", [spaceId]);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });
  const form = parsed.data.formId ? await getForm(spaceId, parsed.data.formId) : await ensureDefaultForm(space);
  if (!form) return Response.json({ error: "Not found" }, { status: 404 });
  const off = parsed.data.kind === "avatar" ? form.fields.photo === "off" : form.fields.video === "off";
  if (off) return Response.json({ error: parsed.data.kind === "avatar" ? "Photos are off" : "Video is off" }, { status: 403 });
  const res = await createUpload(spaceId, parsed.data.kind, parsed.data.type, parsed.data.size);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json({ key: res.key, url: res.url, headers: res.headers });
}
