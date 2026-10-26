"use client";

import { AnimatePresence, motion } from "motion/react";
import { BarChart3, Code2, Copy, ExternalLink, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Link } from "@/components/app/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createWidget, deleteWidget, duplicateWidget } from "@/app/actions/widgets";
import { PageHeader } from "@/components/app/shell";
import { PAGE } from "@/lib/layout";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SPRING } from "@/components/ui/motion";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { WIDGET_LABELS, WIDGET_TYPES, type WidgetType } from "@/lib/widget/config";
import { EmbedSheet } from "./embed-sheet";
import { TypeArt } from "./type-art";

export type WidgetRow = { id: string; name: string; type: WidgetType; updated_at: string; views?: number };

const VIEWS = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function NewWidgetSheet({ spaceId, open, onOpenChange }: { spaceId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<WidgetType | null>(null);
  async function pick(type: WidgetType) {
    setBusy(type);
    const res = await createWidget(spaceId, type);
    if (!res.ok) {
      setBusy(null);
      return toast.error(res.error);
    }
    router.push(`/app/${spaceId}/widgets/${res.data.id}`);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New widget" wide>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
        {WIDGET_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={busy !== null}
            onClick={() => void pick(type)}
            className="group flex flex-col overflow-hidden rounded-[10px] bg-surface text-left ring-1 ring-line transition-[box-shadow,scale] hover:ring-ink/25 active:scale-[0.98] disabled:opacity-60"
          >
            <TypeArt type={type} className="rounded-none border-b border-line bg-grouped" />
            <span className="flex items-center gap-1.5 px-3 py-2.5 text-[14px] font-medium">
              {WIDGET_LABELS[type]}
              {busy === type && <Loader2 className="size-3.5 animate-spin" />}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function WidgetList({ spaceId, widgets: initial, appUrl }: { spaceId: string; widgets: WidgetRow[]; appUrl: string }) {
  const router = useRouter();
  const [widgets, setWidgets] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [embed, setEmbed] = useState<string | null>(null);

  async function remove(w: WidgetRow) {
    const ok = await confirmAction({
      title: `Delete “${w.name}”?`,
      message: "Sites embedding it will show nothing.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const before = widgets;
    setWidgets((list) => list.filter((x) => x.id !== w.id));
    const res = await deleteWidget(spaceId, w.id);
    if (!res.ok) {
      setWidgets(before);
      toast.error(res.error);
    } else toast.success("Deleted");
  }

  async function duplicate(w: WidgetRow) {
    const res = await duplicateWidget(spaceId, w.id);
    if (!res.ok) return toast.error(res.error);
    toast.success("Duplicated");
    router.refresh();
  }

  return (
    <div className="pb-24">
      <PageHeader title="Widgets">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" strokeWidth={2.5} /> New widget
        </Button>
      </PageHeader>
      <div className={PAGE}>
        {widgets.length === 0 ? (
          <div className="flex animate-view flex-col items-center py-20 text-center">
            <TypeArt type="wall" className="h-[96px] w-[180px] ring-1 ring-line" />
            <h2 className="mt-6 font-display text-[20px] font-semibold">No widgets yet</h2>
            <Button className="mt-5" onClick={() => setCreating(true)}>
              <Plus className="size-4" strokeWidth={2.5} /> New widget
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {widgets.map((w) => (
                <motion.li
                  key={w.id}
                  layout
                  exit={{ opacity: 0, transition: { duration: 0.14 } }}
                  transition={SPRING}
                  className="group relative"
                >
                  <Link
                    href={`/app/${spaceId}/widgets/${w.id}`}
                    className="block overflow-hidden rounded-[12px] bg-surface ring-1 ring-line transition-[box-shadow,scale] hover:ring-ink/25 active:scale-[0.99]"
                  >
                    <TypeArt type={w.type} className="h-[136px] rounded-none border-b border-line bg-grouped" />
                    <div className="px-4 py-3">
                      <div className="truncate pr-10 text-[14.5px] font-medium">{w.name}</div>
                      <div className="flex gap-1.5 pr-10 text-[13px] text-muted">
                        <span className="truncate">{WIDGET_LABELS[w.type]}</span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0 tabular-nums" title="Views, last 30 days">
                          {VIEWS.format(w.views ?? 0)} {w.views === 1 ? "view" : "views"}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <Menu>
                    <MenuTrigger
                      className="absolute right-2.5 bottom-3.5 grid size-9 place-items-center rounded-[8px] text-muted transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-soft data-[state=open]:bg-surface-2"
                      aria-label={`More for ${w.name}`}
                    >
                      <MoreHorizontal className="size-[18px]" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setEmbed(w.id)}>
                        <Code2 /> Embed
                      </MenuItem>
                      <MenuItem onSelect={() => window.open(`${appUrl}/w/${w.id}`, "_blank", "noopener")}>
                        <ExternalLink /> Open page
                      </MenuItem>
                      <MenuItem onSelect={() => router.push(`/app/${spaceId}/widgets/${w.id}?tab=stats`)}>
                        <BarChart3 /> Stats
                      </MenuItem>
                      <MenuItem onSelect={() => void duplicate(w)}>
                        <Copy /> Duplicate
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive onSelect={() => void remove(w)}>
                        <Trash2 /> Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </motion.li>
              ))}
            </AnimatePresence>
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={cn(
                  "flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-[14px] font-medium text-muted transition-colors hover:bg-surface hover:text-ink",
                )}
              >
                <Plus className="size-5" /> New widget
              </button>
            </li>
          </ul>
        )}
      </div>
      <NewWidgetSheet spaceId={spaceId} open={creating} onOpenChange={setCreating} />
      {embed && (
        <EmbedSheet
          open={embed !== null}
          onOpenChange={(o) => !o && setEmbed(null)}
          appUrl={appUrl}
          widgetId={embed}
          type={widgets.find((w) => w.id === embed)?.type}
        />
      )}
    </div>
  );
}
