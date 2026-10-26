import { esc } from "@/lib/escape";
import { customCss, stars, WIDGET_SCRIPT, widgetBody, widgetCss, type RenderInput } from "./render";

// The public wall page (/w/<id>) as plain HTML, like the widgets: the page route renders it, and the configurator
// previews it live (Page tab). The testimonials are always a wall; the header, filters and buttons come from the
// widget's page settings.

export type PageInput = Omit<RenderInput, "type" | "mode"> & { mode: "page" | "preview" };

// Tags the visitors can filter by: the ones this widget's testimonials use, most used first.
export function pageTags(input: Pick<RenderInput, "items" | "config">, max = 12): string[] {
  const counts = new Map<string, number>();
  for (const t of input.items) for (const tag of t.tags) if (tag !== input.config.tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag]) => tag);
}

// The Lovewall mark (components/ui/logo.tsx), drawn in the page's own ink.
const MARK =
  '<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8.5" fill="currentColor"/><path transform="translate(4 4.4)" d="M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z" fill="var(--lw-bg)"/></svg>';

export function pageBody(input: PageInput): string {
  const { config: c, space, summary } = input;
  const title = c.pageTitle || space.name;
  const rating =
    summary.count > 0
      ? `<div class="lw-ph-rating">${
          summary.average
            ? `${stars(Math.round(summary.average), 15)}<span class="lw-ph-score">${summary.average.toFixed(1)}</span><span aria-hidden="true">·</span>`
            : ""
        }<span>${summary.count} ${summary.count === 1 ? "review" : "reviews"}</span></div>`
      : "";
  const cta = c.ctaLabel && c.ctaUrl ? `<a class="lw-pb lw-pb-main" href="${esc(c.ctaUrl)}" rel="noopener">${esc(c.ctaLabel)}</a>` : "";
  const add = c.pageAddYours ? `<a class="lw-pb ${cta ? "lw-pb-alt" : "lw-pb-main"}" href="/${esc(space.slug)}">Add yours</a>` : "";
  const site =
    !cta && space.website
      ? `<a class="lw-pb lw-pb-alt" href="${esc(space.website)}" rel="noopener nofollow">Visit ${esc(space.name)}</a>`
      : "";
  const actions = cta || add || site ? `<div class="lw-ph-actions">${cta}${add}${site}</div>` : "";
  const tags = c.pageFilters ? pageTags(input) : [];
  const filters = tags.length
    ? `<div class="lw-filters" role="group" aria-label="Filter by tag"><button type="button" data-tag="" aria-pressed="true">All</button>${tags
        .map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`)
        .join("")}</div><p class="lw-sr lw-filter-status" aria-live="polite"></p>`
    : "";
  const wall = widgetBody({ ...input, type: "wall", config: { ...c, branding: false }, mode: "page" });
  // "Report" is always there: anyone can ask for a testimonial to come down (privacy policy).
  const base = input.mode === "page" ? "" : esc(input.appUrl);
  const footer = `<footer class="lw-pf">${c.branding ? `<a href="${base}/?ref=wall">${MARK}Made with Lovewall</a>` : ""}<a href="${base}/r/${esc(input.widgetId)}" rel="nofollow">Report</a></footer>`;
  return `<header class="lw-ph"><div class="lw-ph-in">${
    space.logo ? `<img class="lw-ph-logo" src="${esc(space.logo)}" alt="">` : ""
  }<h1 class="lw-ph-title">${esc(title)}</h1>${c.pageText ? `<p class="lw-ph-text">${esc(c.pageText)}</p>` : ""}${rating}${actions}</div></header><main class="lw-pm">${filters}${wall}</main>${footer}`;
}

// Attributes for the page's root element (the runtime script reads them).
export function pageRoot(input: Pick<PageInput, "widgetId" | "config" | "mode">) {
  return {
    className: `lw-page lw-ps-${input.config.pageStyle}`,
    "data-theme": input.config.theme,
    "data-lw-root": "",
    "data-id": input.widgetId,
    "data-mode": input.mode,
    ...(input.mode === "page" ? { "data-track": "1" } : {}),
  };
}

export function pageCss(input: Pick<PageInput, "config">): string {
  return `${widgetCss(input.config, ".lw-page")}
${PAGE_CSS}
${customCss(input.config.css)}`;
}

// The configurator's live preview of the page: the same HTML in a srcdoc iframe.
export function pageDocument(input: PageInput): string {
  const root = pageRoot(input);
  const attrs = Object.entries(root)
    .map(([k, v]) => `${k === "className" ? "class" : k}="${esc(v)}"`)
    .join(" ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>@layer base,components;@layer base{*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}button{font:inherit;color:inherit}img,svg{display:block}}:root{--font-geist-sans:system-ui}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}</style><style>${pageCss(
    input,
  )}</style></head><body><div ${attrs}>${pageBody(input)}</div><script>${WIDGET_SCRIPT}</script></body></html>`;
}

