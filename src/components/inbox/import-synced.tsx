"use client";

import { Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { removeConnected, syncConnected, updateConnected, type Connected } from "@/app/actions/import";
import { confirmAction } from "@/components/ui/confirm";
import { Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SourceIcon } from "@/components/ui/source-icon";
import { cn } from "@/lib/cn";
import { sourceById } from "@/lib/sources";
import { timeAgo } from "./import-parts";

const AUTO: [number | null, string][] = [
  [null, "Off"],
  [5, "5 stars"],
  [4, "4 stars and up"],
  [3, "3 stars and up"],
];

function statusLine(c: Connected) {
  if (c.lastError) return c.lastError;
  if (!c.lastRunAt) return "Checks daily";
  const found = c.lastAdded ? `${c.lastAdded} new` : "nothing new";
  return `Checked ${timeAgo(c.lastRunAt)} · ${found}`;
}

// Sources kept in sync: when they last ran and what they found, with sync now, auto-approve and stop.
export function SyncedList({
  spaceId,
  items,
  onChange,
  onSynced,
}: {
  spaceId: string;
  items: Connected[];
  onChange: (items: Connected[]) => void;
  onSynced: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function syncNow(c: Connected) {
    setBusy(c.id);
    const res = await syncConnected(spaceId, c.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    onChange(items.map((x) => (x.id === c.id ? res.data : x)));
    if (res.data.lastError) toast.error(res.data.lastError);
    else {
      toast.success(res.data.lastAdded ? `${res.data.lastAdded} new` : "Nothing new");
      if (res.data.lastAdded) onSynced();
    }
  }

  async function setAuto(c: Connected, autoApprove: number | null) {
    const res = await updateConnected(spaceId, c.id, { autoApprove });
    if (!res.ok) return toast.error(res.error);
    onChange(items.map((x) => (x.id === c.id ? res.data : x)));
    toast.success(autoApprove ? "Auto-approve on" : "Auto-approve off");
  }

  async function remove(c: Connected) {
    const ok = await confirmAction({
      title: `Stop syncing ${c.label}?`,
      message: "Imported reviews stay.",
      confirmLabel: "Stop",
      destructive: true,
    });
    if (!ok) return;
    const res = await removeConnected(spaceId, c.id);
    if (!res.ok) return toast.error(res.error);
    onChange(items.filter((x) => x.id !== c.id));
    toast.success("Stopped");
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-label="In sync">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
          <SourceIcon source={c.source} className="size-4 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{c.label || sourceById(c.source)?.label}</div>
            <div className={cn("truncate text-[12.5px]", c.lastError ? "text-danger" : "text-muted")}>{statusLine(c)}</div>
          </div>
          {busy === c.id && <Loader2 className="size-4 animate-spin text-muted" aria-label="Syncing" />}
          <Menu>
            <MenuTrigger
              className="grid size-9 place-items-center rounded-[8px] text-muted transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-soft data-[state=open]:bg-surface-2"
              aria-label={`${c.label} options`}
            >
              <MoreHorizontal className="size-[18px]" />
            </MenuTrigger>
            <MenuContent className="w-56">
              <MenuItem disabled={busy === c.id} onSelect={() => void syncNow(c)}>
                <RefreshCw /> Sync now
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Auto-approve</MenuLabel>
              {AUTO.map(([value, label]) => (
                <MenuCheck key={label} checked={c.autoApprove === value} onCheckedChange={() => void setAuto(c, value)}>
                  {label}
                </MenuCheck>
              ))}
              <MenuSeparator />
              <MenuItem destructive onSelect={() => void remove(c)}>
                <Trash2 /> Stop syncing
              </MenuItem>
            </MenuContent>
          </Menu>
        </li>
      ))}
    </ul>
  );
}
