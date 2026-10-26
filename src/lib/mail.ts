import "server-only";
import { env } from "@/lib/env";
import { esc } from "@/lib/escape";
import { mailDriver } from "@/lib/mail-driver";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Optional: where replies go, the sender's display name (the address stays MAIL_FROM), extra headers.
  replyTo?: string | null;
  fromName?: string | null;
  headers?: Record<string, string> | null;
};

const driver = () => mailDriver(process.env);

function from() {
  const raw = process.env.MAIL_FROM || "Lovewall <hello@localhost>";
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || "Lovewall", address: m[2] } : { name: "Lovewall", address: raw.trim() };
}

async function viaZepto(mail: Mail) {
  const key = (process.env.ZEPTOMAIL_API_KEY ?? "").trim();
  if (!key) throw new Error("Missing env ZEPTOMAIL_API_KEY");
  const sender = from();
  const name = mail.fromName || sender.name;
  const res = await fetch(process.env.ZEPTOMAIL_URL || "https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: key.startsWith("Zoho-enczapikey ") ? key : `Zoho-enczapikey ${key}`,
    },
    body: JSON.stringify({
      from: { address: sender.address, name },
      to: [{ email_address: { address: mail.to } }],
      ...(mail.replyTo ? { reply_to: [{ address: mail.replyTo }] } : {}),
      ...(mail.headers ? { mime_headers: mail.headers } : {}),
      subject: mail.subject,
      htmlbody: mail.html,
      textbody: mail.text,
      track_opens: false,
      track_clicks: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ZeptoMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

type Transport = { sendMail: (m: Record<string, unknown>) => Promise<unknown> };
let transport: Transport | null = null;

async function viaSmtp(mail: Mail) {
  if (!transport) {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    }) as Transport;
  }
  const sender = from();
  await transport.sendMail({
    from: { name: mail.fromName || sender.name, address: sender.address },
    to: mail.to,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    ...(mail.headers ? { headers: mail.headers } : {}),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

// Sends one mail, retrying twice on transient failures (a busy SMTP server, a network blip, a 5xx).
export async function sendMail(mail: Mail) {
  const d = driver();
  if (d === "log") {
    // No provider configured: print it (local development and first self-host runs).
    console.info(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
    return;
  }
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return d === "zeptomail" ? await viaZepto(mail) : await viaSmtp(mail);
    } catch (error) {
      last = error;
      if (/ZeptoMail 4\d\d/.test(String((error as Error).message))) break; // our request is wrong: retrying won't help
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1) ** 2));
    }
  }
  throw last;
}

// ---------- Templates (monochrome, table layout for mail clients). Every dynamic value goes through esc(). ----------

function layout(inner: string, preheader: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border:1px solid #e6e5e1;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:28px;height:28px;background:#1d1d1f;border-radius:8px;text-align:center;vertical-align:middle;color:#fff;font-size:15px;line-height:28px">&#9829;</td>
<td style="padding-left:8px;font-size:15px;font-weight:600;letter-spacing:-0.01em">Lovewall</td></tr></table></td></tr>
${inner}
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8e8e93">Lovewall · open source</p>
</td></tr></table></body></html>`;
}

export function codeMail(to: string, code: string): Mail {
  const inner = `<tr><td style="padding:24px 32px 4px;font-size:15px;color:#6e6e73">Your sign-in code</td></tr>
<tr><td style="padding:0 32px 20px;font-size:36px;font-weight:700;letter-spacing:8px;font-variant-numeric:tabular-nums">${esc(code)}</td></tr>
<tr><td style="padding:0 32px 30px;font-size:13px;color:#8e8e93">It works for 10 minutes. Didn't ask for it? Ignore this email.</td></tr>`;
  return {
    to,
    subject: `${code} is your Lovewall code`,
    html: layout(inner, `Your code: ${code}`),
    text: `Your Lovewall sign-in code: ${code}\n\nIt works for 10 minutes. Didn't ask for it? Ignore this email.`,
  };
}

