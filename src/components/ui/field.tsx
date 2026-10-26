import { cn } from "@/lib/cn";

export const inputClass =
  "h-11 w-full rounded-[8px] bg-surface px-3 text-[15px] text-ink ring-1 ring-line outline-none ring-inset transition-[box-shadow] placeholder:text-faint focus:ring-[1.5px] focus:ring-ink/35 disabled:opacity-60 md:h-10 md:text-[14px]";

export const textareaClass =
  "w-full resize-none rounded-[8px] bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-ink ring-1 ring-line outline-none ring-inset transition-[box-shadow] placeholder:text-faint focus:ring-[1.5px] focus:ring-ink/35 md:text-[14px]";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(textareaClass, className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-[5px] bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted ring-1 ring-line",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
