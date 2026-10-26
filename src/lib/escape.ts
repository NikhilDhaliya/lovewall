// HTML escaping for every place user content meets a string template (emails, widget HTML).
const MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => MAP[c]);
}

// For values placed inside a CSS declaration (colours, numbers): anything unexpected becomes empty.
export function cssColor(value: unknown, fallback: string): string {
  const v = String(value ?? "");
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

// Relative luminance (0 black … 1 white) of a #rrggbb colour.
export function luminance(hex: string): number {
  const n = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
}
