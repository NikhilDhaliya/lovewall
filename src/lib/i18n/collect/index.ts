import "server-only";
import { ar } from "./ar";
import { da } from "./da";
import { de } from "./de";
import { en, type CollectDict } from "./en";
import { es } from "./es";
import { fi } from "./fi";
import { fr } from "./fr";
import { hi } from "./hi";
import { id } from "./id";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { pickLanguage, RTL, type Lang } from "./languages";
import { nb } from "./nb";
import { nl } from "./nl";
import { pl } from "./pl";
import { pt } from "./pt";
import { ru } from "./ru";
import { sv } from "./sv";
import { tr } from "./tr";
import { uk } from "./uk";
import { vi } from "./vi";
import { zh } from "./zh";

const DICTS: Record<Lang, CollectDict> = { en, es, fr, de, pt, it, nl, pl, sv, da, nb, fi, tr, ru, uk, ja, ko, zh, hi, ar, id, vi };

// The language a form shows: its fixed language, or the visitor's browser language for "auto".
export function formLanguage(
  setting: string,
  acceptLanguage: string | null | undefined,
): { lang: Lang; dir: "ltr" | "rtl"; dict: CollectDict } {
  const lang = setting === "auto" ? pickLanguage(acceptLanguage) : setting in DICTS ? (setting as Lang) : "en";
  return { lang, dir: RTL.has(lang) ? "rtl" : "ltr", dict: DICTS[lang] };
}
