import { sourceLabel } from "./sources";

// A small RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes, BOM, CRLF). Lenient about a
// stray quote inside a quoted field (Testimonial.to exports don't escape them): it stays a quote. Semicolon and tab
// separated files work too.
export function parseCsv(input: string, maxRows = 5000): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Semicolon-separated (European Excel) and tab-separated exports are common; pick the delimiter from the header line.
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const count = (c: string) => firstLine.split(c).length - 1;
  const delim = [",", ";", "\t"].reduce((best, c) => (count(c) > count(best) ? c : best));
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else if (next === undefined || next === delim || next === "\n" || next === "\r") quoted = false;
        else field += c;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

export const CSV_FIELDS = [
  "name",
  "text",
  "title",
  "company",
  "rating",
  "source",
  "url",
  "date",
  "avatar",
  "email",
  "tags",
  "image",
  "video",
  "poster",
  "handle",
  "headline",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

const ALIASES: Record<CsvField, string[]> = {
  name: [
    "name",
    "full name",
    "author",
    "customer",
    "reviewer",
    "author name",
    "reviewer name",
    "customer name",
    "submitter name",
    "user name",
  ],
  text: ["text", "testimonial", "review", "content", "quote", "message", "comment", "body", "feedback", "review body", "testimonial text"],
  title: ["title", "role", "job", "job title", "position", "headline", "reviewer title", "tagline", "customer tagline", "user title"],
  company: ["company", "organization", "organisation", "business", "company name", "customer company"],
  rating: ["rating", "stars", "score", "rate"],
  source: ["source", "platform", "site", "channel", "integration"],
  url: ["url", "link", "source url", "source_url", "permalink", "review url", "source link url"],
  date: ["date", "created", "created at", "created_at", "posted", "time", "timestamp", "review date"],
  avatar: [
    "avatar",
    "photo",
    "image",
    "avatar url",
    "avatar_url",
    "picture",
    "profile image",
    "user photo",
    "reviewer avatar",
    "user avatar",
  ],
  email: ["email", "e-mail", "mail", "reviewer email", "customer email", "user email"],
  tags: ["tags", "tag", "labels"],
  image: ["images", "review image", "image url", "screenshot", "attachments", "attached images"],
  video: ["video", "video url", "video mp4 url", "video_url"],
  poster: ["thumbnail", "video thumbnail", "poster"],
  handle: ["username", "handle"],
  headline: ["review title", "testimonial title"],
};

// Known exports are recognised by their headers and read column by column: moves from Senja and Testimonial.to (help
// docs and their export code), and the review exports sites give business owners: Google Play Console, Yotpo and
// Judge.me (CSV, their help docs and real files) and Google Business Profile from Google Takeout (JSON, below). Keys
// are headers lowercased with spaces, dashes and underscores removed.
export type CsvPreset = "senja" | "testimonialto" | "google" | "googleplay" | "yotpo" | "judgeme";

type Preset = {
  // Columns that identify the export (all of them present).
  detect: string[];
  columns: Partial<Record<CsvField, string>>;
  // A review site's export: every row gets this source, and these values where the export has none.
  source?: string;
  defaults?: Partial<Record<CsvField, string>>;
  // Only rows whose value in this column is one of these (published reviews, not spam).
  keep?: { column: string; values: string[] };
};

const PRESETS: Record<CsvPreset, Preset> = {
  senja: {
    detect: ["customername", "integration"],
    columns: {
      name: "customername",
      text: "text",
      title: "customertagline",
      company: "customercompany",
      rating: "rating",
      source: "integration",
      url: "url",
      date: "date",
      avatar: "customeravatar",
      email: "customeremail",
      tags: "tags",
      image: "attachments",
      video: "videomp4url",
      headline: "title",
    },
  },
  testimonialto: {
    detect: ["submittername"],
    columns: {
      name: "submittername",
      text: "message",
      title: "title",
      avatar: "submitteravatar",
      email: "submitteremail",
      date: "createdat",
      tags: "tags",
      image: "attachedimages",
      video: "videourl",
      poster: "imagethumbnail",
    },
  },
  // Read by jsonToRows (Takeout's reviews.json); listed here for its source label.
  google: { detect: [], columns: {}, source: "Google" },
  // UTF-16 with a byte order mark (decodeText reads it). No reviewer names; the review link is a private Console link.
  googleplay: {
    detect: ["packagename", "starrating", "reviewtext"],
    columns: { text: "reviewtext", headline: "reviewtitle", rating: "starrating", date: "reviewsubmitdateandtime" },
    source: "Google Play",
    defaults: { name: "Google Play user" },
  },
  yotpo: {
    detect: ["reviewcontent", "reviewerdisplayname", "reviewscore"],
    columns: {
      name: "reviewerdisplayname",
      text: "reviewcontent",
      headline: "reviewtitle",
      rating: "reviewscore",
      date: "reviewcreationdate",
    },
    source: "Form",
    keep: { column: "reviewstatus", values: ["published"] },
  },
  judgeme: {
    detect: ["body", "reviewername", "curated"],
    columns: { name: "reviewername", text: "body", headline: "title", rating: "rating", date: "reviewdate" },
    source: "Form",
    keep: { column: "curated", values: ["ok"] },
  },
};

const squash = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export function detectPreset(header: string[]): CsvPreset | null {
  const keys = new Set(header.map(squash));
  for (const [id, p] of Object.entries(PRESETS) as [CsvPreset, Preset][]) {
    if (p.detect.length && p.detect.every((k) => keys.has(k))) return id;
  }
  return null;
}

// Maps header names to fields ("Full name" → name, "Review" → text...). Unknown columns are ignored.
export function mapHeaders(header: string[], preset: CsvPreset | null = null): Partial<Record<CsvField, number>> {
  const map: Partial<Record<CsvField, number>> = {};
  if (preset) {
    const keys = header.map(squash);
    for (const [field, col] of Object.entries(PRESETS[preset].columns) as [CsvField, string][]) {
      const i = keys.indexOf(col);
      if (i !== -1) map[field] = i;
    }
    return map;
  }
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[_-]+/g, " ");
    for (const field of CSV_FIELDS) {
      if (map[field] === undefined && (ALIASES[field].includes(key) || ALIASES[field].includes(key.replace(/ /g, "_")))) {
        map[field] = i;
        break;
      }
    }
  });
  return map;
}

