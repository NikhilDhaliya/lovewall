"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

// Pick tags for one or many testimonials. `initial` are tags all of them already have.
export function TagsSheet({
  open,
  onOpenChange,
  allTags,
  initial,
  count,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  allTags: string[];
  initial: string[];
  count: number;
  onApply: (add: string[], remove: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [extra, setExtra] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setChosen(initial);
      setExtra([]);
      setText("");
    }
  }
  const list = [...new Set([...allTags, ...extra])].sort();

  function addNew(e?: React.FormEvent) {
    e?.preventDefault();
    const tag = text.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
    if (!tag || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(tag)) return;
    setExtra((x) => [...x, tag]);
    setChosen((c) => [...new Set([...c, tag])]);
    setText("");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={count > 1 ? `Tags · ${count} selected` : "Tags"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(
                chosen.filter((t) => !initial.includes(t)),
                initial.filter((t) => !chosen.includes(t)),
              );
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <form onSubmit={addNew} className="flex gap-2">
          <input
            autoFocus
            aria-label="New tag"
            placeholder="New tag"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={32}
            className={inputClass}
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="Add tag" disabled={!text.trim()}>
            <Plus className="size-4" />
          </Button>
        </form>
        {list.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {list.map((tag) => {
              const on = chosen.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen((c) => (on ? c.filter((t) => t !== tag) : [...c, tag]))}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-[7px] px-3 text-[14px] font-medium transition-[background-color,color,scale] active:scale-95 md:h-8 md:text-[13px]",
                    on ? "bg-accent text-on-accent" : "bg-surface-2 text-ink hover:bg-surface-3",
                  )}
                >
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
