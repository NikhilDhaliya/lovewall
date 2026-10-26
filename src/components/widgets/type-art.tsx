import { cn } from "@/lib/cn";
import type { WidgetType } from "@/lib/widget/config";

// A tiny testimonial card: a rating line and two lines of text.
function Mini({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("flex flex-col gap-[3px] overflow-hidden rounded-[4px] bg-surface p-1.5 ring-1 ring-line", className)} style={style}>
      <span className="h-[3px] w-[38%] shrink-0 rounded-full bg-ink/60" />
      <span className="h-[3px] w-full shrink-0 rounded-full bg-surface-3" />
      <span className="h-[3px] w-[78%] shrink-0 rounded-full bg-surface-3" />
    </div>
  );
}

// Small monochrome diagrams of each widget layout (no fake screenshots).
export function TypeArt({ type, className }: { type: WidgetType; className?: string }) {
  return (
    <div className={cn("relative h-[84px] w-full overflow-hidden rounded-[10px] bg-canvas p-3", className)} aria-hidden>
      {type === "wall" && (
        <div className="grid h-full grid-cols-3 gap-1.5">
          {[
            [60, 36],
            [34, 62],
            [48, 46],
          ].map((col, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {col.map((h, j) => (
                <Mini key={j} style={{ height: `${h}%` }} />
              ))}
            </div>
          ))}
        </div>
      )}
      {type === "carousel" && (
        <div className="flex h-full flex-col items-center justify-between">
          <div className="flex h-[70%] w-full gap-1.5">
            <Mini className="w-[44%]" />
            <Mini className="w-[44%]" />
            <Mini className="w-[20%] opacity-60" />
          </div>
          <div className="flex gap-1">
            <span className="size-2.5 rounded-[3px] bg-surface ring-1 ring-line" />
            <span className="size-2.5 rounded-[3px] bg-surface ring-1 ring-line" />
          </div>
        </div>
      )}
      {type === "marquee" && (
        <div className="flex h-full flex-col justify-center gap-1.5 [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
          <div className="flex h-[42%] gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Mini key={i} className="w-[34%] shrink-0" />
            ))}
          </div>
          <div className="-ml-6 flex h-[42%] gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Mini key={i} className="w-[34%] shrink-0" />
            ))}
          </div>
        </div>
      )}
      {type === "single" && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <span className="h-[3px] w-[22%] rounded-full bg-ink/60" />
          <span className="mt-1 h-1 w-[66%] rounded-full bg-surface-3" />
          <span className="h-1 w-[50%] rounded-full bg-surface-3" />
          <span className="mt-1.5 size-3.5 rounded-full bg-surface-3" />
        </div>
      )}
      {type === "grid" && (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Mini key={i} />
          ))}
        </div>
      )}
      {type === "list" && (
        <div className="mx-auto flex h-full w-[82%] flex-col divide-y divide-line overflow-hidden rounded-[4px] bg-surface ring-1 ring-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 items-center gap-1.5 px-1.5">
              <span className="size-2 shrink-0 rounded-full bg-surface-3" />
              <span className="h-[3px] w-[18%] shrink-0 rounded-full bg-ink/60" />
              <span className="h-[3px] flex-1 rounded-full bg-surface-3" />
            </div>
          ))}
        </div>
      )}
      {type === "gallery" && (
        <div className="grid h-full grid-cols-3 gap-1.5">
          {[
            [62, 34],
            [40, 56],
            [70, 26],
          ].map((col, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {col.map((h, j) => (
                <span key={j} className="block rounded-[4px] bg-surface-3 ring-1 ring-line" style={{ height: `${h}%` }} />
              ))}
            </div>
          ))}
        </div>
      )}
      {type === "hero" && (
        <div className="flex h-full flex-col justify-center gap-[5px] px-1">
          <span className="h-[3px] w-[16%] rounded-full bg-ink/60" />
          <span className="mt-0.5 h-[5px] w-[88%] rounded-full bg-ink/25" />
          <span className="h-[5px] w-[64%] rounded-full bg-ink/25" />
          <span className="mt-1 flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="h-[3px] w-[20%] rounded-full bg-ink/60" />
          </span>
        </div>
      )}
      {type === "video" && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <div className="grid aspect-video h-[72%] place-items-center rounded-[4px] bg-surface-3 ring-1 ring-line">
            <span className="grid size-3.5 place-items-center rounded-full bg-ink/60">
              <span className="ml-px size-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-surface" />
            </span>
          </div>
          <span className="h-[3px] w-[28%] rounded-full bg-ink/60" />
        </div>
      )}
      {type === "popup" && (
        <div className="relative h-full rounded-[4px] bg-surface/60 ring-1 ring-line">
          <span className="absolute top-1.5 left-1.5 h-[3px] w-[40%] rounded-full bg-surface-3" />
          <span className="absolute top-3 left-1.5 h-[3px] w-[26%] rounded-full bg-surface-3" />
          <Mini className="absolute bottom-1.5 left-1.5 h-[46%] w-[46%]" />
        </div>
      )}
      {type === "avatars" && (
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-1.5">
            <div className="flex">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("size-4 rounded-full bg-surface-3 ring-2 ring-grouped", i && "-ml-1.5")} />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="h-[3px] w-6 rounded-full bg-ink/60" />
              <span className="h-[3px] w-10 rounded-full bg-surface-3" />
            </div>
          </div>
        </div>
      )}
      {type === "logos" && (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <span className="h-[3px] w-[30%] rounded-full bg-surface-3" />
          <div className="flex w-[86%] items-center justify-center gap-[8%]">
            {[24, 18, 28, 20].map((w, i) => (
              <span key={i} className="h-[5px] rounded-full bg-ink/40" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      )}
      {type === "badge" && (
        <div className="grid h-full place-items-center">
          <div className="flex h-7 items-center gap-1.5 rounded-[7px] bg-surface px-2.5 ring-1 ring-line">
            <span className="h-[3px] w-6 rounded-full bg-ink/60" />
            <span className="h-[3px] w-9 rounded-full bg-surface-3" />
          </div>
        </div>
      )}
    </div>
  );
}
