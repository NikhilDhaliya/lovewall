import "server-only";
import type { SourceId } from "@/lib/sources";
import { appstore } from "./appstore";
import { hackernews } from "./hackernews";
import type { Importer } from "./types";
import { tiktok } from "./tiktok";
import { wordpress } from "./wordpress";
import { x } from "./x";
import { youtube } from "./youtube";

// Every source the server reads from a link, each through the site's official feed, API or oEmbed endpoint. Reviews
// from other sites come in by hand: their export file, paste, a screenshot or the browser extension.
const IMPORTERS: Importer[] = [appstore, wordpress, x, hackernews, youtube, tiktok];

export const IMPORTER_IDS = IMPORTERS.map((i) => i.id) as [SourceId, ...SourceId[]];

export function importerFor(id: string): Importer | null {
  return IMPORTERS.find((i) => i.id === id) ?? null;
}
