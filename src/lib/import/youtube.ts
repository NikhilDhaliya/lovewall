import "server-only";
import { importKeys } from "@/lib/env";
import { getJson, request, parseJson } from "./http";
import { clip, htmlText, httpsOrNull, isoDate } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// A YouTube video link becomes one testimonial through oEmbed (title, channel, thumbnail kept as the image; no key).
// With YOUTUBE_API_KEY the video's top comments come too, and a comment link (…&lc=<id>) gives that comment.

export function parseYouTube(input: string): { video: string; comment: string | null } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    let video = "";
    if (host === "youtu.be") video = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com")
      video = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? "";
    if (!/^[\w-]{11}$/.test(video)) return null;
    const comment = u.searchParams.get("lc");
    return { video, comment: comment && /^[\w.-]{10,100}$/.test(comment) ? comment : null };
  } catch {
    return null;
  }
}

type Snippet = {
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
  authorChannelUrl?: string;
  textOriginal?: string;
  textDisplay?: string;
  publishedAt?: string;
};

function commentFound(video: string, id: string, s: Snippet): Found | null {
  const text = clip(htmlText(s.textOriginal ?? s.textDisplay ?? ""), 3000);
  if (!text) return null;
  const name = (s.authorDisplayName ?? "").replace(/^@/, "");
  return {
    url: `https://www.youtube.com/watch?v=${video}&lc=${id}`,
    name: clip(name, 80) || "YouTube user",
    handle: s.authorDisplayName?.startsWith("@") ? s.authorDisplayName.slice(1) : null,
    text,
    rating: null,
    date: isoDate(s.publishedAt),
    avatarUrl: httpsOrNull(s.authorProfileImageUrl),
  };
}

// The Data API takes the key in a header, so it never sits in a URL (or an error message).
async function api<T>(path: string): Promise<T> {
  const res = await request("YouTube", `https://www.googleapis.com/youtube/v3/${path}`, {
    accept: "application/json",
    headers: { "X-Goog-Api-Key": importKeys.youtube },
    raw: true,
  });
  if (res.status === 403 || res.status === 400) throw new ImportError("YouTube refused the request. Check the API key.");
  if (res.status === 404) throw new ImportError("Comments are off for this video");
  if (res.status !== 200) throw new ImportError("YouTube didn't answer. Try again.");
  return parseJson<T>("YouTube", res.body.toString("utf8"));
}

export const youtube: Importer = {
  id: "youtube",
  async fetch(input) {
    const link = parseYouTube(input);
    if (!link) throw new ImportError("Use a link to a YouTube video");
    const watch = `https://www.youtube.com/watch?v=${link.video}`;
    const meta = await getJson<{ title?: string; author_name?: string; author_url?: string; thumbnail_url?: string }>(
      "YouTube",
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    ).catch((error) => {
      if (error instanceof ImportError && /Nothing found/.test(error.message)) throw new ImportError("Video not found, or it's private");
      throw error;
    });
    const items: Found[] = [];
    const comments: Found[] = [];
    if (importKeys.youtube) {
      if (link.comment) {
        const one = await api<{ items?: { id: string; snippet: Snippet }[] }>(
          `comments?part=snippet&textFormat=plainText&id=${link.comment}`,
        );
        for (const c of one.items ?? []) {
          const f = commentFound(link.video, c.id, c.snippet);
          if (f) comments.push(f);
        }
      }
      const threads = await api<{ items?: { id: string; snippet: { topLevelComment: { id: string; snippet: Snippet } } }[] }>(
        `commentThreads?part=snippet&textFormat=plainText&order=relevance&maxResults=50&videoId=${link.video}`,
      ).catch(() => ({ items: [] }));
      for (const t of threads.items ?? []) {
        const c = t.snippet.topLevelComment;
        const f = commentFound(link.video, c.id, c.snippet);
        if (f && !comments.some((x) => x.url === f.url)) comments.push(f);
      }
    }
    const handle = meta.author_url?.match(/youtube\.com\/@([\w.-]+)/)?.[1] ?? null;
    const video: Found = {
      url: watch,
      name: clip(meta.author_name, 80) || "YouTube",
      handle,
      text: clip(meta.title, 3000),
      rating: null,
      date: null,
      imageUrl: httpsOrNull(meta.thumbnail_url),
    };
    if (link.comment && comments[0]?.url.endsWith(`lc=${link.comment}`)) items.push(comments.shift()!, video);
    else items.push(video);
    items.push(...comments);
    return {
      label: clip(meta.title, 80) || "YouTube video",
      input: watch,
      items,
      pick: "first",
      note: importKeys.youtube || !link.comment ? undefined : "Comments need a YouTube API key",
    };
  },
};