export type CsvRow = Partial<Record<CsvField, string>>;

const UPGRADE = /^Please upgrade/i;
const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u) || /stream\.mux\.com/i.test(u);

// The first link in a list ("a,b", "a, b" or "a|b").
function firstUrl(v: string | undefined, keep: (u: string) => boolean = () => true) {
  return (v ?? "")
    .split(/[|,]\s*(?=https?:)/)
    .map((u) => u.trim())
    .find((u) => /^https:\/\//.test(u) && keep(u));
}

const WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };

// Cleans a row the way its export means it: Senja's 0 rating is "none", its Postgres dates, attachments that mix
// images and videos; Testimonial.to's "Title at Company", "|" lists, HLS links (not copyable) and upgrade notices;
// ratings written as words ("FIVE").
function tidy(row: CsvRow, preset: CsvPreset | null): CsvRow {
  const r: CsvRow = {};
  for (const [k, v] of Object.entries(row) as [CsvField, string][]) if (v && !UPGRADE.test(v)) r[k] = v;
  if (r.rating) r.rating = WORDS[r.rating.toLowerCase()] ?? r.rating;
  if (r.rating && !(Number(r.rating.replace(",", ".")) >= 1)) delete r.rating;
  if (r.date) {
    const d = r.date.replace(/^(\d{4}-\d\d-\d\d) (\d)/, "$1T$2").replace(/([+-]\d\d)$/, "$1:00");
    r.date = Number.isNaN(Date.parse(d)) ? r.date : d;
  }
  r.image = firstUrl(r.image, (u) => !isVideoUrl(u));
  r.video = firstUrl(r.video, (u) => !/\.m3u8(\?|$)/i.test(u));
  r.poster = firstUrl(r.poster);
  if (!r.text && r.headline) r.text = r.headline;
  delete r.headline;
  if (preset === "testimonialto" && r.title && !r.company) {
    const m = r.title.match(/^(.+?)\s+(?:at|@)\s+(.+)$/);
    if (m) {
      r.title = m[1];
      r.company = m[2];
    }
  }
  const p = preset ? PRESETS[preset] : null;
  if (p?.source) r.source = p.source;
  // Native form answers in Senja or Testimonial.to: they were collected with a form, like Lovewall's own.
  else if (p) r.source = r.source ? sourceLabel(r.source) : "Form";
  for (const [k, v] of Object.entries(p?.defaults ?? {}) as [CsvField, string][]) r[k] ||= v;
  for (const k of Object.keys(r) as CsvField[]) if (r[k] === undefined) delete r[k];
  return r;
}

