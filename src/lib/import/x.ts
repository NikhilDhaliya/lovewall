import "server-only";
import { fetchTweet, ImportError as XImportError } from "@/lib/x-import";
import { ImportError, type Importer } from "./types";

// X keeps its own import (oEmbed + syndication avatar, src/lib/x-import.ts); this adapts it to the shared shape.
export const x: Importer = {
  id: "x",
  async fetch(input) {
    try {
      const t = await fetchTweet(input.slice(0, 500));
      if (!t.text) throw new ImportError("That post has no text");
      return {
        label: t.name,
        input: t.url,
        pick: "first",
        items: [
          { url: t.url, name: t.name, handle: t.handle, text: t.text.slice(0, 3000), rating: null, date: t.date, avatarUrl: t.avatarUrl },
        ],
      };
    } catch (error) {
      if (error instanceof XImportError) throw new ImportError(error.message);
      throw error;
    }
  },
};
