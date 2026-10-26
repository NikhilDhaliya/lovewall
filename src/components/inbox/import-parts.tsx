"use client";

import { Check, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

// Small pieces the import views share.

// The sheet's action bar, inside the scrolling body so each step owns its buttons.
export function StepFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-2 bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] hairline-t md:pb-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("relative grid size-[18px] shrink-0 place-items-center", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-[5px] bg-surface ring-1 ring-line transition-colors ring-inset checked:bg-accent checked:ring-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-40"
      />
      <Check className="pointer-events-none relative size-3 text-on-accent opacity-0 peer-checked:opacity-100" strokeWidth={3.5} />
    </span>
  );
}

export function StatusChoice({ value, onChange }: { value: "approved" | "new"; onChange: (v: "approved" | "new") => void }) {
  return (
    <Segmented
      label="Import as"
      size="sm"
      fit
      value={value}
      onChange={onChange}
      options={[
        { value: "approved", label: "Approved" },
        { value: "new", label: "New" },
      ]}
    />
  );
}

// A row in an options box: label on the left, control on the right.
export function OptionRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-1.5">
      <label htmlFor={htmlFor} className="text-[14px]">
        {label}
      </label>
      {children}
    </div>
  );
}

// A file picker that also takes a drop.
export function DropZone({
  label,
  detail,
  accept,
  multiple,
  onFiles,
  error,
  autoFocus,
}: {
  label: string;
  detail?: React.ReactNode;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <>
      <button
        type="button"
        autoFocus={autoFocus}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles([...(e.dataTransfer.files ?? [])]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-line px-4 py-8 text-center transition-colors hover:bg-surface-2",
          drag && "border-ink bg-surface-2",
        )}
      >
        <FileUp className="size-5 text-muted" />
        <span className="text-[14.5px] font-medium">{label}</span>
        {detail && <span className={cn("text-[13px]", error ? "text-danger" : "text-muted")}>{detail}</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-label={label}
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  if (abs < 3600) return RELATIVE.format(Math.round(s / 60), "minute");
  if (abs < 86400) return RELATIVE.format(Math.round(s / 3600), "hour");
  return RELATIVE.format(Math.round(s / 86400), "day");
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}
