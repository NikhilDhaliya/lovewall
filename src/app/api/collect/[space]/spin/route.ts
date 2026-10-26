import { after } from "next/server";
import { z } from "zod";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";
import { ipKey } from "@/lib/ip";
import { enqueue, flushOne } from "@/lib/outbox";
import { rateLimitAll, tooMany } from "@/lib/rate-limit";
import { rewardEmail, spin } from "@/lib/rewards";
import { TOKEN_RE } from "@/lib/tokens";

const body = z.object({ claim: z.string().regex(TOKEN_RE) });

// Public: a visitor spins the wheel they were given after submitting. The server picks the prize, once.
export async function POST(request: Request, ctx: RouteContext<"/api/collect/[space]/spin">) {
  const { space: spaceId } = await ctx.params;
  if (!/^[0-9A-Za-z]{8,32}$/.test(spaceId)) return Response.json({ error: "Not found" }, { status: 404 });
  const ip = ipKey(request.headers);
  const limit = await rateLimitAll([[`spin:ip:${ip}`, 20, 600]]);
  if (!limit.ok) return tooMany(limit);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const res = await spin(spaceId, parsed.data.claim);
  if (!res) return Response.json({ error: "Not found" }, { status: 404 });
  if (res.first && res.email && res.result.prize.kind !== "none") {
    const { dict } = formLanguage(res.language, request.headers.get("accept-language"));
    const mail = rewardEmail({
      to: res.email,
      space: res.space,
      subject: t(dict, "mailRewardSubject", { space: res.space }),
      intro: t(dict, "youWon", { prize: res.result.prize.label }),
      prize: res.result.prize,
    });
    if (mail) {
      after(async () => {
        const id = await enqueue(mail).catch(() => null);
        if (id) await flushOne(id).catch(() => {});
      });
    }
  }
  return Response.json(res.result);
}
