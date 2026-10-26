"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { queueTranslations } from "@/lib/ai/jobs";
import { fail, limitUser, guard, ok, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { actionUser } from "@/lib/session";
import type { Widget } from "@/lib/types";
import { WIDGET_LABELS, WIDGET_TYPES, defaultConfig, widgetConfigSchema, type WidgetConfig } from "@/lib/widget/config";

async function owned(spaceId: string) {
  const user = await actionUser();
  await limitUser(user.id);
  return getOwnedSpace(user.id, spaceId);
}

export async function createWidget(spaceId: string, type: string): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const space = await owned(spaceId);
    if (!space) return fail("Not found");
    const t = z.enum(WIDGET_TYPES).safeParse(type);
    if (!t.success) return fail("Unknown widget type");
    const count = await one<{ n: number }>("select count(*)::int as n from widgets where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= env.maxWidgetsPerSpace) return fail(`Up to ${env.maxWidgetsPerSpace} widgets per space`);
    const id = newId(12);
    await q("insert into widgets (id, space_id, name, type, config) values ($1, $2, $3, $4, $5)", [
      id,
      spaceId,
      WIDGET_LABELS[t.data],
      t.data,
      JSON.stringify(defaultConfig(t.data, space.brand_color)),
    ]);
    return ok({ id });
  });
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Add a name").max(60).optional(),
  type: z.enum(WIDGET_TYPES).optional(),
  config: widgetConfigSchema.optional(),
});

export async function updateWidget(
  spaceId: string,
  id: string,
  input: { name?: string; type?: string; config?: WidgetConfig },
): Promise<Result<Widget>> {
  return guard(async () => {
    const space = await owned(spaceId);
    if (!space) return fail("Not found");
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the settings");
    const d = parsed.data;
    const row = await one<Widget>(
      `update widgets set name = coalesce($3, name), type = coalesce($4, type), config = coalesce($5, config), updated_at = now()
       where id = $1 and space_id = $2 returning *`,
      [id, spaceId, d.name ?? null, d.type ?? null, d.config ? JSON.stringify(d.config) : null],
    );
    if (!row) return fail("Not found");
    updateTag(`widget:${id}`);
    // A widget shown in another language: translate its testimonials in the background (AI, when a key is set).
    if (d.config?.language) await queueTranslations(spaceId);
    return ok(row);
  });
}

export async function deleteWidget(spaceId: string, id: string): Promise<Result> {
  return guard(async () => {
    const space = await owned(spaceId);
    if (!space) return fail("Not found");
    const rows = await q("delete from widgets where id = $1 and space_id = $2 returning id", [id, spaceId]);
    if (!rows.length) return fail("Not found");
    updateTag(`widget:${id}`);
    return ok(null);
  });
}

export async function duplicateWidget(spaceId: string, id: string): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const space = await owned(spaceId);
    if (!space) return fail("Not found");
    const count = await one<{ n: number }>("select count(*)::int as n from widgets where space_id = $1", [spaceId]);
    if ((count?.n ?? 0) >= env.maxWidgetsPerSpace) return fail(`Up to ${env.maxWidgetsPerSpace} widgets per space`);
    const newIdValue = newId(12);
    const row = await one(
      `insert into widgets (id, space_id, name, type, config)
       select $3, space_id, left(name || ' copy', 60), type, config from widgets where id = $1 and space_id = $2 returning id`,
      [id, spaceId, newIdValue],
    );
    if (!row) return fail("Not found");
    return ok({ id: newIdValue });
  });
}
