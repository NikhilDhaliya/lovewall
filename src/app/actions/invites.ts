"use server";

import { after } from "next/server";
import { z } from "zod";
import { fail, firstIssue, guard, ok, type Result } from "@/lib/actions";
import { one, q } from "@/lib/db";
import { getForm } from "@/lib/data/forms";
import { getOwnedSpace } from "@/lib/data/spaces";
import { inviteQuota, sendInvites } from "@/lib/invites";
import { flushOne } from "@/lib/outbox";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/privacy";
import { actionUser } from "@/lib/session";

const schema = z.object({
  formId: z.string().regex(/^[0-9A-Za-z]{8,32}$/),
  recipients: z
    .array(z.object({ name: z.string().max(200), email: z.string().max(320) }))
    .min(1, "Add at least one person")
    .max(1000, "Up to 1,000 people at a time"),
  subject: z.string().trim().min(1, "Add a subject").max(150, "Subject: at most 150 characters"),
  message: z.string().trim().min(1, "Add a message").max(3000, "Message: at most 3,000 characters"),
  reminders: z.number().int().min(0).max(2),
  days: z.number().int().min(1).max(30),
});

export type InviteResult = {
  sent: number;
  unsubscribed: number;
  duplicates: number;
  invalid: number;
  overLimit: number;
  today: number;
  max: number;
};

// Sends testimonial requests by email, from the space's name, with Reply-To set to the signed-in user.
export async function sendInviteBatch(spaceId: string, input: z.input<typeof schema>): Promise<Result<InviteResult>> {
  return guard(async () => {
    const user = await actionUser();
    const space = await getOwnedSpace(user.id, spaceId);
    if (!space) return fail("Not found");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const limit = await rateLimit(`invites:send:${user.id}`, 30, 3600);
    if (!limit.ok) return fail("Too many sends. Try again later.");
    const form = await getForm(spaceId, parsed.data.formId);
    if (!form) return fail("Pick a form");
    const address = await one<{ business_address: string | null }>("select business_address from spaces where id = $1", [spaceId]);
    const quota = await inviteQuota(space);
    const report = await sendInvites({
      space: { ...space, business_address: address?.business_address ?? null },
      form,
      recipients: parsed.data.recipients,
      subject: parsed.data.subject,
      message: parsed.data.message,
      reminders: parsed.data.reminders,
      days: parsed.data.days,
      replyTo: user.email,
      room: quota.max - quota.today,
    });
    after(async () => {
      for (const id of report.outbox) await flushOne(id).catch(() => {});
    });
    await audit({ spaceId, actorId: user.id, action: "invites.send", detail: { sent: report.sent } });
    const { outbox: _outbox, ...counts } = report;
    void _outbox;
    return ok({ ...counts, ...(await inviteQuota(space)) });
  });
}

// The space's mailing address (Settings), shown in the footer of invite emails: anti-spam laws such as CAN-SPAM ask
// for the sender's postal address in commercial mail.
export async function saveBusinessAddress(spaceId: string, input: string): Promise<Result<{ address: string }>> {
  return guard(async () => {
    const user = await actionUser();
    if (!(await getOwnedSpace(user.id, spaceId))) return fail("Not found");
    const limit = await rateLimit(`invites:address:${user.id}`, 60, 3600);
    if (!limit.ok) return fail("Too many changes. Try again later.");
    const parsed = z.string().max(1000).safeParse(input);
    if (!parsed.success) return fail("Address: at most 300 characters");
    const address = parsed.data
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (address.length > 300) return fail("Address: at most 300 characters");
    await q("update spaces set business_address = $2 where id = $1", [spaceId, address || null]);
    return ok({ address });
  });
}