const PAGE_CSS = `.lw-page{min-height:100dvh;background:var(--lw-bg);color:var(--lw-ink);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.lw-page *{box-sizing:border-box}
.lw-ph{padding:64px 20px 40px}
.lw-ph-in{display:flex;flex-direction:column;align-items:center;max-width:760px;margin:0 auto;text-align:center}
.lw-ph-logo{display:block;height:56px;width:auto;max-width:200px;margin:0 0 24px;border-radius:12px;object-fit:contain}
.lw-ph-title{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",var(--font-geist-sans),system-ui,sans-serif;font-size:clamp(34px,6vw,50px);line-height:1.08;font-weight:500;letter-spacing:-.028em;text-wrap:balance}
.lw-ph-text{margin:14px 0 0;max-width:560px;font-size:17px;line-height:1.5;color:var(--lw-muted);text-wrap:pretty}
.lw-ph-rating{display:flex;align-items:center;gap:8px;margin-top:20px;font-size:15px;color:var(--lw-muted)}
.lw-ph-score{font-weight:550;color:var(--lw-ink)}
.lw-ph-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:28px}
.lw-pb{display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:9px;font-size:14.5px;font-weight:500;text-decoration:none;transition:filter .18s,transform .18s cubic-bezier(.32,.72,0,1)}
.lw-pb:active{transform:scale(.97)}
.lw-pb-main{background:var(--lw-accent);color:var(--lw-on-accent)}
.lw-pb-main:hover{filter:brightness(1.1)}
.lw-pb-alt{background:var(--lw-card);color:var(--lw-ink);box-shadow:inset 0 0 0 1px var(--lw-line)}
.lw-pb-alt:hover{filter:brightness(.98)}
.lw-pb:focus-visible,.lw-filters button:focus-visible,.lw-pf a:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-pm{max-width:1180px;margin:0 auto;padding:0 16px 64px}
.lw-filters{display:flex;gap:22px;margin:0 0 24px;overflow-x:auto;scrollbar-width:none;justify-content:safe center;box-shadow:inset 0 -1px 0 var(--lw-line)}
.lw-filters::-webkit-scrollbar{display:none}
@media (max-width:639px){.lw-filters{-webkit-mask-image:linear-gradient(90deg,#000 86%,transparent);mask-image:linear-gradient(90deg,#000 86%,transparent)}}
.lw-filters button{position:relative;flex:none;height:42px;padding:0;border:0;background:none;font:inherit;font-size:14px;font-weight:500;color:var(--lw-muted);cursor:pointer;white-space:nowrap;transition:color .15s}
.lw-filters button:hover{color:var(--lw-ink)}
.lw-filters button[aria-pressed=true]{color:var(--lw-ink)}
.lw-filters button[aria-pressed=true]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:var(--lw-ink)}
.lw-pf{display:flex;justify-content:center;padding:0 0 48px}
.lw-pf a{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:500;color:var(--lw-muted);text-decoration:none;transition:color .15s}
.lw-pf a:hover{color:var(--lw-ink)}
.lw-pf svg{color:var(--lw-ink)}
.lw-ps-left .lw-ph,.lw-ps-split .lw-ph{padding:64px 16px 36px;max-width:1180px;margin:0 auto}
.lw-ps-left .lw-ph-in,.lw-ps-split .lw-ph-in{align-items:flex-start;max-width:none;text-align:left}
.lw-ps-left .lw-ph-actions,.lw-ps-split .lw-ph-actions{justify-content:flex-start}
.lw-ps-left .lw-ph-title{font-size:clamp(36px,7vw,64px)}
.lw-ps-left .lw-filters,.lw-ps-split .lw-filters{justify-content:flex-start}
.lw-ps-tinted .lw-ph{margin-bottom:40px;padding-bottom:48px;background:color-mix(in srgb,var(--lw-accent) 7%,var(--lw-bg));box-shadow:inset 0 -1px 0 var(--lw-line)}
@media (min-width:640px){.lw-ph{padding:96px 24px 56px}.lw-pm{padding:0 24px 80px}.lw-ps-left .lw-ph,.lw-ps-split .lw-ph{padding:88px 24px 44px}}
@media (min-width:1024px){.lw-ps-split{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);grid-template-rows:1fr auto;max-width:1320px;margin:0 auto;column-gap:16px}
.lw-ps-split .lw-ph{grid-row:1/3;padding:80px 24px 40px 32px;margin:0;width:100%}
.lw-ps-split .lw-ph-in{position:sticky;top:80px}
.lw-ps-split .lw-ph-title{font-size:44px}
.lw-ps-split .lw-pm{padding:80px 32px 64px 0;max-width:none;margin:0;width:100%}
.lw-ps-split .lw-wall{columns:2 240px}
.lw-ps-split .lw-pf{grid-column:2;justify-content:flex-start}}`;
