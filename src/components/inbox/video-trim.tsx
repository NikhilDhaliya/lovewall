"use client";

import { Image as ImageIcon, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { frameOf } from "@/lib/media";

export type Trim = { start: number; end: number | null };

export function clock(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

// The thumbs are the only part of each range input that takes the pointer, so the two can sit on one track.
const thumb =
  "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-[4px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[4px] [&::-webkit-slider-thumb]:bg-ink focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ink/30 focus-visible:[&::-webkit-slider-thumb]:ring-offset-2";

// Start and end of a video testimonial: a scrubber with two handles that shows the frame under the handle,
// plays just the range, and can make the current frame the poster.
export function VideoTrim({
  src,
  poster,
  name,
  value,
  onChange,
  onPoster,
}: {
  src: string;
  poster: string | null;
  name: string;
  value: Trim;
  onChange: (trim: Trim) => void;
  onPoster: (frame: Blob, preview: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(value.start);
  const [playing, setPlaying] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const end = value.end ?? duration;

  // Recorded WebM files often report an infinite duration until the browser seeks to the end once.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const read = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setDuration(v.duration);
        return true;
      }
      return false;
    };
    const onMeta = () => {
      if (read()) {
        v.currentTime = value.start;
        return;
      }
      const fix = () => {
        if (!read()) return;
        v.removeEventListener("durationchange", fix);
        v.currentTime = value.start;
      };
      v.addEventListener("durationchange", fix);
      v.currentTime = 1e7;
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function seek(t: number) {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setTime(t);
  }

  function setStart(t: number) {
    const start = Math.min(Math.max(0, t), end - 0.5);
    onChange({ start, end: value.end });
    seek(start);
  }

  function setEnd(t: number) {
    const e = Math.max(Math.min(duration, t), value.start + 0.5);
    onChange({ start: value.start, end: e >= duration - 0.05 ? null : e });
    seek(e);
  }

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (!v.paused) return v.pause();
    if (v.currentTime < value.start || v.currentTime >= end - 0.1) v.currentTime = value.start;
    void v.play();
  }

  // The poster comes from a second copy of the video, fetched with CORS (and past the cache, which holds the
  // player's non-CORS copy) into a blob, so the frame can be read into an image.
  async function grabPoster() {
    setGrabbing(true);
    const copy = document.createElement("video");
    let blobUrl = "";
    copy.muted = true;
    copy.playsInline = true;
    copy.preload = "auto";
    copy.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(copy);
    const wait = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
        copy.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
        copy.addEventListener("error", () => (clearTimeout(timer), reject(new Error("load"))), { once: true });
      });
    try {
      const res = await fetch(src, { mode: "cors", cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error("fetch");
      blobUrl = URL.createObjectURL(await res.blob());
      const loaded = wait("loadeddata");
      copy.src = blobUrl;
      await loaded;
      const seeked = wait("seeked");
      copy.currentTime = Math.max(0.05, time);
      await seeked;
      const frame = await frameOf(copy);
      if (!frame) throw new Error("frame");
      onPoster(frame, URL.createObjectURL(frame));
      toast.success("Poster set");
    } catch {
      toast.error("Couldn’t read this frame");
    } finally {
      copy.remove();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setGrabbing(false);
    }
  }

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[8px] bg-black">
        <video
          ref={video}
          src={src}
          poster={poster ?? undefined}
          preload="metadata"
          playsInline
          aria-label={`Video from ${name}`}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setTime(v.currentTime);
            if (!v.paused && v.currentTime >= end) {
              v.pause();
              v.currentTime = value.start;
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="mx-auto block max-h-[260px] w-full object-contain"
        />
      </div>
      <div className="relative h-7" aria-busy={!duration}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/40"
          style={{ left: `${pct(value.start)}%`, width: `${pct(end) - pct(value.start)}%` }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-ink" style={{ left: `${pct(time)}%` }} aria-hidden />
        <input
          type="range"
          aria-label="Start"
          aria-valuetext={clock(value.start)}
          min={0}
          max={duration || 1}
          step={0.1}
          value={value.start}
          disabled={!duration}
          onChange={(e) => setStart(Number(e.target.value))}
          className={thumb}
        />
        <input
          type="range"
          aria-label="End"
          aria-valuetext={clock(end)}
          min={0}
          max={duration || 1}
          step={0.1}
          value={end}
          disabled={!duration}
          onChange={(e) => setEnd(Number(e.target.value))}
          className={thumb}
        />
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-muted tabular-nums">
        <span>{clock(value.start)}</span>
        <span className="text-ink">{duration ? clock(end - value.start) : "…"}</span>
        <span>{clock(end)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={toggle} disabled={!duration}>
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void grabPoster()} disabled={!duration || grabbing}>
          {grabbing ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          Use as poster
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn("ml-auto", value.start === 0 && value.end === null && "invisible")}
          onClick={() => {
            onChange({ start: 0, end: null });
            seek(0);
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
