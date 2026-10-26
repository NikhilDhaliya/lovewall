"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, EyeOff } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/segmented";
import { StarInput, Stars } from "@/components/ui/stars";
import { WidgetPreview } from "@/components/widgets/preview";
import { cn } from "@/lib/cn";
import { defaultConfig, INLINE, WIDGET_LABELS, type WidgetType } from "@/lib/widget/config";
import { SAMPLES } from "@/lib/widget/samples";

// Live pieces of the real product, used on the landing page. The reviews are of "Northwind", a made-up product.

// A browser window: hairline frame, three dots and an address.
export function BrowserFrame({ url, className, children }: { url: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] bg-surface ring-1 ring-line", className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-line px-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="mx-auto -translate-x-6 text-[12px] text-faint">{url}</span>
      </div>
      {children}
    </div>
  );
}

export function MiniForm() {
  const [rating, setRating] = useState<number | null>(5);
  return (
    <BrowserFrame url="lovewall.tech/northwind" className="mx-auto w-full max-w-[400px]">
      <div className="p-5 sm:p-6">
        <p className="text-[13px] text-muted">Northwind</p>
        <p className="mt-0.5 font-display text-[19px] leading-snug font-medium">What do you love about Northwind?</p>
        <div className="mt-4">
          <StarInput value={rating} onChange={setRating} size={22} />
        </div>
        <div className="mt-3 rounded-[8px] px-3 py-2.5 text-[14px] leading-relaxed text-ink ring-1 ring-line ring-inset">
          Our Monday planning went from an hour to ten minutes.
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar size={28} />
          <span className="text-[13.5px]">Maya Chen</span>
        </div>
        <div className="mt-4 flex h-10 items-center justify-center rounded-[8px] bg-accent text-[14px] font-medium text-on-accent">
          Send
        </div>
      </div>
    </BrowserFrame>
  );
}

const QUEUE = [
  { id: "a", name: "Jonas Weber", text: "Setup took one afternoon.", rating: 5 },
  { id: "b", name: "Priya Nair", text: "The calendar sync just works.", rating: 5 },
  { id: "c", name: "Leo Martins", text: "Fast, quiet, well documented.", rating: 4 },
];

export function MiniInbox() {
  const [state, setState] = useState<Record<string, "approved" | "hidden" | undefined>>({ b: "approved" });
  return (
    <div className="mx-auto w-full max-w-[440px] divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
      {QUEUE.map((t) => {
        const s = state[t.id];
        return (
          <div key={t.id} className={cn("relative flex items-center gap-3 px-4 py-3.5 transition-opacity", s === "hidden" && "opacity-45")}>
            {!s && <span className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-ink" aria-hidden />}
            <Avatar size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{t.name}</span>
                <Stars value={t.rating} size={10} />
              </div>
              <div className="truncate text-[13px] text-muted">{t.text}</div>
            </div>
            <div className="flex gap-0.5">
              {(
                [
                  ["approved", "Approve", Check],
                  ["hidden", "Hide", EyeOff],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`${label} ${t.name}`}
                  aria-pressed={s === key}
                  onClick={() => setState((x) => ({ ...x, [t.id]: s === key ? undefined : key }))}
                  className={cn(
                    "grid size-8 place-items-center rounded-[6px] transition-[background-color,color,scale] active:scale-90",
                    s === key ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon className="size-4" strokeWidth={key === "approved" ? 2.5 : 2} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The layouts the sample reviews can show (video, gallery, popup and logos need real media or a host page).
const TYPES: WidgetType[] = ["wall", "grid", "list", "carousel", "marquee", "single", "hero", "badge", "avatars"];
const ACCENTS = ["#1d1d1f", "#0a84ff", "#30b158", "#ff375f"];

export function LayoutDemo({ appUrl }: { appUrl: string }) {
  const [type, setType] = useState<WidgetType>("marquee");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const config = { ...defaultConfig(type, accent), theme, max: type === "wall" || type === "grid" ? 6 : 12, showSource: true };
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between">
        <Segmented
          variant="tabs"
          label="Layout"
          className="no-scrollbar overflow-x-auto [&>button]:shrink-0"
          value={type}
          onChange={setType}
          options={TYPES.map((t) => ({ value: t, label: t === "badge" ? "Badge" : WIDGET_LABELS[t] }))}
        />
        <div className="flex items-center gap-2 pb-2.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              aria-pressed={accent === c}
              onClick={() => setAccent(c)}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-canvas transition-transform active:scale-90",
                accent === c && "ring-[1.5px] ring-ink",
              )}
              style={{ background: c }}
            />
          ))}
          <Segmented
            label="Theme"
            size="sm"
            className="ml-2 w-[110px]"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>
      <div
        className={cn(
          "mt-6 rounded-[12px] px-3 py-8 ring-1 ring-line transition-colors duration-300 sm:px-8 sm:py-10",
          theme === "dark" ? "bg-[#0d0d0c]" : "bg-grouped",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(INLINE.includes(type) && "flex justify-center")}
          >
            <WidgetPreview
              widgetId="demo"
              type={type}
              config={config}
              items={SAMPLES}
              space={{ name: "Northwind", slug: "northwind", logo: null, website: null }}
              appUrl={appUrl}
              minHeight={INLINE.includes(type) ? 60 : 200}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
