"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { fail, limitUser, guard, ok, refreshWidgets, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getOwnedSpace } from "@/lib/data/spaces";
import { ID_RE, newId } from "@/lib/ids";
import { ipKey } from "@/lib/ip";
import { appLink } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { audit, removeTestimonials } from "@/lib/privacy";
import { reportMail } from "@/lib/privacy-mail";
import { rateLimitAll } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { emitTestimonialEvent } from "@/lib/webhooks";
import type { Testimonial } from "@/lib/types";

const reportSchema = z.object({
  testimonialId: z.string().regex(ID_RE),
  reason: z.enum(["me", "false", "offensive", "other"]),
  details: z.string().trim().max(2000, "At most 2,000 characters").default(""),
  email: z
    .union([z.email().max(254), z.literal("")])
    .optional()
    .transform((v) => v?.toLowerCase() || null),
  // Honeypot: a field people never see.
  website: z.string().max(200).optional(),
});

export type ReportInput = z.input<typeof reportSchema>;

// Public: anyone can report a published testimonial from a wall page or widget. The space's members see it in the
// inbox and the owner gets an email. Limited per visitor and per space.
export async function submitReport(widgetId: string, input: ReportInput): Promise<Result> {
  return guard(async () => {
    if (!ID_RE.test(String(widgetId))) return fail("Not found");
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success)
      return fail(parsed.error.issues[0]?.message?.startsWith("At most") ? parsed.error.issues[0].message : "Pick a reason");
    const d = parsed.data;
    if (d.website) return ok(null);
    const row = await one<{ space_id: string; space: string; owner_email: string; name: string }>(
      `select w.space_id, s.name as space, u.email as owner_email, t.name
       from widgets w join spaces s on s.id = w.space_id join auth_users u on u.id = s.owner_id
       join testimonials t on t.space_id = w.space_id and t.id = $2 and t.status = 'approved'
       where w.id = $1`,
      [widgetId, d.testimonialId],
    );
    if (!row) return fail("Not found");
    const ip = ipKey(await headers());
    const limit = await rateLimitAll([
      [`report:ip:${ip}`, 5, 3600],
      [`report:space:${row.space_id}`, 50, 86400],
    ]);
    if (!limit.ok) return fail("Too many reports. Try again later.");
    // One open report per testimonial and reason is enough.
    const open = await one("select 1 from reports where testimonial_id = $1 and reason = $2 and resolved_at is null", [
      d.testimonialId,
      d.reason,
    ]);
    if (!open) {
      await q("insert into reports (id, space_id, testimonial_id, reason, details, email) values ($1, $2, $3, $4, $5, $6)", [
        newId(12),
        row.space_id,
        d.testimonialId,
        d.reason,
        d.details,
        d.email,
      ]);
      const outboxId = await enqueue(
        reportMail({
          to: row.owner_email,
          space: row.space,
          name: row.name,
          reason: d.reason,
          details: d.details,
          url: appLink(`/app/${row.space_id}`),
        }),
      );
      after(() => flushOne(outboxId).catch(() => {}));
    }
    return ok(null);
  });
}

// Members act on a report: hide the testimonial, delete it, or dismiss the report. Every member can; it's logged.
export async function resolveReport(spaceId: string, reportId: string, action: "hide" | "delete" | "dismiss"): Promise<Result> {
  return guard(async () => {
    const user = await actionUser();
    await limitUser(user.id);
    const space = await getOwnedSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    if (!ID_RE.test(String(reportId)) || !["hide", "delete", "dismiss"].includes(action)) return fail("Not found");
    const report = await one<{ testimonial_id: string }>(
      "select testimonial_id from reports where id = $1 and space_id = $2 and resolved_at is null",
      [reportId, spaceId],
    );
    if (!report) return fail("Already handled");
    const id = report.testimonial_id;
    if (action === "delete") {
      await removeTestimonials(spaceId, [id]);
    } else {
      const resolution = action === "hide" ? "hidden" : "dismissed";
      // Every open report on the testimonial is answered by hiding it; dismissing answers just this one.
      await q(
        `update reports set resolved_at = now(), resolution = $3, resolved_by = $4
         where space_id = $1 and resolved_at is null and ${action === "hide" ? "testimonial_id = $2" : "id = $2"}`,
        [spaceId, action === "hide" ? id : reportId, resolution, user.id],
      );
      if (action === "hide") {
        const rows = await q<Testimonial>(
          "update testimonials set status = 'hidden', updated_at = now() where id = $1 and space_id = $2 returning *",
          [id, spaceId],
        );
        await refreshWidgets(spaceId);
        await emitTestimonialEvent(spaceId, "testimonial.updated", rows);
      }
    }
    await audit({ spaceId, actorId: user.id, action: "report.resolve", target: id, detail: { action } });
    return ok(null);
  });
}
