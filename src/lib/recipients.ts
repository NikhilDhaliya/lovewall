import { parseCsv } from "@/lib/csv";

// Invite recipients from pasted text ("Ada Lovelace, ada@example.com", "Ada <ada@example.com>", or just an address,
// one per line) or a CSV file with name and email columns. Plain module.
export type Recipient = { name: string; email: string };

const FIND = /[^\s<>(),;"']+@[^\s<>(),;"']+\.[^\s<>(),;"']+/;

export function parseRecipients(text: string, max = 1000): Recipient[] {
  const out: Recipient[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(FIND);
    if (!m) {
      out.push({ name: line.slice(0, 80), email: "" }); // counted as invalid later
      continue;
    }
    const name = line
      .replace(m[0], " ")
      .replace(/[<>()"';,\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    out.push({ name, email: m[0].toLowerCase() });
    if (out.length >= max) break;
  }
  return out;
}

export function csvRecipients(csv: string, max = 1000): Recipient[] {
  const rows = parseCsv(csv, max + 1);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  let email = col(/^(e-?mail|email address|e-mail address)$/);
  const name = col(/^(name|full name|customer|customer name)$/);
  const first = col(/^(first name|firstname|given name)$/);
  const last = col(/^(last name|lastname|surname|family name)$/);
  const hasHeader = email !== -1 || name !== -1 || first !== -1;
  const body = hasHeader ? rows.slice(1) : rows;
  if (email === -1) email = (body[0] ?? []).findIndex((c) => FIND.test(c));
  if (email === -1) return [];
  return body.slice(0, max).map((r) => ({
    email: (r[email] ?? "").trim().toLowerCase(),
    name: (name !== -1 ? (r[name] ?? "") : [first !== -1 ? r[first] : "", last !== -1 ? r[last] : ""].join(" ")).trim().slice(0, 80),
  }));
}

export const toLines = (list: Recipient[]) => list.map((r) => (r.name ? `${r.name}, ${r.email}` : r.email)).join("\n");
