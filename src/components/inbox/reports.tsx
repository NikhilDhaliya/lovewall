"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { resolveReport } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import type { ReportItem } from "@/lib/privacy";

const REASON: Record<string, string> = {
  me: "About them, wants it removed",
  false: "False or misleading",
  offensive: "Offensive",
  other: "Something else",
};

const DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

// Reports from wall pages and widgets, above the inbox until someone acts on them.
export function ReportsQueue({ spaceId, initial }: { spaceId: string; initial: ReportItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  async function act(r: ReportItem, action: "hide" | "delete" | "dismiss") {
    if (action === "delete") {
      const sure = await confirmAction({
        title: `Delete ${r.name}’s testimonial?`,
        message: "Its files go too. This can’t be undone.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!sure) return;
    }
    setBusy(r.id);
    const res = await resolveReport(spaceId, r.id, action);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    // Hiding or deleting answers every report on that testimonial.
    setItems((list) => list.filter((x) => (action === "dismiss" ? x.id !== r.id : x.testimonialId !== r.testimonialId)));
    toast.success(action === "hide" ? "Hidden" : action === "delete" ? "Deleted" : "Dismissed");
    router.refresh();
  }

  return (
    <section className="mb-6" aria-label="Reports" data-testid="reports">
      <h2 className="flex items-center gap-2 pb-2 text-[13px] font-medium text-muted">
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        Reports <span className="tabular-nums">{items.length}</span>
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
        {items.map((r) => (
          <div key={r.id} className="px-4 py-3.5 md:px-5" data-testid="report">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14.5px] font-medium">{r.name}</span>
              <time className="shrink-0 text-[12px] text-muted tabular-nums" dateTime={r.createdAt}>
                {DAY.format(new Date(r.createdAt))}
              </time>
            </div>
            {r.text && <p className="mt-0.5 line-clamp-2 text-[13.5px] text-muted">{r.text}</p>}
            <p className="mt-2 text-[14px]">
              {REASON[r.reason] ?? REASON.other}
              {r.email && <span className="text-muted"> · {r.email}</span>}
            </p>
            {r.details && <p className="mt-1 text-[14px] [overflow-wrap:anywhere] whitespace-pre-wrap text-muted">{r.details}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status !== "hidden" && (
                <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r, "hide")}>
                  Hide
                </Button>
              )}
              <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r, "delete")} className="text-danger">
                Delete
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r, "dismiss")} className="text-muted">
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
