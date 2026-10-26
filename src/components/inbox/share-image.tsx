"use client";

import { Download, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

type Size = "square" | "landscape" | "story";
type Style = "card" | "color" | "plain" | "dark";

const ASPECT: Record<Size, string> = { square: "1 / 1", landscape: "1200 / 675", story: "1080 / 1920" };
const SWATCHES = ["#1d1d1f", "#0a84ff", "#30b158", "#ff9f0a", "#ff375f", "#bf5af2"];

// A testimonial as an image for social posts: pick a size, a style and a colour, preview, download.
export function ShareImageSheet({
  spaceId,
  testimonialId,
  brandColor,
  hasLogo,
  open,
  onOpenChange,
}: {
  spaceId: string;
  testimonialId: string | null;
  brandColor: string;
  hasLogo: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [size, setSize] = useState<Size>("square");
  const [style, setStyle] = useState<Style>("card");
  const [color, setColor] = useState(brandColor);
  const [logo, setLogo] = useState(hasLogo);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  // The colour picker fires on every move: wait for it to settle before asking for a new image.
  const [settled, setSettled] = useState(color);
  useEffect(() => {
    const id = setTimeout(() => setSettled(color), 250);
    return () => clearTimeout(id);
  }, [color]);

  const params = new URLSearchParams({ size, style, color: settled.slice(1), logo: logo ? "1" : "0" });
  const src = testimonialId ? `/api/spaces/${spaceId}/testimonials/${testimonialId}/image?${params}` : "";
  const [shown, setShown] = useState(src);
  if (src !== shown) {
    setShown(src);
    setState("loading");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share image"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild className={cn(state !== "ready" && "pointer-events-none opacity-40")}>
            <a href={`${src}&download=1`} download aria-disabled={state !== "ready"}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_220px]">
        <div className="grid min-h-[240px] place-items-center rounded-[10px] bg-grouped p-4 ring-1 ring-line">
          <div
            className="relative w-full overflow-hidden rounded-[6px] bg-surface-2"
            style={{ aspectRatio: ASPECT[size], maxWidth: size === "story" ? 200 : size === "square" ? 340 : 420 }}
          >
            {src && (
              <img
                key={`${src}#${attempt}`}
                src={src}
                alt="Preview"
                onLoad={() => setState("ready")}
                onError={() => setState("error")}
                className={cn("size-full object-contain transition-opacity duration-200", state === "ready" ? "opacity-100" : "opacity-0")}
              />
            )}
            {state === "loading" && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-5 animate-spin text-faint" aria-label="Loading" />
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center">
                <div>
                  <p className="text-[13.5px] text-muted">Couldn’t make the image</p>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => (setAttempt((a) => a + 1), setState("loading"))}>
                    <RotateCcw className="size-3.5" /> Retry
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-muted">Size</div>
            <Segmented
              size="sm"
              label="Size"
              value={size}
              onChange={setSize}
              options={[
                { value: "square", label: "Square" },
                { value: "landscape", label: "Wide" },
                { value: "story", label: "Story" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-muted">Style</div>
            <Segmented
              size="sm"
              label="Style"
              value={style}
              onChange={setStyle}
              options={[
                { value: "card", label: "Card" },
                { value: "color", label: "Colour" },
                { value: "plain", label: "Plain" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-muted">Colour</div>
            <div className="flex flex-wrap items-center gap-2">
              {[...new Set([brandColor.toLowerCase(), ...SWATCHES])].slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color.toLowerCase() === c}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-surface transition-transform active:scale-90",
                    color.toLowerCase() === c && "ring-2 ring-ink",
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom colour"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              />
            </div>
          </div>
          {hasLogo && (
            <div className="flex items-center justify-between">
              <label htmlFor="share-logo" className="text-[14px]">
                Logo
              </label>
              <Switch id="share-logo" on={logo} onChange={setLogo} />
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
