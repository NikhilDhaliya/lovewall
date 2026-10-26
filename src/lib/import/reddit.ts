import "server-only";
import { getJson } from "./http";
import { clip, isoDate } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// A Reddit post or comment link, read through Reddit's .json view: a comment link gives that comment, a post link
// gives the post and its top-level comments. Reddit often refuses servers; the sheet then offers paste or screenshot.

type Thing = { kind?: string; data?: Record<string, unknown> };
type Listing = { data?: { children?: Thing[] } };

export function parseReddit(input: string): { path: string; comment: string | null } | null {
  const s = input.trim();
  const short = s.match(/^(?:https?:\/\/)?redd\.it\/([a-z0-9]{4,12})/i);
  if (short) return { path: `/comments/${short[1].toLowerCase()}`, comment: null };
  const m = s.match(/reddit\.com(\/r\/[A-Za-z0-9_]+)?\/comments\/([a-z0-9]{4,12})(?:\/([^/?#]*))?(?:\/([a-z0-9]{4,12}))?/i);
  if (!m) return null;
  const [, sub = "", post, slug, comment] = m;
  return {
    path: `${sub}/comments/${post.toLowerCase()}${slug ? `/${slug}` : ""}${comment ? `/${comment.toLowerCase()}` : ""}`,
    comment: comment?.toLowerCase() ?? null,
  };
}

const gone = (author: unknown, text: string) => !text || text === "[deleted]" || text === "[removed]" || author === "AutoModerator";

function toFound(d: Record<string, unknown>, text: string): Found {
  const author = String(d.author ?? "");
  return {
    url: `https://www.reddit.com${String(d.permalink ?? "")}`,
    name: clip(author, 80) || "Reddit user",
    handle: author || null,
    text: clip(text, 3000),
    rating: null,
    date: isoDate(Number(d.created_utc)),
  };
}

export function redditItems(data: unknown, comment: string | null): { label: string; items: Found[] } {
  const [postListing, commentListing] = (Array.isArray(data) ? data : []) as Listing[];
  const post = postListing?.data?.children?.[0]?.data ?? {};
  const comments = (commentListing?.data?.children ?? []).filter((c) => c.kind === "t1" && c.data);
  const items: Found[] = [];
  if (!comment) {
    const body = String(post.selftext ?? "").trim();
    const text = body ? `${String(post.title ?? "")}\n\n${body}` : String(post.title ?? "");
    if (post.permalink && !gone(post.author, text)) items.push(toFound(post, text.trim()));
  }
  for (const c of comments.slice(0, 100)) {
    const d = c.data!;
    if (comment && String(d.id ?? "").toLowerCase() !== comment) continue;
    const text = String(d.body ?? "").trim();
    if (d.permalink && !gone(d.author, text)) items.push(toFound(d, text));
  }
  return { label: clip(String(post.title ?? ""), 80) || "Reddit", items };
}

export const reddit: Importer = {
  id: "reddit",
  async fetch(input) {
    const link = parseReddit(input);
    if (!link) throw new ImportError("Use a link to a Reddit post or comment");
    const data = await getJson<unknown>("Reddit", `https://www.reddit.com${link.path}/.json?raw_json=1&limit=100&depth=1`);
    const found = redditItems(data, link.comment);
    return { label: found.label, input: `https://www.reddit.com${link.path}/`, items: found.items, pick: link.comment ? "first" : "none" };
  },
};
