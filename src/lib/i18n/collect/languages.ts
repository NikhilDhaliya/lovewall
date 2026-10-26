import type { CollectDict, CollectKey } from "./en";

// Languages of the collect page (built-in texts only; the owner's own texts stay as written). Plain module.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "nb", name: "Norsk" },
  { code: "fi", name: "Suomi" },
  { code: "tr", name: "Türkçe" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "hi", name: "हिन्दी" },
  { code: "ar", name: "العربية" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "vi", name: "Tiếng Việt" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export const LANG_CODES = LANGUAGES.map((l) => l.code) as readonly string[];
export const RTL = new Set(["ar"]);

export function isLang(code: string): code is Lang {
  return LANG_CODES.includes(code);
}

// "Visitor's browser": the first supported language in Accept-Language (q-values respected), else English.
export function pickLanguage(acceptLanguage: string | null | undefined): Lang {
  const prefs = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((p) => p.tag && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    const base = p.tag.split("-")[0];
    // Norwegian: Bokmål covers "no" and "nn" too.
    const code = base === "no" || base === "nn" ? "nb" : base;
    if (isLang(code)) return code;
  }
  return "en";
}

// Fills {placeholders}. Values are plain text; React escapes them when rendered.
export function t(dict: CollectDict, key: CollectKey, vars?: Record<string, string | number>): string {
  const s = dict[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
