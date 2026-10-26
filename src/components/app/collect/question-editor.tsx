"use client";

import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { inputClass } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { QUESTION_LABEL, QUESTION_TYPES, type Question, type QuestionType } from "@/lib/forms";

export function newQuestion(): Question {
  return { id: `q${Math.random().toString(36).slice(2, 9)}`, type: "short", label: "", required: false, options: [] };
}

const iconButton = "grid size-9 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink";

// Custom questions: a label, a type, required or not, and choices for choice questions.
export function QuestionList({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const update = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const list = [...questions];
    const [q] = list.splice(i, 1);
    list.splice(i + d, 0, q);
    onChange(list);
  };
  return (
    <>
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2.5 p-4" data-testid="question">
          <div className="flex items-center gap-2">
            <input
              aria-label={`Question ${i + 1}`}
              placeholder="Question"
              value={q.label}
              maxLength={200}
              onChange={(e) => update(i, { label: e.target.value })}
              className={inputClass}
            />
            <Menu>
              <MenuTrigger
                className={cn(iconButton, "outline-none focus-visible:ring-soft data-[state=open]:bg-surface-2")}
                aria-label={`More for question ${i + 1}`}
              >
                <MoreHorizontal className="size-[18px]" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem disabled={i === 0} onSelect={() => move(i, -1)}>
                  <ArrowUp /> Move up
                </MenuItem>
                <MenuItem disabled={i === questions.length - 1} onSelect={() => move(i, 1)}>
                  <ArrowDown /> Move down
                </MenuItem>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => onChange(questions.filter((_, j) => j !== i))}>
                  <Trash2 /> Remove
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Select<QuestionType>
              aria-label={`Type of question ${i + 1}`}
              value={q.type}
              onChange={(type) =>
                update(i, { type, options: (type === "single" || type === "multiple") && !q.options.length ? ["", ""] : q.options })
              }
              options={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_LABEL[t] }))}
              className="w-[168px]"
            />
            <label className="flex items-center gap-2.5 text-[14px] text-muted">
              Required
              <Switch on={q.required} onChange={(required) => update(i, { required })} aria-label={`Question ${i + 1} required`} />
            </label>
          </div>
          {(q.type === "single" || q.type === "multiple") && (
            <div className="space-y-2 ps-3">
              {q.options.map((o, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    aria-label={`Choice ${k + 1} of question ${i + 1}`}
                    placeholder={`Choice ${k + 1}`}
                    value={o}
                    maxLength={80}
                    onChange={(e) => update(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })}
                    className={cn(inputClass, "h-10 md:h-9")}
                  />
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={`Remove choice ${k + 1}`}
                    onClick={() => update(i, { options: q.options.filter((_, m) => m !== k) })}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {q.options.length < 12 && (
                <button
                  type="button"
                  onClick={() => update(i, { options: [...q.options, ""] })}
                  className="flex h-9 items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"
                >
                  <Plus className="size-4" /> Add choice
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {questions.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...questions, newQuestion()])}
          className="flex h-12 w-full items-center gap-1.5 px-4 text-[14px] font-medium text-muted transition-colors hover:bg-surface-2/60 hover:text-ink"
        >
          <Plus className="size-4" /> Add question
        </button>
      )}
    </>
  );
}