export function newTestimonialMail(opts: {
  to: string;
  space: string;
  name: string;
  text: string;
  rating: number | null;
  video: boolean;
  url: string;
}): Mail {
  const stars = opts.rating ? "★".repeat(opts.rating) + "☆".repeat(5 - opts.rating) : "";
  const excerpt = opts.text.length > 600 ? `${opts.text.slice(0, 600)}…` : opts.text;
  const inner = `<tr><td style="padding:24px 32px 6px;font-size:13px;color:#6e6e73">New testimonial · ${esc(opts.space)}</td></tr>
${stars ? `<tr><td style="padding:0 32px 6px;font-size:16px;letter-spacing:2px">${esc(stars)}</td></tr>` : ""}
${excerpt ? `<tr><td style="padding:0 32px 10px;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(excerpt)}</td></tr>` : ""}
${opts.video ? `<tr><td style="padding:0 32px 10px;font-size:14px;color:#6e6e73">Includes a video</td></tr>` : ""}
<tr><td style="padding:0 32px 22px;font-size:14px;font-weight:600">${esc(opts.name)}</td></tr>
<tr><td style="padding:0 32px 30px"><a href="${esc(opts.url)}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border-radius:8px">Review</a></td></tr>`;
  return {
    to: opts.to,
    subject: `New testimonial from ${opts.name.slice(0, 60)}`,
    html: layout(inner, `${opts.name}: ${excerpt.slice(0, 90)}`),
    text: `New testimonial for ${opts.space}\n\n${stars ? `${stars}\n` : ""}${excerpt}\n${opts.video ? "Includes a video\n" : ""}\n— ${opts.name}\n\nReview: ${opts.url}`,
  };
}

export function mentionsDigestMail(opts: {
  to: string;
  space: string;
  items: { author: string; title: string; text: string; url: string }[];
  url: string;
}): Mail {
  const shown = opts.items.slice(0, 10);
  const excerpt = (t: string) => (t.length > 220 ? `${t.slice(0, 220)}…` : t);
  const rows = shown
    .map(
      (m) => `<tr><td style="padding:0 32px 16px"><div style="font-size:13px;color:#6e6e73">Hacker News · ${esc(m.author)}</div>
<div style="font-size:15px;line-height:1.5;white-space:pre-wrap"><a href="${esc(m.url)}" style="color:#1d1d1f;text-decoration:none">${esc(excerpt(m.text || m.title))}</a></div></td></tr>`,
    )
    .join("\n");
  const more = opts.items.length - shown.length;
  const count = `${opts.items.length} new ${opts.items.length === 1 ? "mention" : "mentions"}`;
  const inner = `<tr><td style="padding:24px 32px 14px;font-size:13px;color:#6e6e73">${esc(count)} · ${esc(opts.space)}</td></tr>
${rows}
${more > 0 ? `<tr><td style="padding:0 32px 14px;font-size:14px;color:#6e6e73">And ${more} more</td></tr>` : ""}
<tr><td style="padding:4px 32px 30px"><a href="${esc(opts.url)}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border-radius:8px">Review</a></td></tr>`;
  return {
    to: opts.to,
    subject: `${count} of ${opts.space.slice(0, 60)}`,
    html: layout(inner, `${count} on Hacker News`),
    text: `${count} for ${opts.space}\n\n${shown.map((m) => `Hacker News · ${m.author}\n${excerpt(m.text || m.title)}\n${m.url}`).join("\n\n")}${more > 0 ? `\n\nAnd ${more} more` : ""}\n\nReview: ${opts.url}`,
  };
}

export const appLink = (path: string) => `${env.appUrl}${path}`;

// A team invite: someone asks you to join their space.
export function teamInviteMail(opts: { to: string; space: string; from: string; url: string }): Mail {
  const inner = `<tr><td style="padding:24px 32px 18px;font-size:16px;line-height:1.5">${esc(opts.from)} invited you to <strong style="font-weight:600">${esc(opts.space)}</strong> on Lovewall.</td></tr>
<tr><td style="padding:0 32px 22px"><a href="${esc(opts.url)}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border-radius:8px">Join ${esc(opts.space)}</a></td></tr>
<tr><td style="padding:0 32px 30px;font-size:13px;color:#8e8e93">Sign in with this email address to join. The link works for 7 days.</td></tr>`;
  return {
    to: opts.to,
    subject: `${opts.from.slice(0, 60)} invited you to ${opts.space.slice(0, 60)}`,
    html: layout(inner, `Join ${opts.space} on Lovewall`),
    text: `${opts.from} invited you to ${opts.space} on Lovewall.\n\nJoin: ${opts.url}\n\nSign in with this email address to join. The link works for 7 days.`,
  };
}

// ---------- Collect: invites, rewards, replies (sent in a space's name; the address stays MAIL_FROM) ----------

// A space's own mail: its name on top instead of Lovewall's, and an optional unsubscribe line in the footer.
export function spaceLayout(inner: string, preheader: string, space: string, footer = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e6e5e1;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 32px 0;font-size:15px;font-weight:600;letter-spacing:-0.01em">${esc(space)}</td></tr>
${inner}
</table>
${footer}
</td></tr></table></body></html>`;
}

export const button = (url: string, label: string) =>
  `<a href="${esc(url)}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:8px">${esc(label)}</a>`;

