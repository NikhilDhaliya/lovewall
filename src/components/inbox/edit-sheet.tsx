"use client";

import { Building2, Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listTranslations, readImageText } from "@/app/actions/ai";
import { TranslationList } from "@/components/ai/translation-list";
import { addTestimonial, updateTestimonial, type TestimonialInput } from "@/app/actions/testimonials";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { StarInput } from "@/components/ui/stars";
import { cn } from "@/lib/cn";
import type { Translation } from "@/lib/ai/translate";
import type { OwnerTestimonial } from "@/lib/data/testimonials";
import { resizeImage, resizeLogo } from "@/lib/media";
import { AnswerList, type ItemDetails } from "./item";
import { PICKABLE, sourceOf } from "@/lib/sources";
import { uploadOwnerFile } from "./upload";
import { VideoTrim, type Trim } from "./video-trim";
import { ConsentRecord } from "./consent-record";

export const SOURCES = [...PICKABLE.map((s) => s.label), "Other"];

// Opening the sheet from the import flow: a source with no public data (LinkedIn...), or a site that blocked us.
export type EditPreset = { source: string; url?: string };

type Draft = {
  name: string;
  title: string;
  company: string;
  text: string;
  rating: number | null;
  source: string;
  sourceOther: string;
  source_url: string;
  date: string;
  status: "new" | "approved" | "hidden";
  avatar: string | null;
  avatarKey: string | null | undefined;
  photo: Blob | null;
  // Company logo and image testimonial (screenshot): shown URL, key change (undefined = unchanged, null = removed), new file.
  logo: string | null;
  logoKey: string | null | undefined;
  logoFile: Blob | null;
  image: string | null;
  imageKey: string | null | undefined;
  shot: Blob | null;
  trim: Trim;
  poster: string | null;
  posterFile: Blob | null;
};

function draftOf(t: OwnerTestimonial | null, preset?: EditPreset | null): Draft {
  const label = sourceOf(t?.source ?? preset?.source)?.label;
  const known = label && SOURCES.includes(label) ? label : undefined;
  return {
    name: t?.name ?? "",
    title: t?.title ?? "",
    company: t?.company ?? "",
    text: t?.text ?? "",
    rating: t?.rating ?? null,
    source: t ? (known ?? (t.source === "Form" ? "Form" : "Other")) : (known ?? "LinkedIn"),
    sourceOther: t && !known && t.source !== "Form" ? t.source : "",
    source_url: t?.source_url ?? preset?.url ?? "",
    date: t ? t.given_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: t?.status ?? "approved",
    avatar: t?.avatar ?? null,
    avatarKey: undefined,
    photo: null,
    logo: t?.company_logo ?? null,
    logoKey: undefined,
    logoFile: null,
    image: t?.image ?? null,
    imageKey: undefined,
    shot: null,
    trim: { start: t?.video_start ?? 0, end: t?.video_end ?? null },
    poster: t?.poster ?? null,
    posterFile: null,
  };
}

