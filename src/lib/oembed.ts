// Parsing for X oEmbed responses (pure, unit-tested).

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  mdash: "—",
  ndash: "–",
  nbsp: " ",
  hellip: "…",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// The oEmbed HTML is X's markup, but it is still treated as untrusted: tags are stripped, entities decoded, and
// the result is stored and rendered as plain text.
export function parseOembedHtml(html: string): { text: string; date: string | null } {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  let text = p ? p[1] : "";
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*>(pic\.(?:twitter|x)\.com\/\S+?)<\/a>/gi, "")
    .replace(/<[^>]+>/g, "");
  text = decodeEntities(text)
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const links = [...html.matchAll(/<a[^>]*>([^<]*)<\/a>/gi)];
  const last = links.length ? decodeEntities(links[links.length - 1][1]).trim() : "";
  const parsed = last ? Date.parse(`${last} 12:00 UTC`) : NaN;
  return { text, date: Number.isNaN(parsed) ? null : new Date(parsed).toISOString() };
}
