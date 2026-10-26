"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, firstIssue, guard, ok, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { ensureDefaultForm, freeFormSlug, getForm } from "@/lib/data/forms";
import { getOwnedSpace } from "@/lib/data/spaces";
import { defaultFields, FORM_KINDS, formDefaults, formPatchSchema, type FormKind, type FormPatch } from "@/lib/forms";
import { LANG_CODES } from "@/lib/i18n/collect/languages";
import { newId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { codeStats } from "@/lib/rewards";
import { actionUser } from "@/lib/session";

const MAX_FORMS = 50;

async function owned(spaceId: string, action: string, max = 120) {
  const user = await actionUser();
  const space = await getOwnedSpace(user.id, spaceId);
  const limit = space ? await rateLimit(`forms:${action}:${user.id}`, max, 3600) : null;
  return { user, space, limited: limit ? !limit.ok : false };
}

export async function createForm(spaceId: string, kind: FormKind): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "create", 30);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many new forms. Try again later.");
    const k = z.enum(FORM_KINDS).safeParse(kind);
    if (!k.success) return fail("Unknown form type");
    await ensureDefaultForm(space);
    const count = await one<{ n: number }>("select count(*)::int as n from forms where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= MAX_FORMS) return fail(`A space can have up to ${MAX_FORMS} forms`);
    const d = formDefaults(k.data, space.name);
    const id = newId(12);
    await q(
      `insert into forms (id, space_id, kind, slug, name, title, fields, questions, layout, followup)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        spaceId,
        k.data,
        await freeFormSlug(spaceId, d.slug),
        d.name,
        d.title,
        JSON.stringify(defaultFields(k.data)),
        JSON.stringify(d.questions),
        d.layout,
        d.followup,
      ],
    );
    revalidatePath(`/app/${spaceId}/collect`);
    return ok({ id });
  });
}

export async function updateForm(spaceId: string, formId: string, input: FormPatch): Promise<Result<{ slug: string }>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "update", 1200);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    const form = await getForm(spaceId, formId);
    if (!form) return fail("Not found");
    const parsed = formPatchSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const patch = parsed.data;
    if (patch.language && patch.language !== "auto" && !LANG_CODES.includes(patch.language)) return fail("Unknown language");
    if (patch.slug && patch.slug !== form.slug) {
      if (form.isDefault) return fail("The default form lives at the space link");
      if (
        patch.slug === space.slug ||
        (await one("select 1 from forms where space_id = $1 and slug = $2 and id <> $3", [spaceId, patch.slug, formId]))
      )
        return fail("That link is taken");
    }
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (key === "fields") values.fields = JSON.stringify({ ...form.fields, ...(value as object) });
      else if (key === "hints" || key === "questions" || key === "thanks" || key === "reward") values[key] = JSON.stringify(value);
      else values[key] = value;
    }
    // NPS and case studies are always in steps.
    if (values.layout && form.kind !== "testimonial") delete values.layout;
    const keys = Object.keys(values);
    if (!keys.length) return ok({ slug: form.slug });
    await q(`update forms set ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}, updated_at = now() where id = $1 and space_id = $2`, [
      formId,
      spaceId,
      ...keys.map((k) => values[k]),
    ]);
    return ok({ slug: patch.slug ?? form.slug });
  });
}

export async function deleteForm(spaceId: string, formId: string): Promise<Result> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "delete", 60);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    const form = await getForm(spaceId, formId);
    if (!form) return fail("Not found");
    if (form.isDefault) return fail("The default form can't be deleted");
    // Testimonials from it stay in the inbox.
    await q("delete from forms where id = $1 and space_id = $2 and not is_default", [formId, spaceId]);
    revalidatePath(`/app/${spaceId}/collect`);
    return ok(null);
  });
}

// Coupon code lists: one code per line (or comma separated). Each code is handed out once.
export async function addRewardCodes(
  spaceId: string,
  formId: string,
  text: string,
): Promise<Result<{ added: number; left: number; used: number }>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "codes", 60);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    if (!(await getForm(spaceId, formId))) return fail("Not found");
    const input = z.string().max(200_000, "Too many codes at once").safeParse(text);
    if (!input.success) return fail(firstIssue(input.error));
    const codes = [
      ...new Set(
        input.data
          .split(/[\n,;\t]+/)
          .map((c) => c.trim())
          .filter((c) => c && c.length <= 80),
      ),
    ];
    if (!codes.length) return fail("Paste one code per line");
    const stats = await codeStats(formId);
    if (stats.left + stats.used + codes.length > 10_000) return fail("Up to 10,000 codes per form");
    const existing = new Set(
      (await q<{ code: string }>("select code from reward_codes where form_id = $1 and code = any($2)", [formId, codes])).map(
        (r) => r.code,
      ),
    );
    const fresh = codes.filter((c) => !existing.has(c));
    if (fresh.length) await q("insert into reward_codes (form_id, code) select $1, unnest($2::text[])", [formId, fresh]);
    return ok({ added: fresh.length, ...(await codeStats(formId)) });
  });
}

export async function clearRewardCodes(spaceId: string, formId: string): Promise<Result<{ left: number; used: number }>> {
  return guard(async () => {
    const { space, limited } = await owned(spaceId, "codes", 60);
    if (!space) return fail("Not found");
    if (limited) return fail("Too many changes. Try again later.");
    if (!(await getForm(spaceId, formId))) return fail("Not found");
    await q("delete from reward_codes where form_id = $1 and claimed_at is null", [formId]);
    return ok(await codeStats(formId));
  });
}
