import "server-only";
import { getJson } from "./http";
import { clip, htmlText, isoDate } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// A Hacker News story or comment through the Algolia HN API (free, no key): the item and the replies under it.

type Item = {
  id?: number;
  author?: string | null;
  title?: string | null;
  text?: string | null;
  type?: string;
  created_at?: string;
  children?: Item[];
};

export function parseHackerNews(input: string): string | null {
  return input.match(/news\.ycombinator\.com\/item\?(?:[^#]*&)?id=(\d{1,12})/i)?.[1] ?? null;
}

const toFound = (i: Item, text: string): Found => ({
  url: `https://news.ycombinator.com/item?id=${i.id}`,
  name: clip(i.author, 80) || "HN user",
  handle: i.author ?? null,
  text: clip(text, 3000),
  rating: null,
  date: isoDate(i.created_at),
});

export function hackerNewsItems(root: Item): { label: string; items: Found[] } {
  const items: Found[] = [];
  const add = (i: Item) => {
    if (items.length >= 150 || !i.id || !i.author) return;
    const text = htmlText(i.text ?? "") || (i.type === "story" ? htmlText(i.title ?? "") : "");
    if (text) items.push(toFound(i, i.type === "story" && i.text ? `${htmlText(i.title ?? "")}\n\n${text}` : text));
  };
  add(root);
  // Breadth first: direct replies before deep threads.
  const queue = [...(root.children ?? [])];
  while (queue.length && items.length < 150) {
    const next = queue.shift()!;
    add(next);
    queue.push(...(next.children ?? []));
  }
  return { label: clip(htmlText(root.title ?? ""), 80) || "Hacker News", items };
}

export const hackernews: Importer = {
  id: "hackernews",
  async fetch(input) {
    const id = parseHackerNews(input);
    if (!id) throw new ImportError("Use a link like news.ycombinator.com/item?id=…");
    const root = await getJson<Item>("Hacker News", `https://hn.algolia.com/api/v1/items/${id}`);
    const found = hackerNewsItems(root);
    return {
      label: found.label,
      input: `https://news.ycombinator.com/item?id=${id}`,
      items: found.items,
      pick: root.type === "comment" ? "first" : "none",
    };
  },
};
