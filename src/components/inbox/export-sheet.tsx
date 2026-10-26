"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import type { InboxFilters } from "@/lib/data/testimonials";

// Download the inbox as CSV or JSON: everything, or just what the current filter shows.
export function ExportSheet({
  spaceId,
  filters,
  total,
  open,
  onOpenChange,
}: {
  spaceId: string;
  filters: InboxFilters;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const filtered = filters.status !== "all" || Boolean(filters.source || filters.rating || filters.tag || filters.q);
  const [rows, setRows] = useState<"view" | "all">("view");
  const scope = filtered ? rows : "all";
  const params = new URLSearchParams({ format });
  if (scope === "view") {
    params.set("status", filters.status);
    if (filters.source) params.set("source", filters.source);
    if (filters.rating) params.set("rating", String(filters.rating));
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.q) params.set("q", filters.q);
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Export"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <a href={`/api/spaces/${spaceId}/export?${params}`} download onClick={() => setTimeout(() => onOpenChange(false), 300)}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        {filtered && (
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-muted">Rows</div>
            <Segmented
              label="Rows"
              value={rows}
              onChange={setRows}
              options={[
                { value: "view", label: "This view" },
                { value: "all", label: `All ${total}` },
              ]}
            />
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-muted">Format</div>
          <Segmented
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "csv", label: "CSV" },
              { value: "json", label: "JSON" },
            ]}
          />
        </div>
      </div>
    </Sheet>
  );
}
