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
};

export type Fetched = {
  // What was found: the app, plugin or post title.
  label: string;
  // The normalized link, stored when the source is kept in sync.
  input: string;
  items: Found[];
  // A short note for the preview.
  note?: string;
  // Which items start ticked: all of them (review feeds), the first (the linked post), or none (a long thread).
  pick?: "all" | "first" | "none";
};

// Each source is a module in this folder with this shape. fetch() throws ImportError, shown to the owner as is, or
// GoneError when the post or page isn't there (deleted, private).
export type Importer = {
  id: SourceId;
  fetch(input: string): Promise<Fetched>;
};

export class ImportError extends Error {}

export class GoneError extends ImportError {}
