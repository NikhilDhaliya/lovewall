"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { textareaClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { PublicTestimonial } from "@/lib/types";
import { CSS_MAX, ONE_UP, WIDGET_LABELS, WIDGET_TYPES, type WidgetConfig, type WidgetType } from "@/lib/widget/config";
import { fitsLayout } from "@/lib/widget/select";
import { AiWidgetOptions } from "@/components/ai/widget-options";
import { Row, Section, Slider, smallInput } from "./controls";
import { TypeArt } from "./type-art";

const SWATCHES = ["#1d1d1f", "#0a84ff", "#30b158", "#ff9f0a", "#ff375f", "#bf5af2"];

type Set = <K extends keyof WidgetConfig>(k: K, v: WidgetConfig[K]) => void;

// Which "Show" switches mean something for each layout.
const SHOW: Record<WidgetType, (keyof WidgetConfig)[]> = {
  wall: ["showRating", "showPhoto", "showSource", "showDate", "branding"],
  grid: ["showRating", "showPhoto", "showSource", "showDate", "branding"],
  list: ["showRating", "showPhoto", "showSource", "showDate", "branding"],
  carousel: ["showRating", "showPhoto", "showSource", "showDate", "branding"],
  marquee: ["showRating", "showPhoto", "showSource", "showDate", "branding"],
  gallery: ["showRating", "branding"],
  single: ["showRating", "showPhoto", "showSource", "branding"],
  hero: ["showRating", "showPhoto", "branding"],
  video: ["showRating", "showPhoto", "branding"],
  popup: ["showRating", "showPhoto"],
  badge: ["showPhoto"],
  avatars: ["showRating", "showPhoto"],
  logos: [],
};

const SHOW_LABELS: Partial<Record<keyof WidgetConfig, string>> = {
  showRating: "Rating",
  showPhoto: "Photo",
  showSource: "Source",
  showDate: "Date",
  branding: "Made with Lovewall",
};

const CLASSES = [
  [".lw-card", "Card"],
  [".lw-text", "Quote"],
  [".lw-hl", "Best line"],
  [".lw-name", "Name"],
  [".lw-sub", "Title, company"],
  [".lw-av", "Photo"],
  [".lw-stars", "Stars"],
  [".lw-pc", "Popup card"],
  [".lw-page", "Wall page"],
  [".lw-ph", "Page header"],
  [".lw-pb", "Page buttons"],
  ["--lw-accent", "Accent"],
  ["--lw-card", "Card colour"],
  ["--lw-ink", "Text colour"],
  ["--lw-r", "Corners"],
] as const;

export function LayoutPicker({ type, onChange }: { type: WidgetType; onChange: (t: WidgetType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Layout">
      {WIDGET_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={type === t}
          onClick={() => onChange(t)}
          className={cn(
            "flex flex-col overflow-hidden rounded-[8px] bg-surface text-left transition-[box-shadow,scale] active:scale-95",
            type === t ? "ring-[1.5px] ring-ink" : "ring-1 ring-line hover:ring-ink/25",
          )}
        >
          <TypeArt type={t} className="h-[58px] rounded-none bg-grouped p-2" />
          <span className={cn("truncate px-2 py-1.5 text-[12.5px] font-medium", type === t ? "text-ink" : "text-muted")}>
            {WIDGET_LABELS[t]}
          </span>
        </button>
      ))}
    </div>
  );
}

function Columns({ value, onChange, auto = true }: { value: number; onChange: (n: number) => void; auto?: boolean }) {
  const options = [...(auto ? [{ value: "0", label: "Auto" }] : []), ...["2", "3", "4"].map((n) => ({ value: n, label: n }))];
  const current = String(auto ? value : value || 3);
  return (
    <Row label="Columns">
      <Segmented
        size="sm"
        className={auto ? "w-[180px]" : "w-[135px]"}
        label="Columns"
        value={current}
        onChange={(v) => onChange(Number(v))}
        options={options}
      />
    </Row>
  );
}

