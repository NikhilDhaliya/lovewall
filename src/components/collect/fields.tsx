"use client";

import { Check } from "lucide-react";
import { inputClass, textareaClass } from "@/components/ui/field";
import { StarInput } from "@/components/ui/stars";
import { cn } from "@/lib/cn";
import type { Answer, Question } from "@/lib/forms";
import type { CollectDict } from "@/lib/i18n/collect/en";
import { t } from "@/lib/i18n/collect/languages";

// Arrow keys move between the options of a radio group (and pick them), as native radios do.
function arrows(e: React.KeyboardEvent<HTMLElement>, count: number, index: number, pick: (i: number) => void) {
  const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
  const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
  if (!forward && !backward) return;
  e.preventDefault();
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl" && (e.key === "ArrowRight" || e.key === "ArrowLeft");
  const step = (forward ? 1 : -1) * (rtl ? -1 : 1);
  const next = ((index < 0 ? (step > 0 ? -1 : 0) : index) + step + count) % count;
  pick(next);
  (e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[next] ?? null)?.focus();
}

const optionClass =
  "flex min-h-12 w-full items-center gap-3 rounded-[10px] bg-surface px-4 py-2.5 text-start text-[15px] ring-1 ring-line transition-[box-shadow,background-color,scale] ring-inset outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-[0.99]";

export function ChoiceList({
  options,
  value,
  onChange,
  labelledBy,
  label,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  labelledBy?: string;
  label?: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className="grid gap-2"
      onKeyDown={(e) => arrows(e, options.length, index, (i) => onChange(options[i].value))}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (index === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(optionClass, on && "ring-[1.5px] ring-ink/70")}
          >
            <span
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-full ring-1 ring-line ring-inset",
                on && "ring-[5px] ring-accent",
              )}
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CheckList({
  options,
  value,
  onChange,
  labelledBy,
  label,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} className="grid gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : options.filter((x) => x === o || value.includes(x)))}
            className={cn(optionClass, on && "ring-[1.5px] ring-ink/70")}
          >
            <span
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-[5px] ring-1 ring-line ring-inset",
                on && "bg-accent ring-accent",
              )}
            >
              <Check className={cn("size-3 text-on-accent", !on && "opacity-0")} strokeWidth={3} />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

// One custom question's input. The visible label is the step heading (steps) or a label above it (one page).
export function QuestionInput({
  q,
  value,
  onChange,
  dict,
  labelledBy,
  invalid,
}: {
  q: Question;
  value: Answer | undefined;
  onChange: (v: Answer | undefined) => void;
  dict: CollectDict;
  labelledBy: string;
  invalid?: boolean;
}) {
  const common = { "aria-labelledby": labelledBy, "aria-invalid": invalid || undefined, "aria-required": q.required || undefined };
  switch (q.type) {
    case "short":
    case "email":
    case "url":
      return (
        <input
          {...common}
          type={q.type === "short" ? "text" : q.type}
          inputMode={q.type === "url" ? "url" : q.type === "email" ? "email" : undefined}
          autoComplete={q.type === "email" ? "email" : q.type === "url" ? "url" : "off"}
          dir="auto"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={q.type === "url" ? 500 : 300}
          className={cn(inputClass, "h-12 md:h-12")}
        />
      );
    case "long":
      return (
        <textarea
          {...common}
          dir="auto"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={3000}
          rows={4}
          className={cn(textareaClass, "min-h-[120px]")}
        />
      );
    case "rating":
      return (
        <div className="flex">
          <StarInput
            value={typeof value === "number" ? value : null}
            onChange={(v) => onChange(v ?? undefined)}
            size={30}
            label={q.label || dict.rating}
            starLabel={(i) => (i === 1 ? dict.oneStar : t(dict, "stars", { n: i }))}
          />
        </div>
      );
    case "yesno":
      return (
        <ChoiceList
          labelledBy={labelledBy}
          options={[
            { value: "yes", label: dict.yes },
            { value: "no", label: dict.no },
          ]}
          value={value === true ? "yes" : value === false ? "no" : null}
          onChange={(v) => onChange(v === "yes")}
        />
      );
    case "single":
      return (
        <ChoiceList
          labelledBy={labelledBy}
          options={q.options.map((o) => ({ value: o, label: o }))}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      );
    case "multiple":
      return <CheckList labelledBy={labelledBy} options={q.options} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
}

// NPS: 0-10, one row. Arrow keys move and pick.
export function NpsScale({
  value,
  onChange,
  labelledBy,
  dict,
}: {
  value: number | null;
  onChange: (v: number) => void;
  labelledBy: string;
  dict: CollectDict;
}) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="grid grid-cols-11 gap-1 sm:gap-1.5"
        onKeyDown={(e) => arrows(e, 11, value ?? -1, onChange)}
      >
        {Array.from({ length: 11 }, (_, i) => {
          const on = value === i;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={String(i)}
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(i)}
              className={cn(
                "grid h-12 place-items-center rounded-[8px] text-[15px] font-medium tabular-nums ring-1 ring-line transition-[background-color,color,scale] outline-none ring-inset focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-95 sm:h-12",
                on ? "bg-accent text-on-accent ring-accent" : "bg-surface hover:bg-surface-2",
              )}
            >
              {i}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[13px] text-muted" aria-hidden>
        <span>{dict.npsLow}</span>
        <span>{dict.npsHigh}</span>
      </div>
    </div>
  );
}

export function ConsentBox({
  checked,
  onChange,
  label,
  text,
  privacy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  text: string;
  // The privacy policy, next to the consent (hosted service).
  privacy?: { url: string; label: string } | null;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[12px] py-1 text-[14px] leading-snug text-muted select-none">
      <span className="relative mt-px grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
        <span className="size-5 rounded-[6px] bg-surface ring-1 ring-line transition-colors peer-checked:bg-accent peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]" />
        <Check
          className={cn("pointer-events-none absolute size-3.5 text-on-accent transition-opacity", checked ? "opacity-100" : "opacity-0")}
          strokeWidth={3}
        />
      </span>
      <span>
        {text}
        {privacy && (
          <>
            {" "}
            <a href={privacy.url} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
              {privacy.label}
            </a>
          </>
        )}
      </span>
    </label>
  );
}
