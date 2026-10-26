"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { findReviews, importFound, type Preview, type PreviewItem } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SourceIcon } from "@/components/ui/source-icon";
import { Stars } from "@/components/ui/stars";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { Source } from "@/lib/sources";
import { formatDate } from "@/lib/widget/render";
import { Checkbox, OptionRow, plural, StatusChoice, StepFooter } from "./import-parts";

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; preview: Preview };

const AUTO = [
  { value: "off", label: "Off" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars and up" },
  { value: "3", label: "3 stars and up" },
];

function initialPick(p: Preview): Set<string> {
  const fresh = p.items.filter((i) => !i.exists);
  if (p.pick === "none") return new Set();
  if (p.pick === "first") return new Set(fresh.slice(0, 1).map((i) => i.url));
  return new Set(fresh.map((i) => i.url));
}

// One source: its link, a preview of what's there with checkboxes, then import.
export function SourceStep({
  spaceId,
  source,
  initialQuery,
  onDone,
}: {
  spaceId: string;
  source: Source;
  initialQuery: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [phase, setPhase] = useState<Phase>(initialQuery ? { kind: "loading" } : { kind: "idle" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"approved" | "new">("approved");
  const [sync, setSync] = useState(false);
  const [auto, setAuto] = useState("off");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  function find() {
    if (!query.trim()) return input.current?.focus();
    setPhase({ kind: "loading" });
    void load(query);
  }

  async function load(q: string) {
    const id = ++request.current;
    const res = await findReviews(spaceId, { source: source.id, query: q.trim() });
    if (id !== request.current) return;
    if (!res.ok) return setPhase({ kind: "error", message: res.error });
    setPhase({ kind: "ready", preview: res.data });
    setPicked(initialPick(res.data));
    setSync(res.data.connected);
  }

  // A link pasted on the first screen goes straight to its preview.
  useEffect(() => {
    if (initialQuery) void load(initialQuery);
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = phase.kind === "ready" ? phase.preview : null;
  const fresh = useMemo(() => preview?.items.filter((i) => !i.exists) ?? [], [preview]);
  const imported = (preview?.items.length ?? 0) - fresh.length;
  const allPicked = fresh.length > 0 && fresh.every((i) => picked.has(i.url));

  async function submit() {
    if (!preview || busy) return;
    const items = fresh.filter((i) => picked.has(i.url)).map(({ exists, ...i }) => (void exists, i));
    if (!items.length && !sync) return;
    setBusy(true);
    const res = await importFound(spaceId, {
      source: source.id,
      items,
      status,
      sync: sync
        ? {
            input: preview.input,
            label: preview.label,
            since: preview.items.reduce<string | null>((max, i) => (i.date && (!max || i.date > max) ? i.date : max), null),
            autoApprove: auto === "off" ? null : Number(auto),
          }
        : null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const parts = [items.length ? `Imported ${res.data.added}` : "", res.data.skipped ? `skipped ${res.data.skipped}` : ""];
    if (res.data.connected) parts.push(items.length ? "in sync" : `${preview.label} in sync`);
    toast.success(parts.filter(Boolean).join(" · ") || "Done");
    onDone();
  }

  const count = fresh.filter((i) => picked.has(i.url)).length;

  return (
    <div className="flex min-h-full animate-view flex-col">
      <div className="space-y-4 px-5 pt-4 pb-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
              <SourceIcon source={source.id} className="size-4" />
            </span>
            <input
              ref={input}
              aria-label={`${source.label} link`}
              placeholder={source.example ?? "Link"}
              inputMode="url"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(inputClass, "pl-9")}
            />
          </label>
          <Button type="submit" variant="secondary" className="h-11 md:h-10" disabled={phase.kind === "loading"}>
            {phase.kind === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
            Find
          </Button>
        </form>

        {phase.kind === "error" && (
          <p role="alert" className="text-[13px] text-danger">
            {phase.message}
          </p>
        )}

        {phase.kind === "loading" && (
          <div className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 px-4 py-3.5">
                <div className="size-[18px] skeleton rounded-[5px]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 skeleton" />
                  <div className="h-3 w-full skeleton" />
                  <div className="h-3 w-3/4 skeleton" />
                </div>
              </div>
            ))}
          </div>
        )}

        {preview && (
          <div className="animate-view space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 truncate text-[15px] font-medium">{preview.label}</h3>
              {preview.items.length > 0 && (
                <span className="shrink-0 text-[13px] text-muted tabular-nums">
                  {plural(preview.items.length, "review")}
                  {imported > 0 && ` · ${imported} imported`}
                </span>
              )}
            </div>
            {preview.note && <p className="-mt-2 text-[13px] text-muted">{preview.note}</p>}

            {preview.items.length > 0 && (
              <div className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line">
                <OptionRow label="Import as">
                  <StatusChoice value={status} onChange={setStatus} />
                </OptionRow>
                {preview.syncable && (
                  <OptionRow label="Keep in sync" htmlFor="import-sync">
                    <Switch id="import-sync" on={sync} onChange={setSync} />
                  </OptionRow>
                )}
                {preview.syncable && sync && (
                  <OptionRow label="Auto-approve">
                    <Select aria-label="Auto-approve" value={auto} onChange={setAuto} options={AUTO} className="min-w-36" />
                  </OptionRow>
                )}
              </div>
            )}

            {preview.items.length === 0 ? (
              <div className="rounded-[12px] py-10 text-center ring-1 ring-line">
                <p className="text-[15px] font-medium">No reviews found</p>
              </div>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-label="Found">
                {fresh.length > 1 && (
                  <li className="flex items-center gap-3 bg-surface-2/50 px-4 py-2.5">
                    <Checkbox
                      label="Select all"
                      checked={allPicked}
                      onChange={(on) => setPicked(on ? new Set(fresh.map((i) => i.url)) : new Set())}
                    />
                    <span className="text-[13px] text-muted">{allPicked ? "All selected" : `${count} of ${fresh.length} selected`}</span>
                  </li>
                )}
                {preview.items.map((item) => (
                  <FoundRow
                    key={item.url}
                    item={item}
                    checked={picked.has(item.url)}
                    onChange={(on) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (on) n.add(item.url);
                        else n.delete(item.url);
                        return n;
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {preview && preview.items.length > 0 && (
        <StepFooter>
          <span />
          <Button onClick={() => void submit()} disabled={busy || (!count && !sync)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {count ? `Import ${count}` : sync ? "Keep in sync" : "Import"}
          </Button>
        </StepFooter>
      )}
    </div>
  );
}

function FoundRow({ item, checked, onChange }: { item: PreviewItem; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <li>
      <label className={cn("flex gap-3 px-4 py-3.5", item.exists ? "opacity-60" : "cursor-pointer hover:bg-surface-2/60")}>
        <Checkbox
          className="mt-0.5"
          label={`Import review from ${item.name}`}
          checked={checked || item.exists}
          disabled={item.exists}
          onChange={onChange}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[14px] font-medium">{item.name}</span>
              {item.rating ? <Stars value={item.rating} size={11} className="shrink-0" /> : null}
            </span>
            <span className="shrink-0 text-[12px] text-muted tabular-nums">
              {item.exists ? "Imported" : item.date ? formatDate(item.date) : ""}
            </span>
          </span>
          <span className="mt-1 line-clamp-3 block text-[13.5px] leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line text-muted">
            {item.text}
          </span>
        </span>
      </label>
    </li>
  );
}
