"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSummary, summarizeSpace } from "@/app/actions/ai";
import { timeAgo } from "@/components/inbox/item";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { StoredSummary } from "@/lib/ai/summary";
import { cn } from "@/lib/cn";

// What the testimonials say: an overview, themes with quotes, and what people struggle with. Made on demand.
export function SummarySheet({ spaceId, open, onOpenChange }: { spaceId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [summary, setSummary] = useState<StoredSummary | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || summary !== undefined) return;
    let live = true;
    void getSummary(spaceId).then((res) => {
      if (!live) return;
      if (!res.ok) {
        toast.error(res.error);
        setSummary(null);
      } else setSummary(res.data);
    });
    return () => {
      live = false;
    };
  }, [open, spaceId, summary]);

  async function run() {
    if (busy) return;
    setBusy(true);
    const res = await summarizeSpace(spaceId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (!res.data) return toast.error("No testimonials with text yet");
    setSummary(res.data);
  }

  const s = summary?.summary;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Summary"
      wide
      footer={
        summary ? (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[13px] text-muted" suppressHydrationWarning>
              {summary.count} {summary.count === 1 ? "testimonial" : "testimonials"} · {timeAgo(summary.createdAt)}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void run()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
            </Button>
          </div>
        ) : undefined
      }
    >
      {summary === undefined ? (
        <div className="space-y-3 p-5" aria-busy>
          <div className="h-4 w-11/12 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
      ) : !s ? (
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <p className="text-[15px] font-medium">No summary yet</p>
          <p className="mt-1 text-[13.5px] text-muted">Themes and quotes from your testimonials.</p>
          <Button className="mt-5" onClick={() => void run()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} {busy ? "Summarizing" : "Summarize"}
          </Button>
        </div>
      ) : (
        <div className={cn("space-y-7 p-5 transition-opacity md:p-6", busy && "opacity-50")} aria-busy={busy} data-testid="summary">
          <p className="text-[15.5px] leading-[1.6] [overflow-wrap:anywhere]">{s.overview}</p>
          {s.themes.length > 0 && (
            <section>
              <h3 className="text-[13px] font-medium text-muted">Themes</h3>
              <ol className="mt-2 divide-y divide-line">
                {s.themes.map((t, i) => (
                  <li key={i} className="py-3.5 first:pt-1.5">
                    <p className="text-[15px] font-medium">{t.title}</p>
                    <p className="mt-0.5 text-[14px] leading-snug text-muted">{t.detail}</p>
                    {t.quotes.map((q, j) => (
                      <blockquote
                        key={j}
                        className="mt-2.5 border-s-2 border-line ps-3 text-[14px] leading-[1.55] [overflow-wrap:anywhere]"
                      >
                        “{q.text}” <span className="text-muted">— {q.name}</span>
                      </blockquote>
                    ))}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {s.concerns.length > 0 && (
            <section>
              <h3 className="text-[13px] font-medium text-muted">To work on</h3>
              <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[14px] leading-snug marker:text-faint">
                {s.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
