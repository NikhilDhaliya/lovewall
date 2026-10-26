"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { copyMedia, type MediaJob } from "@/app/actions/import";
import { importCsv } from "@/app/actions/testimonials";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { csvToRows, type CsvPreset, type CsvRow } from "@/lib/csv";
import { DropZone, OptionRow, plural, StatusChoice, StepFooter } from "./import-parts";

const TEMPLATE =
  'name,title,company,text,rating,source,url,date,avatar,tags\nAda Lovelace,Founder,Analytical,"It just works.",5,LinkedIn,,2026-10-01,,launch';

export type CsvMode = "csv" | CsvPreset;

const HOW: Record<CsvPreset, { name: string; steps: string }> = {
  senja: { name: "Senja", steps: "In Senja, open Proof, then ⋯ › Export all to CSV." },
  testimonialto: { name: "Testimonial.to", steps: "In Testimonial.to, open your space, then Options › Export to CSV." },
};

export const csvTitle = (mode: CsvMode) => (mode === "csv" ? "CSV file" : `Move from ${HOW[mode].name}`);

// A CSV file: any spreadsheet, or an export from Senja or Testimonial.to (recognised by its columns). Rows go in
// first; photos, screenshots and videos in the export are then copied a few at a time, with a count at the end.
export function CsvStep({ spaceId, mode, onDone }: { spaceId: string; mode: CsvMode; onDone: () => void }) {
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [preset, setPreset] = useState<CsvPreset | null>(null);
  const [status, setStatus] = useState<"approved" | "new">("approved");
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState<{ done: number; total: number } | null>(null);

  async function read(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Up to 5 MB");
    const parsed = csvToRows(await file.text(), 1000);
    setFileName(file.name);
    setRows(parsed.rows);
    setMissing(parsed.missing);
    setPreset(parsed.preset);
    if (parsed.total > 1000) toast.message("Only the first 1,000 rows are imported");
  }

  async function copyAll(jobs: MediaJob[]) {
    let copied = 0;
    let failed = 0;
    setCopying({ done: 0, total: jobs.length });
    // Videos one at a time, photos three at a time: each call stays short.
    const batches: MediaJob[][] = [];
    for (const job of jobs) {
      const last = batches[batches.length - 1];
      if (last && !job.video && !last[0].video && last.length < 3) last.push(job);
      else batches.push([job]);
    }
    for (const batch of batches) {
      const res = await copyMedia(spaceId, batch);
      if (res.ok) {
        copied += res.data.copied;
        failed += res.data.failed;
      } else failed += batch.length;
      setCopying((c) => c && { ...c, done: c.done + batch.length });
    }
    setCopying(null);
    return { copied, failed };
  }

  async function submit() {
    if (!rows?.length || busy) return;
    setBusy(true);
    const res = await importCsv(spaceId, rows, { status, source: "CSV" });
    if (!res.ok) {
      setBusy(false);
      return toast.error(res.error);
    }
    const parts = [`Imported ${res.data.added}`];
    if (res.data.skipped) parts.push(`skipped ${res.data.skipped}`);
    if (res.data.media.length) {
      const media = await copyAll(res.data.media);
      parts.push(`${plural(media.copied, "file")} copied`);
      if (media.failed) parts.push(`${media.failed} failed`);
    }
    setBusy(false);
    toast.success(parts.join(" · "));
    onDone();
  }

  const how = mode === "csv" ? null : HOW[mode];
  const detected = preset ? `${HOW[preset].name} export · ` : "";

  return (
    <div className="flex min-h-full animate-view flex-col">
      <div className="space-y-4 px-5 pt-4 pb-5">
        {how && (
          <div className="text-[13.5px] leading-relaxed text-muted">
            <p>{how.steps}</p>
            <p>Choose that file here. Photos and videos come too.</p>
          </div>
        )}
        <DropZone
          label={fileName || "Choose a CSV file"}
          detail={
            rows ? (missing.length ? `Missing column: ${missing.join(", ")}` : `${detected}${plural(rows.length, "row")}`) : undefined
          }
          error={missing.length > 0}
          accept=".csv,text/csv"
          autoFocus
          onFiles={(files) => void read(files[0])}
        />
        {rows && rows.length > 0 && !missing.length && (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-label="First rows">
              {rows.slice(0, 3).map((r, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="truncate text-[14px] font-medium">{r.name}</div>
                  <div className={cn("line-clamp-2 text-[13px] text-muted", !r.text && "italic")}>{r.text || (r.video ? "Video" : "")}</div>
                </li>
              ))}
            </ul>
            <div className="overflow-hidden rounded-[12px] ring-1 ring-line">
              <OptionRow label="Import as">
                <StatusChoice value={status} onChange={setStatus} />
              </OptionRow>
            </div>
          </>
        )}
      </div>
      {(mode === "csv" || rows) && (
        <StepFooter>
          {copying ? (
            <span className="text-[13px] text-muted tabular-nums" aria-live="polite">
              Copying files {copying.done} of {copying.total}
            </span>
          ) : mode === "csv" ? (
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="lovewall-template.csv"
              className="text-[13px] font-medium text-muted hover:text-ink"
            >
              Template
            </a>
          ) : (
            <span />
          )}
          <Button onClick={() => void submit()} disabled={busy || !rows?.length || missing.length > 0}>
            {busy && <Loader2 className="size-4 animate-spin" />} Import{rows?.length && !missing.length ? ` ${rows.length}` : ""}
          </Button>
        </StepFooter>
      )}
    </div>
  );
}
