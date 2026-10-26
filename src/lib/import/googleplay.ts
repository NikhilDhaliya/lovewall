import "server-only";
import { getText, parseJson, request } from "./http";
import { clip, httpsOrNull, isoDate, metaContent, stars } from "./parse";
import { ImportError, type Found, type Importer } from "./types";

// Google Play has no public reviews API: this is the request its own web page makes (newest first, 100 reviews).

export function parsePlay(input: string): { id: string; hl: string; gl: string } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const id = u.searchParams.get("id") ?? "";
    if (!/^play\.google\.com$/i.test(u.hostname) || !/^[A-Za-z][\w]*(\.[\w]+)+$/.test(id)) return null;
    const hl = (u.searchParams.get("hl") ?? "en").replace(/[^A-Za-z_-]/g, "").slice(0, 8) || "en";
    const gl = (u.searchParams.get("gl") ?? "us").replace(/[^A-Za-z]/g, "").slice(0, 2) || "us";
    return { id, hl, gl };
  } catch {
    return null;
  }
}

type Row = unknown[];
const at = (v: unknown, ...path: number[]): unknown => path.reduce<unknown>((o, k) => (Array.isArray(o) ? o[k] : undefined), v);

export function parsePlayReviews(body: string, appId: string): Found[] {
  const json = body.replace(/^\)\]\}'\s*/, "");
  const outer = parseJson<Row[]>("Google Play", json);
  const payload = outer.find((r) => Array.isArray(r) && r[0] === "wrb.fr")?.[2];
  if (typeof payload !== "string") return [];
  const reviews = at(parseJson<Row>("Google Play", payload), 0);
  if (!Array.isArray(reviews)) return [];
  const items: Found[] = [];
  for (const r of reviews) {
    const id = at(r, 0);
    const text = clip(String(at(r, 4) ?? ""), 3000);
    if (typeof id !== "string" || !text) continue;
    items.push({
      url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&reviewId=${encodeURIComponent(id)}`,
      name: clip(String(at(r, 1, 0) ?? ""), 80) || "Google Play user",
      text,
      rating: stars(at(r, 2)),
      date: isoDate(at(r, 5, 0)),
      avatarUrl: httpsOrNull(at(r, 1, 1, 3, 2)),
    });
  }
  return items;
}

export const googleplay: Importer = {
  id: "googleplay",
  async fetch(input) {
    const app = parsePlay(input);
    if (!app) throw new ImportError("That isn't a Google Play app link");
    const req = JSON.stringify([
      [["UsvDTd", JSON.stringify([null, null, [2, 2, [100, null, null], null, []], [app.id, 7]]), null, "generic"]],
    ]);
    const [res, page] = await Promise.all([
      request("Google Play", `https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=UsvDTd&hl=${app.hl}&gl=${app.gl}`, {
        method: "POST",
        body: `f.req=${encodeURIComponent(req)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      }),
      getText("Google Play", `https://play.google.com/store/apps/details?id=${encodeURIComponent(app.id)}&hl=${app.hl}`).catch(() => ""),
    ]);
    const label = metaContent(page, "og:title").replace(/ - (Apps on Google Play|Apps bei Google Play).*$/i, "");
    return {
      label: clip(label, 80) || app.id,
      input: `https://play.google.com/store/apps/details?id=${app.id}&hl=${app.hl}&gl=${app.gl}`,
      items: parsePlayReviews(res.body.toString("utf8"), app.id),
    };
  },
};
