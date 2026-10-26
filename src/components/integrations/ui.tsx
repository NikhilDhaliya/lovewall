"use client";

import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

// Small pieces shared by the integrations settings (keys, webhooks, Slack and Discord).

export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-2.5 px-4 text-left text-[14.5px] font-medium transition-colors outline-none hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring)]"
    >
      <Plus className="size-4 text-muted" strokeWidth={2.5} />
      {label}
    </button>
  );
}

export function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 text-[14.5px] select-none">
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <span className="size-5 rounded-[6px] bg-surface ring-1 ring-line transition-colors peer-checked:bg-accent peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]" />
        <Check
          className={cn("pointer-events-none absolute size-3.5 text-on-accent transition-opacity", checked ? "opacity-100" : "opacity-0")}
          strokeWidth={3}
        />
      </span>
      {label}
    </label>
  );
}

// "just now", "4 min ago", "3 h ago", "2 days ago", then a date.
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

// One line under a section: a plain sentence, red only when something failed.
export function Note({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  return <p className={cn("text-[13px] leading-snug", tone === "danger" ? "text-danger" : "text-muted")}>{children}</p>;
}
