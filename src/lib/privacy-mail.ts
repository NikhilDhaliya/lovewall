import "server-only";
import { esc } from "@/lib/escape";
import type { CollectDict } from "@/lib/i18n/collect/en";
import { t } from "@/lib/i18n/collect/languages";
import { LEGAL, legalEnabled } from "@/lib/legal/config";
import { appLink, button, spaceLayout, type Mail } from "@/lib/mail";
import { createGiverLink } from "@/lib/privacy";

// Mails about personal data: the giver's receipt (with their private link), a report to the space, and the
// confirmation that an account is gone.

const small = "margin:16px 0 0;font-size:12px;line-height:1.5;color:#8e8e93";

// Sent to the giver right after they submit, in the form's language. Transactional: no unsubscribe needed.
export function receiptMail(opts: { to: string; space: string; url: string; dict: CollectDict }): Mail {
  const { dict } = opts;
  const intro = dict.mailReceiptIntro;
  const privacy = legalEnabled() ? appLink("/legal/privacy") : null;
  const inner = `<tr><td style="padding:18px 32px 20px;font-size:16px;line-height:1.55">${esc(intro)}</td></tr>
<tr><td style="padding:0 32px 22px">${button(opts.url, dict.mailReceiptButton)}</td></tr>
<tr><td style="padding:0 32px 30px;font-size:13px;line-height:1.5;color:#8e8e93">${esc(dict.mailReceiptNote)}</td></tr>`;
  const footerLine = t(dict, "mailFooter", { space: opts.space });
  const footer = `<p style="${small}">${esc(footerLine)}${privacy ? ` · <a href="${esc(privacy)}" style="color:#8e8e93">${esc(dict.privacy)}</a>` : ""}</p>`;
  return {
    to: opts.to,
    subject: t(dict, "mailReceiptSubject", { space: opts.space.slice(0, 60) }),
    html: spaceLayout(inner, intro, opts.space, footer),
    text: `${intro}\n\n${dict.mailReceiptButton}: ${opts.url}\n\n${dict.mailReceiptNote}\n\n--\n${footerLine}${privacy ? `\n${dict.privacy}: ${privacy}` : ""}`,
    fromName: opts.space.slice(0, 60),
  };
}

const REASONS: Record<string, string> = {
  me: "It’s about me and I want it removed",
  false: "False or misleading",
  offensive: "Offensive",
  other: "Something else",
};
export const reportReason = (reason: string) => REASONS[reason] ?? REASONS.other;

// To the space owner: someone reported a published testimonial.
export function reportMail(opts: { to: string; space: string; name: string; reason: string; details: string; url: string }): Mail {
  const details = opts.details.length > 600 ? `${opts.details.slice(0, 600)}…` : opts.details;
  const inner = `<tr><td style="padding:24px 32px 6px;font-size:13px;color:#6e6e73">New report · ${esc(opts.space)}</td></tr>
<tr><td style="padding:0 32px 8px;font-size:16px;line-height:1.5"><strong style="font-weight:600">${esc(reportReason(opts.reason))}</strong> · ${esc(opts.name)}</td></tr>
${details ? `<tr><td style="padding:0 32px 18px;font-size:15px;line-height:1.5;color:#3a3a3c;white-space:pre-wrap">${esc(details)}</td></tr>` : ""}
<tr><td style="padding:4px 32px 30px">${button(opts.url, "Review")}</td></tr>`;
  return {
    to: opts.to,
    subject: `A testimonial was reported: ${opts.name.slice(0, 60)}`,
    html: spaceLayout(inner, reportReason(opts.reason), "Lovewall"),
    text: `New report for ${opts.space}\n\n${reportReason(opts.reason)} · ${opts.name}\n${details ? `\n${details}\n` : ""}\nReview: ${opts.url}`,
  };
}

// The last mail an account gets.
export function accountDeletedMail(opts: { to: string; spaces: number }): Mail {
  const what =
    opts.spaces > 0
      ? `Your account and ${opts.spaces === 1 ? "your space" : `your ${opts.spaces} spaces`}, with their testimonials, widgets and files, are deleted.`
      : "Your account is deleted.";
  const hosted = legalEnabled();
  const note = hosted
    ? `Backups are overwritten within ${LEGAL.retention.deletedAccountDays} days. Didn’t do this? Reply to this email.`
    : "Didn’t do this? Reply to this email.";
  const inner = `<tr><td style="padding:24px 32px 12px;font-size:16px;line-height:1.55">${esc(what)}</td></tr>
<tr><td style="padding:0 32px 30px;font-size:13px;line-height:1.5;color:#8e8e93">${esc(note)}</td></tr>`;
  return {
    to: opts.to,
    subject: "Your Lovewall account is deleted",
    html: spaceLayout(inner, what, "Lovewall"),
    text: `${what}\n\n${note}`,
    replyTo: (hosted && LEGAL.contact.privacy) || null,
  };
}

// The receipt with a fresh private link (one per testimonial).
export async function giverReceipt(opts: { testimonialId: string; to: string; space: string; dict: CollectDict }): Promise<Mail> {
  const token = await createGiverLink(opts.testimonialId);
  return receiptMail({ to: opts.to, space: opts.space, url: appLink(`/t/${token}`), dict: opts.dict });
}
