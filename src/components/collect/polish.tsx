"use client";

import { Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import type { CollectDict } from "@/lib/i18n/collect/en";

// Spelling help under the testimonial box (AI, when the space has it on): a suggestion the visitor can take or
// leave. Their text never changes without their click.
export function Polish({
  spaceId,
  token,
  text,
  onUse,
  dict,
  disabled,
}: {
  spaceId: string;
  token: string;
  text: string;
  onUse: (text: string) => void;
  dict: CollectDict;
  disabled?: boolean;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "none"; for: string } | { kind: "error" } | { kind: "suggest"; for: string; text: string }
  >({ kind: "idle" });
  const ready = text.trim().length >= 12;
  const box = useRef<HTMLDivElement>(null);
  // After a choice, back to the text box (the suggestion and its buttons are gone).
  const done = () => {
    setState({ kind: "idle" });
    requestAnimationFrame(() => box.current?.parentElement?.querySelector("textarea")?.focus());
  };
  // A suggestion is for the text it was made from; typing on makes it stale.
  const current = (state.kind === "suggest" || state.kind === "none") && state.for !== text ? { kind: "idle" as const } : state;

  async function check() {
    if (!ready || current.kind === "busy") return;
    const asked = text;
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/collect/${spaceId}/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: asked, token }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string | null };
      if (!res.ok) return setState({ kind: "error" });
      setState(data.text ? { kind: "suggest", for: asked, text: data.text } : { kind: "none", for: asked });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (current.kind === "suggest") {
    return (
      <div
        ref={box}
        className="animate-fade-in rounded-[10px] bg-surface p-3.5 ring-1 ring-line ring-inset"
        aria-live="polite"
        data-testid="polish"
      >
        <p className="text-[12.5px] font-medium text-muted">{dict.polishTitle}</p>
        <p dir="auto" className="mt-1 text-[15px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line">
          {current.text}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (onUse(current.text), done())}
            className="h-9 rounded-[8px] bg-accent px-3.5 text-[14px] font-medium text-on-accent transition-[background-color,scale] hover:bg-accent-hover active:scale-[0.98]"
          >
            {dict.polishUse}
          </button>
          <button
            type="button"
            onClick={done}
            className="h-9 rounded-[8px] px-3.5 text-[14px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {dict.polishKeep}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={box} className="-mt-1 flex min-h-8 items-center justify-end gap-3" aria-live="polite">
      {current.kind === "error" && <span className="text-[13px] text-danger">{dict.polishFail}</span>}
      {current.kind === "none" ? (
        <span className="flex items-center gap-1 text-[13px] text-muted">
          <Check className="size-3.5" strokeWidth={2.5} /> {dict.polishNone}
        </span>
      ) : ready ? (
        <button
          type="button"
          onClick={() => void check()}
          disabled={disabled || current.kind === "busy"}
          className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none"
        >
          {current.kind === "busy" && <Loader2 className="size-3.5 animate-spin" />} {dict.polish}
        </button>
      ) : null}
    </div>
  );
}
