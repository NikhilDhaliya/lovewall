import "server-only";
import { parseOembedHtml } from "@/lib/oembed";
import { safeFetch } from "@/lib/safe-fetch";

// Imports a post from X with the free oEmbed endpoint (no key): text, author, handle, date. The avatar comes
// best-effort from X's public syndication endpoint; if that fails the testimonial keeps the default avatar.

export const TWEET_RE =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:[/?#].*)?$/i;

export type Tweet = { url: string; name: string; handle: string; text: string; date: string | null; avatarUrl: string | null };

export class ImportError extends Error {}

function syndicationToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export async function fetchTweet(input: string): Promise<Tweet> {
  const m = input.trim().match(TWEET_RE);
  if (!m) throw new ImportError("That isn't a link to a post on X");
  const [, user, id] = m;
  const canonical = `https://x.com/${user}/status/${id}`;
  // The endpoint is operator config (tests point it at a local mock), never user input.
  const endpoint = process.env.X_OEMBED_ENDPOINT || "https://publish.x.com/oembed";
  const trusted = Boolean(process.env.X_OEMBED_ENDPOINT);
  const res = await safeFetch(`${endpoint}?url=${encodeURIComponent(`https://twitter.com/${user}/status/${id}`)}&omit_script=1&dnt=true`, {
    accept: "application/json",
    maxBytes: 256 * 1024,
    timeoutMs: 8000,
    trusted,
  }).catch(() => {
    throw new ImportError("Couldn't reach X. Try again.");
  });
  if (res.status === 404 || res.status === 403) throw new ImportError("Post not found, or it's private");
  if (res.status !== 200) throw new ImportError("X didn't answer. Try again.");
  let data: { author_name?: string; author_url?: string; html?: string };
  try {
    data = JSON.parse(res.body.toString("utf8"));
  } catch {
    throw new ImportError("X sent something unexpected");
  }
  const { text, date } = parseOembedHtml(String(data.html ?? ""));
  const handle = String(data.author_url ?? "").match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i)?.[1] ?? user;
  const tweet: Tweet = { url: canonical, name: String(data.author_name || handle).slice(0, 80), handle, text, date, avatarUrl: null };

  if (!trusted || process.env.X_SYNDICATION_ENDPOINT) {
    try {
      const synd = process.env.X_SYNDICATION_ENDPOINT || "https://cdn.syndication.twimg.com/tweet-result";
      const r = await safeFetch(`${synd}?id=${id}&lang=en&token=${syndicationToken(id)}`, {
        accept: "application/json",
        maxBytes: 512 * 1024,
        timeoutMs: 5000,
        trusted: Boolean(process.env.X_SYNDICATION_ENDPOINT),
      });
      if (r.status === 200) {
        const j = JSON.parse(r.body.toString("utf8")) as { user?: { profile_image_url_https?: string }; created_at?: string };
        const img = j.user?.profile_image_url_https;
        if (img && /^https:\/\/pbs\.twimg\.com\//.test(img)) tweet.avatarUrl = img.replace(/_normal(\.\w+)$/, "_200x200$1");
        if (!tweet.date && j.created_at && !Number.isNaN(Date.parse(j.created_at))) tweet.date = new Date(j.created_at).toISOString();
      }
    } catch {
      // Best effort only.
    }
  }
  return tweet;
}
