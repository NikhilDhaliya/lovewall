import "server-only";
import { getJson } from "./http";
import { clip } from "./parse";
import { GoneError, ImportError, type Importer } from "./types";

// A TikTok post through TikTok's oEmbed endpoint (no key): caption, author and the link. No cover image copy. Looked
// up again every week (src/lib/import/recheck.ts), and removed once the post is gone.

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
    const data = await getJson<{ title?: string; author_name?: string; author_unique_id?: string }>(
      "TikTok",
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    ).catch((error) => {
      if (error instanceof GoneError) throw new GoneError("Post not found, or it's private");
      throw error;
    });
    if (!data.author_name && !data.title) throw new GoneError("Post not found, or it's private");
    return {
      label: clip(data.author_name ?? "", 80) || "TikTok",
      input: url,
      pick: "first",
      note: "Removed here if the post is deleted",
      items: [
        {
          url,
          name: clip(data.author_name, 80) || "TikTok user",
          handle: data.author_unique_id ?? null,
          text: clip(data.title, 3000),
          rating: null,
          date: null,
        },
      ],
    };
  },
};
