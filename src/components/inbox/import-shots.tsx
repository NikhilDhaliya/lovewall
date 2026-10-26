"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { importScreenshots } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { resizeImage } from "@/lib/media";
import { PICKABLE, sourceOf } from "@/lib/sources";
import { DropZone, OptionRow, plural, StatusChoice, StepFooter } from "./import-parts";
import { uploadOwnerFile } from "./upload";

type Shot = { id: string; file: File; preview: string; name: string };

const MAX = 30;
// "None" stores Manual, which widgets don't label.
const OPTIONS = [{ value: "Manual", label: "None" }, ...PICKABLE.map((s) => ({ value: s.label, label: s.label }))];

// Screenshots of reviews from anywhere (a site, a chat, an email): each one becomes a testimonial with the image.
export function ShotsStep({ spaceId, initialSource, onDone }: { spaceId: string; initialSource?: string; onDone: () => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [source, setSource] = useState(sourceOf(initialSource)?.label ?? "Manual");
  const [status, setStatus] = useState<"approved" | "new">("approved");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function add(files: File[]) {
    const images = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
    if (images.length < files.length) toast.error("PNG, JPG or WebP only");
    const room = MAX - shots.length;
    if (images.length > room) toast.message(`Up to ${MAX} at a time`);
    const next = images.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file);
      urls.current.push(preview);
      return { id: `${file.name}-${file.size}-${Math.random()}`, file, preview, name: "" };
    });
    setShots((s) => [...s, ...next]);
  }

  async function submit() {
    if (!shots.length || progress) return;
    setProgress({ done: 0, total: shots.length });
    const items: { key: string; name: string | null }[] = [];
    let failed = 0;
    for (const shot of shots) {
      try {
        const blob = await resizeImage(shot.file, 1600, false);
        items.push({ key: await uploadOwnerFile(spaceId, "image", blob, "image/jpeg"), name: shot.name.trim() || null });
      } catch {
        failed++;
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    if (!items.length) {
      setProgress(null);
      return toast.error("Couldn't upload those. Try again.");
    }
    const res = await importScreenshots(spaceId, { source, status, items });
    setProgress(null);
    if (!res.ok) return toast.error(res.error);
    const skipped = res.data.skipped + failed;
    toast.success(`Imported ${res.data.added}${skipped ? ` · skipped ${skipped}` : ""}`);
    onDone();
  }

  return (
    <div className="flex min-h-full animate-view flex-col">
      <div className="space-y-4 px-5 pt-4 pb-5">
        <DropZone
          label={shots.length ? "Add more" : "Choose screenshots"}
          detail={shots.length ? plural(shots.length, "image") : "PNG, JPG or WebP"}
          accept="image/png,image/jpeg,image/webp"
          multiple
          autoFocus
          onFiles={add}
        />
        {shots.length > 0 && (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-label="Screenshots">
              {shots.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <img src={s.preview} alt="" className="size-12 shrink-0 rounded-[6px] bg-surface-2 object-cover ring-1 ring-line" />
                  <input
                    aria-label={`Name for screenshot ${i + 1}`}
                    placeholder="Name (optional)"
                    value={s.name}
                    maxLength={80}
                    onChange={(e) => setShots((list) => list.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                    className={cn(inputClass, "h-10 min-w-0 flex-1 md:h-9")}
                  />
                  <button
                    type="button"
                    onClick={() => setShots((list) => list.filter((x) => x.id !== s.id))}
                    className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    aria-label={`Remove screenshot ${i + 1}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line">
              <OptionRow label="Source">
                <Select aria-label="Source" value={source} onChange={setSource} options={OPTIONS} className="min-w-40" />
              </OptionRow>
              <OptionRow label="Import as">
                <StatusChoice value={status} onChange={setStatus} />
              </OptionRow>
            </div>
          </>
        )}
      </div>
      {shots.length > 0 && (
        <StepFooter>
          <span className="text-[13px] text-muted tabular-nums" aria-live="polite">
            {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : ""}
          </span>
          <Button onClick={() => void submit()} disabled={Boolean(progress)}>
            {progress && <Loader2 className="size-4 animate-spin" />} Import {shots.length}
          </Button>
        </StepFooter>
      )}
    </div>
  );
}
