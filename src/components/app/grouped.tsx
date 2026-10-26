import { cn } from "@/lib/cn";

// Grouped lists for settings screens: a quiet label, then rows in one hairline box.
export function Group({
  title,
  hint,
  children,
  className,
  id,
}: {
  title?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("mt-8 first:mt-0", className)}>
      {title && <h2 className="pb-2 text-[13px] font-medium text-muted">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">{children}</div>
      {hint && <p className="pt-2 text-[13px] text-muted">{hint}</p>}
    </section>
  );
}

export function GroupRow({
  label,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[52px] items-center justify-between gap-4 px-4 py-2", className)}>
      <label htmlFor={htmlFor} className="shrink-0 text-[14.5px]">
        {label}
      </label>
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export const rowInputClass =
  "h-10 w-full min-w-0 rounded-[8px] bg-transparent px-2 text-right text-[15px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-faint hover:bg-surface-2 focus:bg-surface-2 md:text-[14px]";