export function inviteMail(opts: {
  to: string;
  space: string;
  subject: string;
  message: string;
  url: string;
  // The open pixel (null when invite tracking is off: LEGAL.inviteTracking).
  pixelUrl: string | null;
  unsubscribeUrl: string;
  oneClickUrl: string;
  replyTo: string | null;
  buttonLabel: string;
  unsubscribeLabel: string;
  // "Sent by Acme via Lovewall", and the sender's postal address when they gave one (anti-spam laws).
  footerLine: string;
  address: string | null;
}): Mail {
  const inner = `<tr><td style="padding:18px 32px 22px;font-size:16px;line-height:1.55;white-space:pre-wrap">${esc(opts.message)}</td></tr>
<tr><td style="padding:0 32px 32px">${button(opts.url, opts.buttonLabel)}</td></tr>`;
  const footer = `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8e8e93">${esc(opts.footerLine)} · <a href="${esc(opts.unsubscribeUrl)}" style="color:#8e8e93">${esc(opts.unsubscribeLabel)}</a></p>
${opts.address ? `<p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#8e8e93;white-space:pre-line">${esc(opts.address)}</p>` : ""}
${opts.pixelUrl ? `<img src="${esc(opts.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : ""}`;
  return {
    to: opts.to,
    subject: opts.subject,
    html: spaceLayout(inner, opts.message.slice(0, 90), opts.space, footer),
    text: `${opts.message}\n\n${opts.buttonLabel}: ${opts.url}\n\n--\n${opts.footerLine}\n${opts.address ? `${opts.address}\n` : ""}${opts.unsubscribeLabel}: ${opts.unsubscribeUrl}`,
    replyTo: opts.replyTo,
    fromName: opts.space.slice(0, 60),
    headers: { "List-Unsubscribe": `<${opts.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export function rewardMail(opts: {
  to: string;
  space: string;
  subject: string;
  intro: string;
  kind: "code" | "link";
  value: string;
  label: string;
}): Mail {
  const body =
    opts.kind === "code"
      ? `<tr><td style="padding:0 32px 30px"><span style="display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:600;letter-spacing:1px;padding:10px 16px;border:1px dashed #c7c6c1;border-radius:8px">${esc(opts.value)}</span>${opts.label ? `<div style="padding-top:8px;font-size:14px;color:#6e6e73">${esc(opts.label)}</div>` : ""}</td></tr>`
      : `<tr><td style="padding:0 32px 30px">${button(opts.value, opts.label || opts.value)}</td></tr>`;
  return {
    to: opts.to,
    subject: opts.subject,
    html: spaceLayout(
      `<tr><td style="padding:18px 32px 14px;font-size:16px;line-height:1.5">${esc(opts.intro)}</td></tr>${body}`,
      opts.intro,
      opts.space,
    ),
    text: `${opts.intro}\n\n${opts.kind === "code" ? opts.value : `${opts.label ? `${opts.label}: ` : ""}${opts.value}`}${opts.kind === "code" && opts.label ? `\n${opts.label}` : ""}`,
    fromName: opts.space.slice(0, 60),
  };
}

export function replyMail(opts: { to: string; space: string; message: string; quote: string; replyTo: string; senderName: string }): Mail {
  const quote = opts.quote.length > 400 ? `${opts.quote.slice(0, 400)}…` : opts.quote;
  const inner = `<tr><td style="padding:18px 32px 18px;font-size:16px;line-height:1.55;white-space:pre-wrap">${esc(opts.message)}</td></tr>
${quote ? `<tr><td style="padding:0 32px 30px"><div style="border-left:2px solid #e6e5e1;padding-left:12px;font-size:14px;line-height:1.5;color:#6e6e73;white-space:pre-wrap">${esc(quote)}</div></td></tr>` : ""}`;
  return {
    to: opts.to,
    subject: `Re: your testimonial for ${opts.space.slice(0, 60)}`,
    html: spaceLayout(inner, opts.message.slice(0, 90), opts.space),
    text: `${opts.message}${quote ? `\n\n> ${quote.replace(/\n/g, "\n> ")}` : ""}`,
    replyTo: opts.replyTo,
    fromName: (opts.senderName ? `${opts.senderName} · ${opts.space}` : opts.space).slice(0, 80),
  };
}

export function npsMail(opts: { to: string; space: string; score: number; comment: string; url: string }): Mail {
  const excerpt = opts.comment.length > 600 ? `${opts.comment.slice(0, 600)}…` : opts.comment;
  const inner = `<tr><td style="padding:24px 32px 6px;font-size:13px;color:#6e6e73">New NPS answer · ${esc(opts.space)}</td></tr>
<tr><td style="padding:0 32px 8px;font-size:28px;font-weight:600;font-variant-numeric:tabular-nums">${opts.score}<span style="font-size:15px;color:#8e8e93">/10</span></td></tr>
${excerpt ? `<tr><td style="padding:0 32px 18px;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(excerpt)}</td></tr>` : ""}
<tr><td style="padding:0 32px 30px">${button(opts.url, "Results")}</td></tr>`;
  return {
    to: opts.to,
    subject: `New NPS answer: ${opts.score}/10`,
    html: layout(inner, `${opts.score}/10 ${excerpt.slice(0, 80)}`),
    text: `New NPS answer for ${opts.space}: ${opts.score}/10\n\n${excerpt}\n\nResults: ${opts.url}`,
  };
}
