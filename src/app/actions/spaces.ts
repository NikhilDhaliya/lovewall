"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, firstIssue, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { one, q, tx } from "@/lib/db";
import { claimUploads, createUpload, verifyUpload } from "@/lib/data/files";
import { planFor } from "@/lib/data/billing";
import { getOwnedSpace, requireRole } from "@/lib/data/spaces";
import { trash } from "@/lib/data/trash";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { spacePrefix, storageConfigured } from "@/lib/storage";
import { hexSchema, nameSchema, slugify, slugSchema, UPLOAD_KINDS, websiteSchema } from "@/lib/validation";
import { defaultConfig } from "@/lib/widget/config";
import { getDomain, vercelRemoveDomain } from "@/lib/data/domains";

const DEFAULT_QUESTIONS = ["What problem did it solve for you?", "What changed after you started?", "Who would you recommend it to?"];

async function freeSlug(base: string): Promise<string> {
  let slug = slugify(base) || "space";
  if (slug.length < 2) slug = `${slug}-space`;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) slug = `${slug}-space`.slice(0, 40);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug.slice(0, 34)}-${newId(4).toLowerCase()}`;
    if (!(await one("select 1 from spaces where slug = $1", [candidate]))) return candidate;
  }
  return `space-${newId(8).toLowerCase()}`;
}

export async function createSpace(input: { name: string }): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const user = await actionUser();
    const name = nameSchema.safeParse(input.name);
    if (!name.success) return fail(firstIssue(name.error));
    const limit = await rateLimit(`space-create:${user.id}`, 20, 3600);
    if (!limit.ok) return fail("Too many new spaces. Try again later.");
    if ((await planFor(user.id))?.state === "ended") return fail("Subscribe to add spaces");
    const count = await one<{ n: number }>("select count(*)::int as n from spaces where owner_id = $1", [user.id]);
    if ((count?.n ?? 0) >= env.maxSpacesPerUser) return fail(`You can have up to ${env.maxSpacesPerUser} spaces`);
    const id = newId(12);
    const slug = await freeSlug(name.data);
    await tx(async (c) => {
      await c.query("insert into spaces (id, owner_id, name, slug, prompt, questions) values ($1, $2, $3, $4, $5, $6)", [
        id,
        user.id,
        name.data,
        slug,
        `What do you love about ${name.data}?`,
        JSON.stringify(DEFAULT_QUESTIONS),
      ]);
      await c.query("insert into widgets (id, space_id, name, type, config) values ($1, $2, $3, 'wall', $4)", [
        newId(12),
        id,
        "Wall of love",
        JSON.stringify(defaultConfig("wall")),
      ]);
    });
    revalidatePath("/app", "layout");
    return ok({ id });
  });
}

const patchSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema,
    website: websiteSchema,
    brand_color: hexSchema,
    prompt: z.string().trim().max(140, "At most 140 characters"),
    questions: z
      .array(z.string().trim().max(140))
      .max(6)
      .transform((a) => a.filter(Boolean)),
    collect_video: z.boolean(),
    notify: z.boolean(),
    logo_key: z.string().max(200).nullable(),
  })
  .partial();

export async function updateSpace(spaceId: string, input: z.input<typeof patchSchema>): Promise<Result<{ slug: string }>> {
  return guard(async () => {
    const user = await actionUser();
    const space = await getOwnedSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    const parsed = patchSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const patch = parsed.data;
    // The public link and the owner's emails are the owner's to change; editors keep name, website, logo and colour.
    if ((patch.slug !== undefined && patch.slug !== space.slug) || patch.notify !== undefined) {
      if (!requireRole(space, "owner")) return fail("Only the owner can change this");
    }
    const limit = await rateLimit(`space-update:${user.id}`, 600, 3600);
    if (!limit.ok) return fail("Too many changes. Try again later.");
    if (
      patch.slug &&
      patch.slug !== space.slug &&
      (await one("select 1 from spaces where slug = $1 and id <> $2", [patch.slug, spaceId]))
    ) {
      return fail("That link is taken");
    }
    if (patch.logo_key) {
      if (patch.logo_key !== space.logo_key) await verifyUpload(spaceId, "logo", patch.logo_key);
    }
    const fields = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!fields.length) return ok({ slug: space.slug });
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`);
    const values = fields.map(([k, v]) => (k === "questions" ? JSON.stringify(v) : v));
    await q(`update spaces set ${sets.join(", ")}, updated_at = now() where id = $1`, [spaceId, ...values]);
    if (patch.logo_key) await claimUploads([patch.logo_key]);
    if (patch.logo_key !== undefined && space.logo_key && patch.logo_key !== space.logo_key) await trash([space.logo_key]);
    await refreshWidgets(spaceId);
    return ok({ slug: patch.slug ?? space.slug });
  });
}

export async function deleteSpace(spaceId: string): Promise<Result> {
  return guard(async () => {
    const user = await actionUser();
    const space = await getOwnedSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    if (!requireRole(space, "owner")) return fail("Only the owner can delete the space");
    const limit = await rateLimit(`space-delete:${user.id}`, 20, 3600);
    if (!limit.ok) return fail("Too many changes. Try again later.");
    await refreshWidgets(spaceId);
    const domain = await getDomain(spaceId);
    if (domain) await vercelRemoveDomain(domain.domain);
    await q("delete from spaces where id = $1 and owner_id = $2", [spaceId, user.id]);
    if (storageConfigured()) await trash([spacePrefix(spaceId)]);
    revalidatePath("/app", "layout");
    return ok(null);
  });
}

export async function checkSlug(spaceId: string, slug: string): Promise<Result<{ free: boolean; error?: string }>> {
  return guard(async () => {
    const user = await actionUser();
    if (!(await getOwnedSpace(user.id, spaceId))) return fail("Not found");
    if (!(await rateLimit(`slug-check:${user.id}`, 300, 3600)).ok) return fail("Too many checks. Try again later.");
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return ok({ free: false, error: firstIssue(parsed.error) });
    const taken = await one("select 1 from spaces where slug = $1 and id <> $2", [parsed.data, spaceId]);
    return ok({ free: !taken, error: taken ? "That link is taken" : undefined });
  });
}

// Owner uploads (logo, photos while editing): same presigned PUT as the public form.
export async function presignUpload(
  spaceId: string,
  input: { kind: string; type: string; size: number },
): Promise<Result<{ key: string; url: string; headers: Record<string, string> }>> {
  return guard(async () => {
    const user = await actionUser();
    if (!storageConfigured()) return fail("File storage isn't set up");
    if (!(await getOwnedSpace(user.id, spaceId))) return fail("Not found");
    const kind = z.enum(UPLOAD_KINDS).safeParse(input.kind);
    if (!kind.success) return fail("Unknown upload");
    const limit = await rateLimit(`owner-upload:${user.id}`, 120, 3600);
    if (!limit.ok) return fail("Too many uploads. Try again later.");
    const res = await createUpload(spaceId, kind.data, String(input.type), Number(input.size));
    if (!res.ok) return fail(res.error);
    return ok({ key: res.key, url: res.url, headers: res.headers });
  });
}