// Add a testimonial by hand (any source), or edit one. One sheet for both.
export function EditSheet({
  spaceId,
  editing,
  preset,
  open,
  onOpenChange,
  onSaved,
  details,
  readText = false,
  translations = false,
}: {
  spaceId: string;
  editing: OwnerTestimonial | null;
  preset?: EditPreset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (t: OwnerTestimonial, created: boolean) => void;
  details?: ItemDetails;
  // AI: offer to fill name, text and stars from a saved screenshot.
  readText?: boolean;
  // AI: list the testimonial's translations, to approve or discard.
  translations?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(editing, preset));
  const [reading, setReading] = useState(false);
  const [seen, setSeen] = useState<{ open: boolean; id: string | null }>({ open, id: editing?.id ?? null });
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [translated, setTranslated] = useState<{ id: string; list: Translation[] } | null>(null);
  const editingId = open && translations ? (editing?.id ?? null) : null;

  useEffect(() => {
    if (!editingId) return;
    let live = true;
    void listTranslations(spaceId, editingId).then((res) => {
      if (live && res.ok) setTranslated({ id: editingId, list: res.data });
    });
    return () => {
      live = false;
    };
  }, [spaceId, editingId]);
  const translationList = editingId && translated?.id === editingId ? translated.list : [];

  // Reset the form each time the sheet opens (or switches to another testimonial).
  if (seen.open !== open || seen.id !== (editing?.id ?? null)) {
    setSeen({ open, id: editing?.id ?? null });
    if (open) setDraft(draftOf(editing, preset));
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function pickPhoto(file?: File) {
    if (!file) return;
    try {
      const blob = await resizeImage(file, 480);
      setDraft((d) => ({ ...d, photo: blob, avatar: URL.createObjectURL(blob) }));
    } catch {
      toast.error("Use a JPG or PNG photo");
    }
  }

  async function pickLogo(file?: File) {
    if (!file) return;
    try {
      const blob = await resizeLogo(file, 256);
      setDraft((d) => ({ ...d, logoFile: blob, logo: URL.createObjectURL(blob) }));
    } catch {
      toast.error("Use a PNG, JPG or WebP logo");
    }
  }

  async function pickShot(file?: File) {
    if (!file) return;
    try {
      const blob = await resizeImage(file, 1600, false);
      setDraft((d) => ({ ...d, shot: blob, image: URL.createObjectURL(blob) }));
    } catch {
      toast.error("Use a JPG, PNG or WebP image");
    }
  }

  // Fills only what is empty, so nothing the owner typed is lost; they review it before saving.
  async function readShot() {
    if (!editing || reading) return;
    setReading(true);
    const res = await readImageText(spaceId, editing.id);
    setReading(false);
    if (!res.ok) return toast.error(res.error);
    const r = res.data;
    if (!r) return;
    setDraft((d) => ({
      ...d,
      name: d.name.trim() ? d.name : (r.name ?? d.name),
      text: d.text.trim() ? d.text : (r.text ?? d.text),
      rating: d.rating ?? r.rating ?? null,
    }));
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!draft.name.trim() && !draft.image) return toast.error("Add a name");
    if (!draft.text.trim() && !editing?.video && !draft.image) return toast.error("Add the testimonial text");
    setBusy(true);
    try {
      let avatarKey: string | null | undefined = draft.avatarKey;
      if (draft.photo) avatarKey = await uploadOwnerFile(spaceId, "avatar", draft.photo, "image/jpeg");
      let logoKey = draft.logoKey;
      if (draft.logoFile) logoKey = await uploadOwnerFile(spaceId, "logo", draft.logoFile, "image/png");
      let imageKey = draft.imageKey;
      if (draft.shot) imageKey = await uploadOwnerFile(spaceId, "image", draft.shot, "image/jpeg");
      const posterKey = draft.posterFile ? await uploadOwnerFile(spaceId, "poster", draft.posterFile, "image/jpeg") : undefined;
      const source = draft.source === "Other" ? draft.sourceOther.trim() || "Other" : draft.source;
      const input: TestimonialInput = {
        name: draft.name,
        title: draft.title || null,
        company: draft.company || null,
        text: draft.text,
        rating: draft.rating,
        source,
        source_url: draft.source_url.trim() || null,
        given_at: draft.date || null,
        status: draft.status,
        ...(avatarKey !== undefined ? { avatar_key: avatarKey } : {}),
        ...(logoKey !== undefined ? { company_logo_key: logoKey } : {}),
        ...(imageKey !== undefined ? { image_key: imageKey } : {}),
        ...(posterKey ? { poster_key: posterKey } : {}),
        ...(editing?.video ? { video_start: draft.trim.start || null, video_end: draft.trim.end } : {}),
      };
      const res = editing ? await updateTestimonial(spaceId, editing.id, input) : await addTestimonial(spaceId, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onSaved(res.data, !editing);
      onOpenChange(false);
      toast.success(editing ? "Saved" : "Added");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit testimonial" : preset ? `Add from ${sourceOf(preset.source)?.label ?? preset.source}` : "Add testimonial"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      <form onSubmit={save} className="space-y-4 p-5" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void save()}>
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <button type="button" onClick={() => photoInput.current?.click()} className="group relative rounded-full" aria-label="Photo">
              <Avatar src={draft.avatar} size={56} />
              <span className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full bg-accent text-on-accent ring-2 ring-surface">
                <Camera className="size-3" />
              </span>
            </button>
            {draft.avatar && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, avatar: null, avatarKey: null, photo: null }))}
                className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-surface-3 text-muted ring-2 ring-surface hover:text-ink"
                aria-label="Remove photo"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            )}
            <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          </div>
          <input
            autoFocus
            aria-label="Name"
            placeholder="Name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={80}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input
            aria-label="Title"
            placeholder="Title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={80}
            className={inputClass}
          />
          <div className="flex gap-2">
            <input
              aria-label="Company"
              placeholder="Company"
              value={draft.company}
              onChange={(e) => set("company", e.target.value)}
              maxLength={80}
              className={cn(inputClass, "min-w-0")}
            />
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                aria-label={draft.logo ? "Change company logo" : "Add company logo"}
                className={cn(
                  "grid h-11 place-items-center overflow-hidden rounded-[8px] bg-surface text-faint ring-1 ring-line transition-colors ring-inset hover:bg-surface-2 hover:text-ink md:h-10",
                  draft.logo ? "w-[88px] bg-white px-2 hover:bg-white" : "w-11 md:w-10",
                )}
              >
                {draft.logo ? (
                  <img src={draft.logo} alt="" className="max-h-6 max-w-full object-contain" />
                ) : (
                  <Building2 className="size-4" />
                )}
              </button>
              {draft.logo && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, logo: null, logoKey: null, logoFile: null }))}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-surface-3 text-muted ring-2 ring-surface hover:text-ink"
                  aria-label="Remove company logo"
                >
                  <X className="size-3" strokeWidth={3} />
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Company logo file"
                className="hidden"
                onChange={(e) => (void pickLogo(e.target.files?.[0]), (e.target.value = ""))}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center py-1">
          <StarInput value={draft.rating} onChange={(v) => set("rating", v)} size={28} />
        </div>
        <textarea
          aria-label="Testimonial"
          placeholder="Testimonial"
          value={draft.text}
          onChange={(e) => set("text", e.target.value)}
          rows={5}
          maxLength={3000}
          className={cn(textareaClass, "min-h-[120px]")}
        />
        {editing && (details?.answers.length || editing.email || editing.website) ? (
          <div className="rounded-[10px] p-3.5 ring-1 ring-line ring-inset" data-testid="edit-answers">
            <AnswerList
              answers={[
                ...(editing.email ? [{ label: "Email", value: editing.email }] : []),
                ...(editing.website ? [{ label: "Website", value: editing.website }] : []),
                ...(details?.answers ?? []),
              ]}
            />
          </div>
        ) : null}
        {draft.image ? (
          <div className="flex items-start gap-3">
            <img src={draft.image} alt="Screenshot" className="max-h-40 max-w-[60%] rounded-[8px] object-contain ring-1 ring-line" />
            <div className="flex flex-col items-start gap-1">
              {readText && editing?.image_key && draft.imageKey === undefined && !draft.shot && (
                <Button variant="ghost" size="sm" disabled={reading} onClick={() => void readShot()}>
                  {reading && <Loader2 className="size-3.5 animate-spin" />} Read text
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => shotInput.current?.click()}>
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted"
                onClick={() => setDraft((d) => ({ ...d, image: null, imageKey: null, shot: null }))}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => shotInput.current?.click()}>
            <ImagePlus className="size-4" /> Screenshot
          </Button>
        )}
        <input
          ref={shotInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Screenshot"
          className="hidden"
          onChange={(e) => {
            void pickShot(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {editing?.video && (
          <Field label="Trim">
            <VideoTrim
              src={editing.video}
              poster={draft.poster}
              name={editing.name}
              value={draft.trim}
              onChange={(trim) => set("trim", trim)}
              onPoster={(file, preview) => setDraft((d) => ({ ...d, posterFile: file, poster: preview }))}
            />
          </Field>
        )}
        {draft.source !== "Form" && (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Source">
              <select
                aria-label="Source"
                value={draft.source}
                onChange={(e) => set("source", e.target.value)}
                className={cn(inputClass, "appearance-none pr-8")}
              >
                {SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                aria-label="Date"
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
                className={inputClass}
              />
            </Field>
            {draft.source === "Other" && (
              <input
                aria-label="Source name"
                placeholder="Source name"
                value={draft.sourceOther}
                onChange={(e) => set("sourceOther", e.target.value)}
                maxLength={32}
                className={cn(inputClass, "col-span-2")}
              />
            )}
            <input
              aria-label="Link"
              placeholder="Link (optional)"
              inputMode="url"
              value={draft.source_url}
              onChange={(e) => set("source_url", e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
          </div>
        )}
        <Segmented
          label="Status"
          value={draft.status}
          onChange={(v) => set("status", v)}
          options={[
            { value: "new", label: "New" },
            { value: "approved", label: "Approved" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        {editing && translationList.length > 0 && (
          <Field label="Translations">
            <TranslationList
              spaceId={spaceId}
              testimonialId={editing.id}
              list={translationList}
              onChange={(list) => setTranslated({ id: editing.id, list })}
            />
          </Field>
        )}
        {editing && <ConsentRecord t={editing} />}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
