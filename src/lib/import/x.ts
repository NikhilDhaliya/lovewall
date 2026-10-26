import "server-only";
import { parseOembedHtml } from "@/lib/oembed";
import { safeFetch } from "@/lib/safe-fetch";
import { GoneError, ImportError, type Importer } from "./types";

// A post on X through X's oEmbed endpoint (no key): text, author, handle, date and the link. No photo: the owner can
// add one. Looked up again every week (src/lib/import/recheck.ts): X's developer policy asks that deleted posts go.

const TWEET_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:[/?#].*)?$/i;

export const x: Importer = {
  id: "x",
  async fetch(input) {
    const m = input.trim().slice(0, 500).match(TWEET_RE);
    if (!m) throw new ImportError("That isn't a link to a post on X");
    const [, user, id] = m;
    const url = `https://x.com/${user}/status/${id}`;
    // The endpoint is operator config (tests point it at a local mock), never user input.
    const endpoint = process.env.X_OEMBED_ENDPOINT || "https://publish.x.com/oembed";
    const res = await safeFetch(
      `${endpoint}?url=${encodeURIComponent(`https://twitter.com/${user}/status/${id}`)}&omit_script=1&dnt=true`,
      {
        accept: "application/json",
        maxBytes: 256 * 1024,
        timeoutMs: 8000,
        trusted: Boolean(process.env.X_OEMBED_ENDPOINT),
      },
    ).catch(() => {
      throw new ImportError("Couldn't reach X. Try again.");
    });
    if (res.status === 404 || res.status === 403) throw new GoneError("Post not found, or it's private");
    if (res.status !== 200) throw new ImportError("X didn't answer. Try again.");
    let data: { author_name?: string; author_url?: string; html?: string };
    try {
      data = JSON.parse(res.body.toString("utf8"));
    } catch {
      throw new ImportError("X sent something unexpected");
    }
    const { text, date } = parseOembedHtml(String(data.html ?? ""));
    if (!text) throw new ImportError("That post has no text");
    const handle = String(data.author_url ?? "").match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i)?.[1] ?? user;
    const name = String(data.author_name || handle).slice(0, 80);
    return {
      label: name,
      input: url,
      pick: "first",
      note: "Removed here if the post is deleted",
      items: [{ url, name, handle, text: text.slice(0, 3000), rating: null, date }],
    };
  },
};
