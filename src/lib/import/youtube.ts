import "server-only";
import { getJson } from "./http";
import { clip } from "./parse";
import { GoneError, ImportError, type Importer } from "./types";

// A YouTube video link becomes one testimonial through YouTube's oEmbed endpoint (no key): the title, the channel
// and the link. No thumbnail copy (YouTube's policies don't allow storing copies). Looked up again every week
// (src/lib/import/recheck.ts), and removed once the video is gone.

export function parseYouTube(input: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    let video = "";
    if (host === "youtu.be") video = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com")
      video = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? "";
    return /^[\w-]{11}$/.test(video) ? video : null;
  } catch {
    return null;
  }
}

export const youtube: Importer = {
  id: "youtube",
  async fetch(input) {
    const video = parseYouTube(input);
    if (!video) throw new ImportError("Use a link to a YouTube video");
    const watch = `https://www.youtube.com/watch?v=${video}`;
    const meta = await getJson<{ title?: string; author_name?: string; author_url?: string }>(
      "YouTube",
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      { gone: [401, 403, 404, 410] },
    ).catch((error) => {
      if (error instanceof GoneError) throw new GoneError("Video not found, or it's private");
      throw error;
    });
    return {
      label: clip(meta.title, 80) || "YouTube video",
      input: watch,
      pick: "first",
      note: "Removed here if the video is deleted",
      items: [
        {
          url: watch,
          name: clip(meta.author_name, 80) || "YouTube",
          handle: meta.author_url?.match(/youtube\.com\/@([\w.-]+)/)?.[1] ?? null,
          text: clip(meta.title, 3000),
          rating: null,
          date: null,
        },
      ],
    };
  },
};