// The layout's own options, under the layout picker.
function LayoutOptions({ type, config, set, items }: { type: WidgetType; config: WidgetConfig; set: Set; items: PublicTestimonial[] }) {
  if (type === "wall" || type === "gallery") return <Columns value={config.columns} onChange={(n) => set("columns", n)} />;
  if (type === "grid") return <Columns auto={false} value={config.columns} onChange={(n) => set("columns", n)} />;
  if (type === "carousel")
    return (
      <>
        <Row label="Per view">
          <Segmented
            size="sm"
            className="w-[180px]"
            label="Per view"
            value={String(config.perView)}
            onChange={(v) => set("perView", Number(v))}
            options={[
              { value: "0", label: "Auto" },
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
          />
        </Row>
        <Row label="Autoplay" htmlFor="autoplay">
          <Switch id="autoplay" on={config.autoplay} onChange={(v) => set("autoplay", v)} />
        </Row>
      </>
    );
  if (type === "marquee")
    return (
      <>
        <Row label="Speed">
          <Segmented
            size="sm"
            className="w-[180px]"
            label="Speed"
            value={config.speed}
            onChange={(v) => set("speed", v)}
            options={[
              { value: "slow", label: "Slow" },
              { value: "normal", label: "Normal" },
              { value: "fast", label: "Fast" },
            ]}
          />
        </Row>
        <Row label="Direction">
          <Segmented
            size="sm"
            className="w-[120px]"
            label="Direction"
            value={config.direction}
            onChange={(v) => set("direction", v)}
            options={[
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
          />
        </Row>
        <Row label="Rows">
          <Segmented
            size="sm"
            className="w-[120px]"
            label="Rows"
            value={String(config.rows) as "1" | "2" | "3"}
            onChange={(v) => set("rows", Number(v))}
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
          />
        </Row>
      </>
    );
  if (ONE_UP.includes(type)) {
    const options = items.filter((t) => fitsLayout(t, type)).slice(0, 50);
    return (
      <Row label="Show">
        <Select
          aria-label="Testimonial"
          className="w-[170px]"
          value={config.pick && options.some((t) => t.id === config.pick) ? config.pick : "top"}
          onChange={(v) => set("pick", v === "top" ? null : v)}
          options={[{ value: "top", label: "Top one" }, ...options.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </Row>
    );
  }
  if (type === "popup")
    return (
      <>
        <Row label="Corner">
          <Select
            aria-label="Corner"
            className="w-[150px]"
            value={config.popupPosition}
            onChange={(v) => set("popupPosition", v)}
            options={[
              { value: "bottom-left", label: "Bottom left" },
              { value: "bottom-right", label: "Bottom right" },
              { value: "top-left", label: "Top left" },
              { value: "top-right", label: "Top right" },
            ]}
          />
        </Row>
        <Row label="First after">
          <Select
            aria-label="First after"
            className="w-[150px]"
            value={String(config.popupDelay)}
            onChange={(v) => set("popupDelay", Number(v))}
            options={[0, 3, 5, 10, 20, 30].map((n) => ({ value: String(n), label: n ? `${n} seconds` : "At once" }))}
          />
        </Row>
        <Row label="Each for">
          <Select
            aria-label="Each for"
            className="w-[150px]"
            value={String(config.popupInterval)}
            onChange={(v) => set("popupInterval", Number(v))}
            options={[5, 8, 12, 20].map((n) => ({ value: String(n), label: `${n} seconds` }))}
          />
        </Row>
        <Row label="Close button" htmlFor="popupDismiss">
          <Switch id="popupDismiss" on={config.popupDismiss} onChange={(v) => set("popupDismiss", v)} />
        </Row>
        <Row label="On phones" htmlFor="popupPhones">
          <Switch id="popupPhones" on={config.popupPhones} onChange={(v) => set("popupPhones", v)} />
        </Row>
      </>
    );
  if (type === "avatars")
    return (
      <>
        <Row label="Faces" htmlFor="faces">
          <Slider id="faces" min={3} max={8} value={config.faces} onChange={(v) => set("faces", v)} />
        </Row>
        <div>
          <label htmlFor="avatarsText" className="mb-1.5 block text-[14px]">
            Text
          </label>
          <input
            id="avatarsText"
            value={config.avatarsText}
            maxLength={80}
            onChange={(e) => set("avatarsText", e.target.value)}
            placeholder="Loved by {count} customers"
            className={smallInput}
          />
        </div>
        <Row label="Count" htmlFor="avatarsCount">
          <input
            id="avatarsCount"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Auto"
            value={config.avatarsCount ?? ""}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              set("avatarsCount", e.target.value && n > 0 ? Math.min(n, 10_000_000) : null);
            }}
            className={cn(smallInput, "w-[110px] text-right tabular-nums")}
          />
        </Row>
      </>
    );
  if (type === "logos")
    return (
      <>
        <div>
          <label htmlFor="logosCaption" className="mb-1.5 block text-[14px]">
            Caption
          </label>
          <input
            id="logosCaption"
            value={config.logosCaption}
            maxLength={80}
            onChange={(e) => set("logosCaption", e.target.value)}
            placeholder="None"
            className={smallInput}
          />
        </div>
        <Row label="One colour" htmlFor="logosMono">
          <Switch id="logosMono" on={config.logosMono} onChange={(v) => set("logosMono", v)} />
        </Row>
      </>
    );
  return null;
}

export function DesignPanel({
  type,
  setType,
  config,
  set,
  items,
  tags,
  ai = false,
}: {
  type: WidgetType;
  setType: (t: WidgetType) => void;
  config: WidgetConfig;
  set: Set;
  items: PublicTestimonial[];
  tags: string[];
  ai?: boolean;
}) {
  const [hex, setHex] = useState(config.accent);
  const show = SHOW[type];
  return (
    <>
      <Section title="Layout">
        <LayoutPicker type={type} onChange={setType} />
        <LayoutOptions type={type} config={config} set={set} items={items} />
      </Section>

      <Section title="Testimonials">
        <Row label="Include">
          <Segmented
            size="sm"
            className="w-[180px]"
            label="Include"
            value={config.include}
            onChange={(v) => set("include", v)}
            options={[
              { value: "approved", label: "Approved" },
              { value: "featured", label: "Featured" },
            ]}
          />
        </Row>
        <Row label="Tag">
          <Select
            aria-label="Tag"
            className="w-[150px]"
            value={config.tag ?? "__any"}
            onChange={(v) => set("tag", v === "__any" ? null : v)}
            options={[{ value: "__any", label: "Any" }, ...tags.map((t) => ({ value: t, label: t }))]}
          />
        </Row>
        <Row label="Rating">
          <Select
            aria-label="Minimum rating"
            className="w-[150px]"
            value={String(config.minRating)}
            onChange={(v) => set("minRating", Number(v))}
            options={[
              { value: "0", label: "Any" },
              { value: "3", label: "3 stars and up" },
              { value: "4", label: "4 stars and up" },
              { value: "5", label: "5 stars" },
            ]}
          />
        </Row>
        <Row label="Sort">
          <Select
            aria-label="Sort"
            className="w-[150px]"
            value={config.sort}
            onChange={(v) => set("sort", v)}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "rating", label: "Highest rated" },
            ]}
          />
        </Row>
        {!ONE_UP.includes(type) && type !== "badge" && type !== "avatars" && (
          <Row label="Max" htmlFor="max">
            <Slider id="max" min={1} max={100} value={config.max} onChange={(v) => set("max", v)} />
          </Row>
        )}
      </Section>

      <Section title="Style">
        <Row label="Theme">
          <Segmented
            size="sm"
            className="w-[180px]"
            label="Theme"
            value={config.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "auto", label: "Auto" },
            ]}
          />
        </Row>
        <div>
          <div className="mb-2.5 text-[14px]">Accent</div>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => (set("accent", c), setHex(c))}
                aria-label={`Accent ${c}`}
                aria-pressed={config.accent.toLowerCase() === c}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-canvas transition-transform active:scale-90",
                  config.accent.toLowerCase() === c && "ring-2 ring-ink",
                )}
                style={{ background: c }}
              />
            ))}
            <label className="relative ml-1 flex h-8 items-center rounded-[8px] bg-surface pr-2 pl-1.5 ring-1 ring-line ring-inset">
              <input
                type="color"
                aria-label="Custom accent"
                value={config.accent}
                onChange={(e) => (set("accent", e.target.value), setHex(e.target.value))}
                className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              />
              <input
                aria-label="Accent hex"
                value={hex}
                onChange={(e) => {
                  setHex(e.target.value);
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) set("accent", e.target.value.toLowerCase());
                }}
                maxLength={7}
                className="ml-1.5 w-[64px] bg-transparent font-mono text-[12px] outline-none"
              />
            </label>
          </div>
        </div>
        <Row label="Corners" htmlFor="radius">
          <Slider id="radius" min={0} max={28} value={config.radius} onChange={(v) => set("radius", v)} />
        </Row>
      </Section>

      {show.length > 0 && (
        <Section title="Show">
          {show.map((k) => (
            <Row key={k} label={SHOW_LABELS[k]!} htmlFor={k}>
              <Switch id={k} on={Boolean(config[k])} onChange={(v) => set(k, v as never)} />
            </Row>
          ))}
        </Section>
      )}

      {ai && <AiWidgetOptions config={config} set={set} />}

      <Section title="Google">
        <Row label="Review stars" htmlFor="snippets">
          <Switch id="snippets" on={config.snippets} onChange={(v) => set("snippets", v)} />
        </Row>
        {config.snippets && <p className="-mt-2 text-[13px] text-muted">Google decides if stars show.</p>}
      </Section>

      <Section title="Custom CSS">
        <textarea
          aria-label="Custom CSS"
          value={config.css}
          onChange={(e) => set("css", e.target.value.slice(0, CSS_MAX))}
          rows={6}
          spellCheck={false}
          placeholder=".lw-card { border-radius: 4px; }"
          className={cn(textareaClass, "font-mono text-[12.5px] leading-[1.6] md:text-[12.5px]")}
        />
        <details className="group text-[13px]">
          <summary className="cursor-pointer list-none text-muted transition-colors select-none hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-line underline-offset-[3px]">Class names</span>
          </summary>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {CLASSES.map(([name, label]) => (
              <div key={name} className="contents">
                <dt className="font-mono text-[12px] text-ink">{name}</dt>
                <dd className="text-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Section>
    </>
  );
}
