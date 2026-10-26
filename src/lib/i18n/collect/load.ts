import type { CollectDict } from "./en";
import type { Lang } from "./languages";

// Client-side: load one language on demand (the editor preview). Each file becomes its own small chunk.
const LOADERS: Record<Exclude<Lang, "en">, () => Promise<CollectDict>> = {
  es: () => import("./es").then((m) => m.es),
  fr: () => import("./fr").then((m) => m.fr),
  de: () => import("./de").then((m) => m.de),
  pt: () => import("./pt").then((m) => m.pt),
  it: () => import("./it").then((m) => m.it),
  nl: () => import("./nl").then((m) => m.nl),
  pl: () => import("./pl").then((m) => m.pl),
  sv: () => import("./sv").then((m) => m.sv),
  da: () => import("./da").then((m) => m.da),
  nb: () => import("./nb").then((m) => m.nb),
  fi: () => import("./fi").then((m) => m.fi),
  tr: () => import("./tr").then((m) => m.tr),
  ru: () => import("./ru").then((m) => m.ru),
  uk: () => import("./uk").then((m) => m.uk),
  ja: () => import("./ja").then((m) => m.ja),
  ko: () => import("./ko").then((m) => m.ko),
  zh: () => import("./zh").then((m) => m.zh),
  hi: () => import("./hi").then((m) => m.hi),
  ar: () => import("./ar").then((m) => m.ar),
  id: () => import("./id").then((m) => m.id),
  vi: () => import("./vi").then((m) => m.vi),
};

export function loadDict(lang: string): Promise<CollectDict> | null {
  return lang in LOADERS ? LOADERS[lang as Exclude<Lang, "en">]() : null;
}
