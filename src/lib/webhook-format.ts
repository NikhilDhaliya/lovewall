import { createHmac } from "node:crypto";
import { isPrivateAddress } from "@/lib/net";

// The pure parts of webhooks (no database, no env): signing, target checks, chat message formats.

export type Payload = { type: string; timestamp: string; data: unknown };

export function sign(secret: string, id: string, timestamp: number, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

// A webhook target: https (http only when private targets are allowed), no credentials, standard ports, and no
// obviously internal host. DNS answers are checked again at delivery time by safe-fetch.
export function checkTarget(input: string, open: boolean): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "Not a valid link";
  }
  if (url.protocol !== "https:" && !(open && url.protocol === "http:")) return "Use an https link";
  if (url.username || url.password) return "No passwords in the link";
  if (open) return null;
  if (url.port && url.port !== "443") return "Use the standard https port";
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || !host.includes("."))
    return "Use a public address";
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) return "Use a public address";
  }
  return null;
}

// Slack and Discord hooks get unsigned posts, so they may only point at Slack's and Discord's own webhook hosts
// (any host when private targets are allowed: self-hosted chat, tests).
export function checkChatTarget(kind: "slack" | "discord", input: string, open: boolean): string | null {
  if (open) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "Not a valid link";
  }
  const host = url.hostname.toLowerCase();
  const ok =
    kind === "slack"
      ? host === "hooks.slack.com" && url.pathname.startsWith("/services/")
      : ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"].includes(host) &&
        url.pathname.startsWith("/api/webhooks/");
  return ok ? null : kind === "slack" ? "Use a Slack webhook link (hooks.slack.com)" : "Use a Discord webhook link";
}

// Slack and Discord URLs are credentials: the UI only ever sees this.
export function maskUrl(url: string) {
  try {
    const u = new URL(url);
    const first = u.pathname.split("/").filter(Boolean)[0];
    return `${u.host}${first ? `/${first}` : ""}/…`;
  } catch {
    return "…";
  }
}

const stars = (rating: unknown) =>
  typeof rating === "number" && rating >= 1 && rating <= 5 ? "★".repeat(rating) + "☆".repeat(5 - rating) : "";
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const slackEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const discordEsc = (s: string) => s.replace(/([\\*_~`|[\]()>#<@-])/g, "\\$1");

type Item = { name?: string; title?: string | null; company?: string | null; text?: string; rating?: number | null; inbox_url?: string };

function who(t: Item) {
  return [t.title, t.company].filter(Boolean).join(", ");
}

export function slackMessage(payload: Payload, space: string) {
  const d = (payload.data ?? {}) as Item & { count?: number };
  if (payload.type === "webhook.test") {
    return { text: `Lovewall is connected. New testimonials for ${slackEsc(space)} will show up here.` };
  }
  if (typeof d.count === "number") {
    return {
      text: `${d.count} new testimonials · ${slackEsc(space)}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${d.count} new testimonials* · ${slackEsc(space)}` } },
        { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open inbox" }, url: d.inbox_url }] },
      ],
    };
  }
  const name = slackEsc(String(d.name ?? "Someone"));
  const quote = clip(String(d.text ?? ""), 600)
    .split("\n")
    .map((line) => `>${slackEsc(line)}`)
    .join("\n");
  const byline = `— *${name}*${who(d) ? `, ${slackEsc(who(d))}` : ""}`;
  return {
    text: `New testimonial from ${name}${d.rating ? ` (${d.rating}/5)` : ""}`,
    unfurl_links: false,
    blocks: [
      { type: "context", elements: [{ type: "mrkdwn", text: `New testimonial · ${slackEsc(space)}` }] },
      { type: "section", text: { type: "mrkdwn", text: [stars(d.rating), quote, byline].filter(Boolean).join("\n") } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open inbox" }, url: d.inbox_url }] },
    ],
  };
}

export function discordMessage(payload: Payload, space: string) {
  const d = (payload.data ?? {}) as Item & { count?: number };
  const base = { username: "Lovewall", allowed_mentions: { parse: [] as string[] } };
  if (payload.type === "webhook.test") {
    return { ...base, content: `Lovewall is connected. New testimonials for ${discordEsc(space)} will show up here.` };
  }
  if (typeof d.count === "number") {
    return { ...base, embeds: [{ title: clip(`${d.count} new testimonials · ${space}`, 250), url: d.inbox_url, color: 0x1c1c1b }] };
  }
  return {
    ...base,
    embeds: [
      {
        title: clip(`New testimonial · ${space}`, 250),
        url: d.inbox_url,
        description: [stars(d.rating), discordEsc(clip(String(d.text ?? ""), 1500))].filter(Boolean).join("\n"),
        author: { name: clip([d.name ?? "Someone", who(d)].filter(Boolean).join(" · "), 250) },
        color: 0x1c1c1b,
      },
    ],
  };
}
