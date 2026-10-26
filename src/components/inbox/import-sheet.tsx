"use client";

import { ArrowRight, FileSpreadsheet, Images, Link2, MoveRight } from "lucide-react";
import { useEffect, useState } from "react";
import { listConnected, type Connected } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SourceIcon } from "@/components/ui/source-icon";
import { cn } from "@/lib/cn";
import { detectSource, SOURCES, toUrl, type Source } from "@/lib/sources";
import { csvTitle, CsvStep, type CsvMode } from "./import-csv";
import { HandStep } from "./import-hand";
import { PickRow } from "./import-parts";
import { ShotsStep } from "./import-shots";
import { SourceStep } from "./import-source";
import { SyncedList } from "./import-synced";
import type { EditPreset } from "./edit-sheet";

type Step =
  | { kind: "home" }
  | { kind: "source"; source: Source; query: string }
  | { kind: "hand"; source: Source; link: string }
  | { kind: "shots"; source?: string }
  | { kind: "csv"; mode: CsvMode };

// One sheet for every import: paste any link (the source is detected) or pick a source. Sites with an official feed,
// API or oEmbed endpoint show a preview to import from; the others show how to bring their reviews in by hand (export
// file, paste, screenshot, extension). Also screenshots, CSV files, moving from Senja or Testimonial.to, and synced
// sources.
export function ImportSheet({
  spaceId,
  open,
  onOpenChange,
  onImported,
  onPaste,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  onPaste: (preset: EditPreset) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "home" });
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [synced, setSynced] = useState<Connected[] | null>(null);
  const [seen, setSeen] = useState(open);

  // Each time it opens: back to the start, and the synced list fresh.
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setStep({ kind: "home" });
      setLink("");
      setLinkError(null);
    }
  }
  useEffect(() => {
    if (!open) return;
    let live = true;
    void listConnected(spaceId).then((r) => live && r.ok && setSynced(r.data));
    return () => {
      live = false;
    };
  }, [open, spaceId]);

  const detected = detectSource(link);

  function choose(s: Source, query = "") {
    setStep(s.how === "fetch" ? { kind: "source", source: s, query } : { kind: "hand", source: s, link: query });
  }

  function go(e?: React.FormEvent) {
    e?.preventDefault();
    const value = link.trim();
    if (!value) return;
    if (!detected) return setLinkError("Not a link we know. Pick a source below.");
    choose(detected, value);
  }

  function done() {
    onOpenChange(false);
    onImported();
  }

  const title =
    step.kind === "source" || step.kind === "hand"
      ? step.source.label
      : step.kind === "shots"
        ? "Screenshots"
        : step.kind === "csv"
          ? csvTitle(step.mode)
          : "Import";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      wide
      className="md:h-[min(720px,80vh)]"
      onBack={step.kind === "home" ? undefined : () => setStep({ kind: "home" })}
    >
      {step.kind === "source" ? (
        <SourceStep
          key={`${step.source.id}-${step.query}`}
          spaceId={spaceId}
          source={step.source}
          initialQuery={step.query}
          onDone={done}
        />
      ) : step.kind === "hand" ? (
        <HandStep
          source={step.source}
          onFile={() => step.source.file && setStep({ kind: "csv", mode: step.source.file })}
          onPaste={() => onPaste({ source: step.source.label, url: toUrl(step.link)?.href })}
          onShots={() => setStep({ kind: "shots", source: step.source.label })}
        />
      ) : step.kind === "shots" ? (
        <ShotsStep spaceId={spaceId} initialSource={step.source} onDone={done} />
      ) : step.kind === "csv" ? (
        <CsvStep key={step.mode} spaceId={spaceId} mode={step.mode} onDone={done} />
      ) : (
        <div className="animate-view space-y-6 px-5 pt-4 pb-6">
          <form onSubmit={go} className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
                {detected?.icon ? <SourceIcon source={detected.id} /> : <Link2 className="size-4" />}
              </span>
              <input
                autoFocus
                aria-label="Link"
                placeholder="Paste a link to a review or post"
                inputMode="url"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLinkError(null);
                }}
                aria-describedby="import-link-state"
                className={cn(inputClass, "pl-9", detected && "pr-24")}
              />
              {detected && (
                <span
                  aria-live="polite"
                  className="pointer-events-none absolute top-1/2 right-3 max-w-24 -translate-y-1/2 truncate text-[12.5px] text-muted"
                >
                  {detected.label}
                </span>
              )}
            </label>
            <Button type="submit" variant="secondary" className="h-11 md:h-10" disabled={!link.trim()} aria-label="Continue">
              <ArrowRight className="size-4" />
            </Button>
          </form>
          {linkError && (
            <p id="import-link-state" role="alert" className="-mt-4 text-[13px] text-danger">
              {linkError}
            </p>
          )}

          {synced && synced.length > 0 && (
            <section>
              <h3 className="pb-2 text-[13px] font-medium text-muted">In sync</h3>
              <SyncedList spaceId={spaceId} items={synced} onChange={setSynced} onSynced={onImported} />
            </section>
          )}

          <SourceGroup title="Review sites" sources={SOURCES.filter((s) => s.group === "reviews")} onPick={choose} />
          <SourceGroup title="Social" sources={SOURCES.filter((s) => s.group === "social")} onPick={choose} />

          <section>
            <h3 className="pb-2 text-[13px] font-medium text-muted">Files</h3>
            <div className="grid overflow-hidden rounded-[12px] ring-1 ring-line sm:grid-cols-2">
              <PickRow icon={<Images className="size-4" />} label="Screenshots" onClick={() => setStep({ kind: "shots" })} />
              <PickRow
                icon={<FileSpreadsheet className="size-4" />}
                label="CSV file"
                onClick={() => setStep({ kind: "csv", mode: "csv" })}
              />
              <PickRow
                icon={<MoveRight className="size-4" />}
                label="Move from Senja"
                onClick={() => setStep({ kind: "csv", mode: "senja" })}
              />
              <PickRow
                icon={<MoveRight className="size-4" />}
                label="Move from Testimonial.to"
                onClick={() => setStep({ kind: "csv", mode: "testimonialto" })}
              />
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function SourceGroup({ title, sources, onPick }: { title: string; sources: Source[]; onPick: (s: Source) => void }) {
  return (
    <section>
      <h3 className="pb-2 text-[13px] font-medium text-muted">{title}</h3>
      <div className="grid overflow-hidden rounded-[12px] ring-1 ring-line sm:grid-cols-2">
        {sources.map((s) => (
          <PickRow key={s.id} icon={<SourceIcon source={s.id} />} label={s.label} onClick={() => onPick(s)} />
        ))}
      </div>
    </section>
  );
}
