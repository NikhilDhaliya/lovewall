"use client";

import { Check, ChevronLeft, Code2, ExternalLink, Loader2, Monitor, Smartphone } from "lucide-react";
import { Link } from "@/components/app/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { updateWidget } from "@/app/actions/widgets";
import { PAGE } from "@/lib/layout";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import type { PublicSpace, PublicTestimonial, WidgetStats } from "@/lib/types";
import { INLINE, ONE_UP, parseConfig, WIDGET_LABELS, type WidgetConfig, type WidgetType } from "@/lib/widget/config";
import { DesignPanel } from "./design-panel";
import { EmbedSheet } from "./embed-sheet";
import { PagePanel } from "./page-panel";
import { PagePreview, WidgetPreview } from "./preview";
import { StatsPanel } from "./stats-panel";

export type ConfiguratorTab = "design" | "page" | "stats";

export function Configurator({
  spaceId,
  widget,
  items,
  sample,
  tags,
  space,
  appUrl,
  stats,
  initialTab = "design",
  ai = false,
  translations = {},
}: {
  spaceId: string;
  widget: { id: string; name: string; type: WidgetType; config: WidgetConfig };
  items: PublicTestimonial[];
  sample: boolean;
  tags: string[];
  space: PublicSpace;
  appUrl: string;
  stats: WidgetStats;
  initialTab?: ConfiguratorTab;
  // AI (when a key is set): best lines and languages, and the translations the space has, for the preview.
  ai?: boolean;
  translations?: Record<string, Record<string, { text: string; highlight: string | null }>>;
}) {
  const [name, setName] = useState(widget.name);
  const [type, setType] = useState<WidgetType>(widget.type);
  const [config, setConfig] = useState<WidgetConfig>(widget.config);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [tab, setTab] = useState<ConfiguratorTab>(initialTab);
  const [embedOpen, setEmbedOpen] = useState(false);
  const first = useRef(true);
  const version = useRef(0);

  const set = <K extends keyof WidgetConfig>(k: K, v: WidgetConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  // What the previews render: the same clean-up the server applies on save (links, lengths).
  const shown = useMemo(() => parseConfig(config), [config]);
  const previewItems = useMemo(() => {
    const tr = shown.language ? translations[shown.language] : undefined;
    return tr ? items.map((t) => (tr[t.id] ? { ...t, ...tr[t.id] } : t)) : items;
  }, [items, shown.language, translations]);

  // Autosave (debounced). Every change is live in the preview at once.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const v = ++version.current;
    setSaving("saving");
    const id = setTimeout(async () => {
      const res = await updateWidget(spaceId, widget.id, { name: name.trim() || WIDGET_LABELS[type], type, config });
      if (v !== version.current) return;
      if (!res.ok) {
        setSaving("idle");
        toast.error(res.error);
      } else setSaving("saved");
    }, 500);
    return () => clearTimeout(id);
  }, [config, type, name, spaceId, widget.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        toast.success("Saved");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The preview sits on a page in the widget's own theme ("auto" follows the app), so light text never lands on a
  // dark page or the other way round.
  const surface =
    config.theme === "dark"
      ? "bg-[#0d0d0c] ring-white/10"
      : config.theme === "light"
        ? "bg-[#f4f4f2] ring-black/[0.07]"
        : "bg-grouped ring-line";
  const surfaceText = config.theme === "dark" ? "text-[#a3a29d]" : config.theme === "light" ? "text-[#64635f]" : "text-muted";
  const compact = INLINE.includes(type) || ONE_UP.includes(type) || type === "logos";
  const deviceToggle = (
    <Segmented
      label="Preview size"
      size="sm"
      className="w-[96px]"
      value={device}
      onChange={setDevice}
      options={[
        { value: "desktop", label: <Monitor className="mx-auto size-3.5" aria-label="Desktop" /> },
        { value: "phone", label: <Smartphone className="mx-auto size-3.5" aria-label="Phone" /> },
      ]}
    />
  );

  const widgetPreview = (
    <div
      className={cn(
        "relative flex justify-center overflow-hidden rounded-[12px] px-4 py-8 ring-1 ring-line transition-colors md:min-h-[calc(100dvh-218px)] md:px-8 md:py-12",
        type === "popup" ? "h-[440px] p-0 md:h-[calc(100dvh-218px)] md:p-0" : compact ? "min-h-[160px]" : "min-h-[320px]",
        surface,
      )}
    >
      {sample && <span className={cn("absolute top-3 left-4 z-10 text-[12px]", surfaceText)}>Sample data</span>}
      <div
        className={cn(
          "w-full transition-[max-width] duration-300 ease-out",
          device === "phone" ? "max-w-[390px]" : "max-w-[1040px]",
          INLINE.includes(type) && "flex justify-center",
          (type === "logos" || ONE_UP.includes(type)) && "self-center",
          type === "popup" && "h-full",
        )}
      >
        <WidgetPreview
          widgetId={widget.id}
          type={type}
          config={shown}
          items={previewItems}
          space={space}
          appUrl={appUrl}
          minHeight={INLINE.includes(type) ? 56 : 160}
          fill={type === "popup"}
        />
      </div>
    </div>
  );

  const pagePreview = (
    <div className="overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
      <div className="flex h-9 items-center gap-1.5 border-b border-line px-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="size-2.5 rounded-full bg-surface-3" />
        <span className="mx-auto max-w-[60%] -translate-x-6 truncate text-[12px] text-faint">
          {appUrl.replace(/^https?:\/\//, "")}/w/{widget.id}
        </span>
      </div>
      <div className={cn("flex justify-center", surface)}>
        <PagePreview
          widgetId={widget.id}
          config={shown}
          items={previewItems}
          space={space}
          appUrl={appUrl}
          className={cn(
            "h-[560px] transition-[max-width] duration-300 ease-out md:h-[calc(100dvh-254px)]",
            device === "phone" ? "max-w-[390px]" : "max-w-none",
          )}
        />
      </div>
    </div>
  );

  return (
    <div className="pb-24 md:pb-6">
      <h1 className="sr-only">{name || "Widget"}</h1>
      <div className="sticky top-14 z-20 bar md:top-0">
        <div className={cn(PAGE, "flex h-14 items-center gap-2")}>
          <Link
            href={`/app/${spaceId}/widgets`}
            className="flex h-9 items-center gap-0.5 rounded-lg pr-2 text-[14px] font-medium text-muted transition-colors hover:text-ink"
            aria-label="Back to widgets"
          >
            <ChevronLeft className="size-5" /> <span className="max-sm:hidden">Widgets</span>
          </Link>
          <input
            aria-label="Widget name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="h-9 min-w-0 flex-1 rounded-[8px] bg-transparent px-2 font-display text-[16px] font-medium transition-colors outline-none hover:bg-surface-2 focus:bg-surface-2 md:max-w-[320px]"
          />
          <span className="flex w-16 items-center justify-end gap-1 text-[12px] text-faint" aria-live="polite">
            {saving === "saving" && <Loader2 className="size-3.5 animate-spin" />}
            {saving === "saved" && (
              <>
                <Check className="size-3.5" strokeWidth={2.5} /> Saved
              </>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="icon" asChild className="max-sm:hidden">
              <a href={`${appUrl}/w/${widget.id}`} target="_blank" rel="noopener" aria-label="Open page">
                <ExternalLink className="size-4" />
              </a>
            </Button>
            <Button onClick={() => setEmbedOpen(true)}>
              <Code2 className="size-4" /> Embed
            </Button>
          </div>
        </div>
      </div>

      <div className={cn(PAGE, "pt-1")}>
        <Segmented
          variant="tabs"
          label="Section"
          value={tab}
          onChange={setTab}
          className="mb-4 shadow-[inset_0_-1px_0_var(--line)]"
          options={[
            { value: "design", label: "Design" },
            { value: "page", label: "Page" },
            { value: "stats", label: "Stats" },
          ]}
        />
      </div>

      {tab === "stats" ? (
        <div className={cn(PAGE, "animate-view")}>
          <div className="max-w-[880px]">
            <StatsPanel stats={stats} appHost={new URL(appUrl).hostname} />
          </div>
        </div>
      ) : (
        <div className={cn(PAGE, "grid animate-view gap-5 md:grid-cols-[1fr_320px] md:gap-6")} key={tab}>
          <div className="md:sticky md:top-16 md:self-start">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">{tab === "page" ? "Wall page" : "Preview"}</span>
              {deviceToggle}
            </div>
            {tab === "page" ? pagePreview : widgetPreview}
          </div>
          <div className="divide-y divide-line md:max-h-[calc(100dvh-120px)] md:overflow-y-auto md:pr-1">
            {tab === "page" ? (
              <PagePanel config={config} set={set} spaceName={space.name} />
            ) : (
              <DesignPanel type={type} setType={setType} config={config} set={set} items={items} tags={tags} ai={ai} />
            )}
          </div>
        </div>
      )}
      <EmbedSheet open={embedOpen} onOpenChange={setEmbedOpen} appUrl={appUrl} widgetId={widget.id} type={type} />
    </div>
  );
}
