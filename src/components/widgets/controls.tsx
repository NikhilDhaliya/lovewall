import { cn } from "@/lib/cn";

// Building blocks of the configurator's settings column.

export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("py-5 first:pt-1", className)}>
      <h2 className="mb-3 text-[13px] font-medium text-muted">{title}</h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[14px] text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

// A range slider with its value beside it.
export function Slider({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[110px] accent-[var(--ink)]"
      />
      <span className="w-7 text-right text-[13px] text-muted tabular-nums">{value}</span>
    </div>
  );
}

// A compact text input for the settings column.
export const smallInput =
  "h-9 w-full min-w-0 rounded-[8px] bg-surface px-2.5 text-[14px] text-ink ring-1 ring-line outline-none ring-inset transition-[box-shadow] placeholder:text-faint focus:ring-[1.5px] focus:ring-ink/35 md:text-[13.5px]";