export type Parsed = { rows: CsvRow[]; missing: CsvField[]; total: number; preset: CsvPreset | null };

export function csvToRows(input: string, max = 1000): Parsed {
  const all = parseCsv(input, max + 1);
  if (all.length < 2) return { rows: [], missing: ["name", "text"], total: 0, preset: null };
  const preset = detectPreset(all[0]);
  const map = mapHeaders(all[0], preset);
  const missing = (["name", "text"] as CsvField[]).filter((f) => map[f] === undefined && !(preset && PRESETS[preset].defaults?.[f]));
  const keep = preset ? PRESETS[preset].keep : undefined;
  const keepAt = keep ? all[0].map(squash).indexOf(keep.column) : -1;
  const kept = all.slice(1, max + 1).filter((r) => keepAt === -1 || keep!.values.includes((r[keepAt] ?? "").trim().toLowerCase()));
  const rows = kept.map((r) => {
    const out: CsvRow = {};
    for (const [field, idx] of Object.entries(map) as [CsvField, number][]) {
      const v = (r[idx] ?? "").trim();
      if (v) out[field] = v;
    }
    return tidy(out, preset);
  });
  return { rows: rows.filter((r) => r.name || r.text || r.video), missing, total: all.length - 1, preset };
}

// Export files come as UTF-8 or, from some consoles, UTF-16 with a byte order mark.
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

// A CSV file, or a known JSON export.
export function fileToRows(text: string, max = 1000): Parsed {
  return /^\s*[[{]/.test(text) ? jsonToRows(text, max) : csvToRows(text, max);
}

type TakeoutReview = { reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime?: string };

// Google translates some reviews: "(Translated by Google) …\n\n(Original)\n…". The author's own words are kept.
const original = (comment: string) => comment.match(/\(Original\)\s*([\s\S]+)$/)?.[1]?.trim() ?? comment;

// Google Business Profile reviews from Google Takeout: one reviews.json per location, {"reviews": [...]}.
function jsonToRows(text: string, max: number): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const list = (data as { reviews?: unknown } | null)?.reviews;
  if (!Array.isArray(list) || !list.every((r) => r && typeof r === "object" && "starRating" in r && "reviewer" in r)) {
    return { rows: [], missing: ["name", "text"], total: 0, preset: null };
  }
  const rows = (list as TakeoutReview[]).slice(0, max).map((r) =>
    tidy(
      {
        name: String(r.reviewer?.displayName ?? "").trim(),
        text: original(String(r.comment ?? "").trim()),
        rating: String(r.starRating ?? ""),
        date: String(r.createTime ?? ""),
      },
      "google",
    ),
  );
  return { rows: rows.filter((r) => r.name || r.text), missing: [], total: list.length, preset: "google" };
}
