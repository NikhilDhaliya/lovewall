import "server-only";
import type { SourceId } from "@/lib/sources";
import { appstore } from "./appstore";
import { capterra } from "./capterra";
import { chromewebstore } from "./chromewebstore";
import { g2 } from "./g2";
import { google } from "./google";
import { googleplay } from "./googleplay";
import { hackernews } from "./hackernews";
import { producthunt } from "./producthunt";
import { reddit } from "./reddit";
import { shopify } from "./shopify";
import { tiktok } from "./tiktok";
import { trustpilot } from "./trustpilot";
import type { Importer } from "./types";
import { wordpress } from "./wordpress";
import { x } from "./x";
import { yelp } from "./yelp";
import { youtube } from "./youtube";

// Every source the server can read from a link. Paste-only sources (LinkedIn, Facebook, Instagram) aren't here.
const IMPORTERS: Importer[] = [
  google,
  trustpilot,
  g2,
  capterra,
  producthunt,
  appstore,
  googleplay,
  shopify,
  wordpress,
  chromewebstore,
  yelp,
  x,
  reddit,
  hackernews,
  youtube,
  tiktok,
];

export const IMPORTER_IDS = IMPORTERS.map((i) => i.id) as [SourceId, ...SourceId[]];

export function importerFor(id: string): Importer | null {
  const found = IMPORTERS.find((i) => i.id === id);
  return found && (found.enabled?.() ?? true) ? found : null;
}
