import "server-only";
import { getJson } from "./http";
import { clip, httpsOrNull } from "./parse";
import { ImportError, type Importer } from "./types";

// A TikTok post through TikTok's oEmbed (no key): caption, author and the cover image.

export function parseTikTok(input: string): string | null {
  const m = input.match(/^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@([\w.-]+)\/(?:video|photo)\/(\d{8,25})/i);
  if (m) return `https://www.tiktok.com/@${m[1]}/video/${m[2]}`;
  const short = input.match(/^(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/([\w-]{5,20})/i);
  return short ? `https://vm.tiktok.com/${short[1]}/` : null;
}

export const tiktok: Importer = {
  id: "tiktok",
  async fetch(input) {
    const url = parseTikTok(input);
    if (!url) throw new ImportError("Use a link to a TikTok post");
    const data = await getJson<{ title?: string; author_name?: string; author_unique_id?: string; thumbnail_url?: string }>(
      "TikTok",
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    );
    if (!data.author_name && !data.title) throw new ImportError("Post not found, or it's private");
    return {
      label: clip(data.author_name ?? "", 80) || "TikTok",
      input: url,
      pick: "first",
      items: [
        {
          url,
          name: clip(data.author_name, 80) || "TikTok user",
          handle: data.author_unique_id ?? null,
          text: clip(data.title, 3000),
          rating: null,
          date: null,
          imageUrl: httpsOrNull(data.thumbnail_url),
        },
      ],
    };
  },
};
