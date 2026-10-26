import type { SourceId } from "@/lib/sources";

// One review or post found on another site, before it becomes a testimonial.
export type Found = {
  // A stable link to this review: stored as source_url, so importing it twice is a no-op.
  url: string;
  name: string;
  text: string;
  rating: number | null;
  date: string | null;
  // The reviewer's role or headline, company and handle, when the site has them.
  title?: string | null;
  company?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  // A picture kept with the testimonial (a video thumbnail).
  imageUrl?: string | null;
};

export type Fetched = {
  // What was found: the business, app, product or post title.
  label: string;
  // The normalized link (or search), stored when the source is kept in sync.
  input: string;
  items: Found[];
  // A short note for the preview ("Google shares 5 reviews at most").
  note?: string;
  // Which items start ticked: all of them (review pages), the first (the linked comment), or none (a long thread).
  pick?: "all" | "first" | "none";
};

// Each source is a module in this folder with this shape. fetch() throws ImportError (shown as is) or BlockedError
// (the site refuses servers: the sheet offers paste or screenshot instead).
export type Importer = {
  id: SourceId;
  fetch(input: string): Promise<Fetched>;
  // Off when its API key is missing.
  enabled?: () => boolean;
};

export class ImportError extends Error {}

export class BlockedError extends Error {
  constructor(site: string) {
    super(`${site} blocks our server`);
  }
}
