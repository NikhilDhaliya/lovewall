"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createFormFromProposal, proposeFormFromSite } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { FormProposal } from "@/lib/ai/form-from-url";
import { cn } from "@/lib/cn";

// A new form from the owner's website: paste the link, review what AI proposes (headline, intro, questions, brand
// colour), then create it. Nothing is saved before "Create form".
export function FormFromSite({ spaceId, onCreated }: { spaceId: string; onCreated: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"read" | "create" | null>(null);
  const [p, setP] = useState<FormProposal | null>(null);
  const [useColor, setUseColor] = useState(true);

  async function read(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim() || busy) return;
    setBusy("read");
    const res = await proposeFormFromSite(spaceId, url);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setP({ ...res.data, hints: res.data.hints.length ? res.data.hints : [""] });
    setUseColor(Boolean(res.data.brandColor));
  }

  async function create() {
    if (!p || busy) return;
    setBusy("create");
    const res = await createFormFromProposal(spaceId, {
      title: p.title,
      prompt: p.prompt,
      hints: p.hints,
      brandColor: useColor ? p.brandColor : null,
    });
    if (!res.ok) {
      setBusy(null);
      return toast.error(res.error);
    }
    onCreated(res.data.id);
  }

  const setHint = (i: number, v: string) => setP((x) => x && { ...x, hints: x.hints.map((h, j) => (j === i ? v : h)) });

  return (
    <div className="p-5">
      <form onSubmit={read} className="flex gap-2">
        <input
          autoFocus
          aria-label="Website"
          value={url}
          placeholder="acme.com"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="off"
          maxLength={300}
          onChange={(e) => setUrl(e.target.value)}
          className={cn(inputClass, "min-w-0 flex-1")}
        />
        <Button type="submit" variant={p ? "secondary" : "primary"} disabled={!url.trim() || busy !== null} className="h-11 md:h-10">
          {busy === "read" && <Loader2 className="size-4 animate-spin" />} {busy === "read" ? "Reading" : p ? "Read again" : "Read site"}
        </Button>
      </form>

      {p && (
        <div
          className={cn("mt-6 animate-fade-in space-y-4 transition-opacity", busy === "read" && "opacity-50")}
          data-testid="form-proposal"
        >
          <Field label="Headline" htmlFor="fp-title">
            <input
              id="fp-title"
              value={p.title}
              maxLength={160}
              onChange={(e) => setP({ ...p, title: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Intro" htmlFor="fp-prompt">
            <input
              id="fp-prompt"
              value={p.prompt}
              maxLength={400}
              onChange={(e) => setP({ ...p, prompt: e.target.value })}
              className={inputClass}
            />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-muted">Questions</legend>
            <div className="space-y-2">
              {p.hints.map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    aria-label={`Question ${i + 1}`}
                    value={h}
                    maxLength={140}
                    onChange={(e) => setHint(i, e.target.value)}
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  <button
                    type="button"
                    aria-label={`Remove question ${i + 1}`}
                    onClick={() => setP({ ...p, hints: p.hints.filter((_, j) => j !== i) })}
                    className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {p.hints.length < 6 && (
                <Button variant="ghost" size="sm" className="text-muted" onClick={() => setP({ ...p, hints: [...p.hints, ""] })}>
                  Add question
                </Button>
              )}
            </div>
          </fieldset>
          {p.brandColor && (
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-3.5 ring-1 ring-line ring-inset">
              <label htmlFor="fp-color" className="flex items-center gap-2.5 text-[14.5px]">
                <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: p.brandColor }} aria-hidden />
                Brand colour <span className="font-mono text-[12.5px] text-muted">{p.brandColor}</span>
              </label>
              <Switch id="fp-color" on={useColor} onChange={setUseColor} />
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => void create()} disabled={busy !== null || !p.title.trim()}>
              {busy === "create" && <Loader2 className="size-4 animate-spin" />} Create form
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
