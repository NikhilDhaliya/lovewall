import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "plain";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-ink ring-1 ring-line ring-inset hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
  plain: "text-muted hover:text-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-[8px] px-3 text-[13px]",
  md: "h-10 gap-2 rounded-[8px] px-4 text-[14px] md:h-9",
  lg: "h-11 gap-2 rounded-[10px] px-5 text-[15px]",
  icon: "size-10 rounded-[8px] md:size-9",
  "icon-sm": "size-8 rounded-[8px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,color,scale,opacity,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  asChild,
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp type={asChild ? undefined : (props.type ?? "button")} className={buttonClass(variant, size, className)} {...props} />;
}
