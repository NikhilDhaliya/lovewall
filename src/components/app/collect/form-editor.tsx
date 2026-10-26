"use client";

import { Check, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Link } from "@/components/app/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteForm, updateForm } from "@/app/actions/forms";
import { updateSpace } from "@/app/actions/spaces";
import { Group, GroupRow, rowInputClass } from "@/components/app/grouped";
import { useShell } from "@/components/app/shell";
import { CollectForm } from "@/components/collect/collect-form";
import { buildSteps } from "@/components/collect/steps";
import { uploadOwnerFile } from "@/components/inbox/upload";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy";
import { inputClass, textareaClass } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  FIELD_KEYS,
  FIELD_LABEL,
  FIELD_MODES,
  isHttpUrl,
  liveQuestions,
  type FieldKey,
  type FieldMode,
  type FormConfig,
  type RewardResult,
} from "@/lib/forms";
import { en, type CollectDict } from "@/lib/i18n/collect/en";
import { LANGUAGES, RTL } from "@/lib/i18n/collect/languages";
import { loadDict } from "@/lib/i18n/collect/load";
import { PAGE } from "@/lib/layout";
import { resizeLogo } from "@/lib/media";
import { QuestionList } from "./question-editor";
import { BadLink, RewardEditor } from "./reward-editor";
import { TabLinks } from "./tabs";

type Draft = Pick<
  FormConfig,
  "title" | "prompt" | "hints" | "fields" | "questions" | "layout" | "thanks" | "language" | "reward" | "followup"
>;

const MODE_LABEL: Record<FieldMode, string> = { off: "Off", optional: "Optional", required: "Required" };

function draftOf(f: FormConfig): Draft {
  const { title, prompt, hints, fields, questions, layout, thanks, language, reward, followup } = f;
  return { title, prompt, hints, fields, questions, layout, thanks, language, reward, followup };
}

const validLinks = (d: Draft) =>
  [
    d.thanks.buttonUrl,
    d.reward.type === "link" ? d.reward.url : "",
    ...d.reward.prizes.filter((p) => p.kind === "link").map((p) => p.value),
  ].every((u) => !u || isHttpUrl(u));

function previewRewardOf(d: Draft): RewardResult | null {
  const r = d.reward;
  if (r.type === "coupon") return { type: "code", code: r.mode === "fixed" ? r.code || "THANKYOU20" : "CODE-7Q2K", label: r.label };
  if (r.type === "link") return { type: "link", url: r.url || "https://example.com", label: r.label };
  if (r.type === "wheel") return { type: "wheel", claim: "", prizes: r.prizes.map((p) => p.label || "…") };
  return null;
}

export function FormEditor({
  space,
  form,
  appUrl,
  storage,
  codes: initialCodes,
}: {
  space: { id: string; name: string; slug: string; logo: string | null; website: string | null };
  form: FormConfig;
  appUrl: string;
  storage: boolean;
  codes: { left: number; used: number };
}) {
  const router = useRouter();
  const { patchSpace } = useShell();
  const [draft, setDraft] = useState<Draft>(() => draftOf(form));
  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug);
  const saved = useRef({ name: form.name, slug: form.slug });
  const [logo, setLogo] = useState(space.logo);
  const [logoBusy, setLogoBusy] = useState(false);
  const [codes, setCodes] = useState(initialCodes);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [position, setPosition] = useState(0);
  const [loaded, setLoaded] = useState<{ lang: string; dict: CollectDict } | null>(null);
  const first = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const url = `${appUrl}/${space.slug}${form.isDefault ? "" : `/${slug}`}`;
  const nps = form.kind === "nps";
  const caseStudy = form.kind === "case_study";

  // Autosave everything but the name and link (those save on blur).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!validLinks(draft)) return;
    const id = setTimeout(async () => {
      const res = await updateForm(space.id, form.id, draft);
      if (!res.ok) {
        setSaving("idle");
        toast.error(res.error);
      } else setSaving("saved");
    }, 600);
    return () => clearTimeout(id);
  }, [draft, space.id, form.id]);

  // The preview speaks the form's language (a fixed one; "visitor's browser" previews in English).
  useEffect(() => {
    const lang = draft.language;
    let live = true;
    loadDict(lang)
      ?.then((d) => live && setLoaded({ lang, dict: d }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft.language]);

  const dict = loaded && loaded.lang === draft.language ? loaded.dict : en;
  const shownSaving = validLinks(draft) ? saving : "idle";
  // Every edit shows "saving" right away; the effect above saves once typing pauses.
  const change = (fn: (d: Draft) => Draft) => {
    setSaving("saving");
    setDraft(fn);
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => change((d) => ({ ...d, [k]: v }));
  const setField = (k: FieldKey, v: FieldMode) => change((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));

  async function saveMeta(patch: { name?: string; slug?: string }) {
    const res = await updateForm(space.id, form.id, patch);
    if (!res.ok) {
      toast.error(res.error);
      if (patch.name !== undefined) setName(saved.current.name);
      if (patch.slug !== undefined) setSlug(saved.current.slug);
      return;
    }
    if (patch.name !== undefined) saved.current.name = patch.name;
    if (patch.slug !== undefined) saved.current.slug = res.data.slug;
    toast.success(patch.slug !== undefined ? "Link updated" : "Renamed");
    router.refresh();
  }

  async function pickLogo(file?: File) {
    if (!file) return;
    setLogoBusy(true);
    try {
      const blob = await resizeLogo(file, 256);
      const key = await uploadOwnerFile(space.id, "logo", blob, "image/png");
      const res = await updateSpace(space.id, { logo_key: key });
      if (!res.ok) throw new Error(res.error);
      const objectUrl = URL.createObjectURL(blob);
      setLogo(objectUrl);
      patchSpace(space.id, { logo: objectUrl });
      toast.success("Logo updated");
    } catch (err) {
      toast.error((err as Error).message || "Couldn’t upload");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    const res = await updateSpace(space.id, { logo_key: null });
    if (!res.ok) return toast.error(res.error);
    setLogo(null);
    patchSpace(space.id, { logo: null });
  }

  async function remove() {
    const ok = await confirmAction({
      title: `Delete “${name}”?`,
      message: "Its link stops working. Testimonials stay in the inbox.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteForm(space.id, form.id);
    if (!res.ok) return toast.error(res.error);
    toast.success("Form deleted");
    router.replace(`/app/${space.id}/collect`);
  }

  // Preview: walk through the steps (or the page) and the thank-you screen.
  const publicForm = useMemo(
    () => ({ ...draft, id: form.id, kind: form.kind, questions: liveQuestions(draft.questions) }),
    [draft, form.id, form.kind],
  );
  const steps = buildSteps(publicForm, { promoter: true, optIn: true, video: storage && draft.fields.video !== "off" });
  const stepped = publicForm.layout === "steps" || form.kind !== "testimonial";
  const positions = stepped ? steps.length + 1 : 2;
  const pos = Math.min(position, positions - 1);
  const previewStep = stepped ? pos : pos === 0 ? 0 : steps.length;
  const posLabel = pos === positions - 1 ? "Thank you" : stepped ? `${pos + 1} of ${steps.length}` : "Form";
  const previewReward = previewRewardOf(draft);
  const dir = RTL.has(draft.language) ? "rtl" : "ltr";

  const fieldKeys = FIELD_KEYS.filter((k) => !(caseStudy && k === "video"));

  return (
    <div className="pb-24 md:pb-10">
      <h1 className="sr-only">{name || "Form"}</h1>
      <div className="sticky top-14 z-20 bar md:top-0">
        <div className={cn(PAGE, "flex h-14 items-center gap-2")}>
          <Link
            href={`/app/${space.id}/collect`}
            className="flex h-9 items-center gap-0.5 rounded-lg pr-2 text-[14px] font-medium text-muted transition-colors hover:text-ink"
            aria-label="Back to forms"
          >
            <ChevronLeft className="size-5" /> <span className="max-sm:hidden">Collect</span>
          </Link>
          <input
            aria-label="Form name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name.trim()) return setName(saved.current.name);
              if (name !== saved.current.name) void saveMeta({ name });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-9 min-w-0 flex-1 rounded-[8px] bg-transparent px-2 font-display text-[16px] font-medium transition-colors outline-none hover:bg-surface-2 focus:bg-surface-2 md:max-w-[320px]"
          />
          <span className="flex w-16 items-center justify-end gap-1 text-[12px] text-faint" aria-live="polite">
            {shownSaving === "saving" && <Loader2 className="size-3.5 animate-spin" />}
            {shownSaving === "saved" && (
              <>
                <Check className="size-3.5" strokeWidth={2.5} /> Saved
              </>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="icon" asChild>
              <a href={url} target="_blank" rel="noopener" aria-label="Open form">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className={cn(PAGE, "pt-2")}>
        {(nps || caseStudy) && (
          <TabLinks
            className="mb-6"
            tabs={[
              { href: `/app/${space.id}/collect/${form.id}`, label: "Edit", exact: true },
              { href: `/app/${space.id}/collect/${form.id}/results`, label: nps ? "Results" : "Case studies" },
            ]}
          />
        )}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            <Group title="Link">
              <div className="flex items-center gap-2 p-2 pl-4">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 flex-1 truncate text-[15px] font-medium"
                  data-testid="form-link"
                >
                  {url.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton
                  text={url}
                  label="Copy"
                  toastLabel="Link copied"
                  className="h-9 rounded-[8px] bg-accent px-3.5 text-[14px] text-on-accent hover:bg-accent-hover"
                />
              </div>
              {!form.isDefault && (
                <GroupRow label="Path" htmlFor="form-slug">
                  <span className="flex min-w-0 items-center justify-end rounded-[8px] px-2 transition-colors focus-within:bg-surface-2 hover:bg-surface-2">
                    <span className="truncate text-[15px] text-faint md:text-[14px]">/{space.slug}/</span>
                    <input
                      id="form-slug"
                      value={slug}
                      maxLength={40}
                      spellCheck={false}
                      autoCapitalize="off"
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      onBlur={() => slug !== saved.current.slug && void saveMeta({ slug })}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="[field-sizing:content] h-10 min-w-[2ch] bg-transparent text-[15px] text-ink outline-none md:text-[14px]"
                    />
                  </span>
                </GroupRow>
              )}
            </Group>

            <Group title="Page">
              <div className="flex items-center gap-4 p-4">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={logoBusy || !storage}
                  className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-surface-2 text-muted transition-colors hover:bg-surface-3 disabled:opacity-60"
                  aria-label={logo ? "Change logo" : "Add logo"}
                >
                  {logoBusy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : logo ? (
                    <img src={logo} alt="" className="size-full object-contain" />
                  ) : (
                    <ImagePlus className="size-6" />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">Logo</div>
                  {logo ? (
                    <button type="button" onClick={() => void removeLogo()} className="text-[13px] text-muted hover:text-danger">
                      Remove
                    </button>
                  ) : (
                    <div className="text-[13px] text-muted">Every form of the space</div>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void pickLogo(e.target.files?.[0])}
                />
              </div>
              <div className="p-4">
                <label htmlFor="form-title" className="mb-2 block text-[13px] font-medium text-muted">
                  {nps ? "Score question" : "Headline"}
                </label>
                <textarea
                  id="form-title"
                  rows={2}
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  className={cn(textareaClass, "font-display text-[17px] font-semibold md:text-[17px]")}
                />
              </div>
              {nps && (
                <div className="p-4">
                  <label htmlFor="form-followup" className="mb-2 block text-[13px] font-medium text-muted">
                    Follow-up
                  </label>
                  <input
                    id="form-followup"
                    maxLength={200}
                    value={draft.followup}
                    placeholder={en.npsFollowup}
                    onChange={(e) => set("followup", e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
              <div className="p-4">
                <label htmlFor="form-prompt" className="mb-2 block text-[13px] font-medium text-muted">
                  Intro
                </label>
                <textarea
                  id="form-prompt"
                  rows={2}
                  maxLength={400}
                  value={draft.prompt}
                  placeholder="Optional"
                  onChange={(e) => set("prompt", e.target.value)}
                  className={textareaClass}
                />
              </div>
              {!caseStudy && (
                <div className="p-4">
                  <div className="mb-2 text-[13px] font-medium text-muted">Hints</div>
                  <div className="space-y-2">
                    {draft.hints.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          aria-label={`Hint ${i + 1}`}
                          value={h}
                          maxLength={140}
                          onChange={(e) =>
                            set(
                              "hints",
                              draft.hints.map((x, j) => (j === i ? e.target.value : x)),
                            )
                          }
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "hints",
                              draft.hints.filter((_, j) => j !== i),
                            )
                          }
                          className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                          aria-label={`Remove hint ${i + 1}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    {draft.hints.length < 6 && (
                      <button
                        type="button"
                        onClick={() => set("hints", [...draft.hints, ""])}
                        className="flex h-9 items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"
                      >
                        <Plus className="size-4" /> Add hint
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Group>

            <Group title={nps ? "Testimonial from promoters" : "Fields"}>
              {fieldKeys.map((k) => {
                const needsStorage = (k === "video" || k === "photo") && !storage;
                return (
                  <GroupRow key={k} label={FIELD_LABEL[k]}>
                    <Select<FieldMode>
                      aria-label={FIELD_LABEL[k]}
                      value={needsStorage ? "off" : draft.fields[k]}
                      onChange={(v) => !needsStorage && setField(k, v)}
                      options={FIELD_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
                      className="w-[128px]"
                    />
                  </GroupRow>
                );
              })}
            </Group>

            <Group title="Questions">
              <QuestionList questions={draft.questions} onChange={(q) => set("questions", q)} />
            </Group>

            <Group title="Display">
              {form.kind === "testimonial" && (
                <GroupRow label="Layout">
                  <Segmented
                    label="Layout"
                    fit
                    value={draft.layout}
                    onChange={(layout) => {
                      set("layout", layout);
                      setPosition(0);
                    }}
                    options={[
                      { value: "single", label: "One page" },
                      { value: "steps", label: "Steps" },
                    ]}
                  />
                </GroupRow>
              )}
              <GroupRow label="Language">
                <Select<string>
                  aria-label="Language"
                  value={draft.language}
                  onChange={(language) => set("language", language)}
                  options={[{ value: "auto", label: "Visitor’s browser" }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
                  className="w-[176px]"
                />
              </GroupRow>
            </Group>

            <Group title="Thank you">
              <GroupRow label="Title" htmlFor="thanks-title">
                <input
                  id="thanks-title"
                  value={draft.thanks.title}
                  maxLength={120}
                  placeholder={dict.thanksTitle}
                  onChange={(e) => set("thanks", { ...draft.thanks, title: e.target.value })}
                  className={rowInputClass}
                />
              </GroupRow>
              <div className="p-4">
                <label htmlFor="thanks-text" className="mb-2 block text-[13px] font-medium text-muted">
                  Message
                </label>
                <textarea
                  id="thanks-text"
                  rows={2}
                  maxLength={400}
                  value={draft.thanks.text}
                  placeholder={dict.thanksText.replace("{space}", space.name)}
                  onChange={(e) => set("thanks", { ...draft.thanks, text: e.target.value })}
                  className={textareaClass}
                />
              </div>
              <GroupRow label="Button" htmlFor="thanks-button">
                <input
                  id="thanks-button"
                  value={draft.thanks.buttonLabel}
                  maxLength={40}
                  placeholder="Optional"
                  onChange={(e) => set("thanks", { ...draft.thanks, buttonLabel: e.target.value })}
                  className={rowInputClass}
                />
              </GroupRow>
              {draft.thanks.buttonLabel && (
                <>
                  <GroupRow label="Button link" htmlFor="thanks-url">
                    <input
                      id="thanks-url"
                      inputMode="url"
                      value={draft.thanks.buttonUrl}
                      maxLength={500}
                      placeholder="acme.com"
                      onChange={(e) => set("thanks", { ...draft.thanks, buttonUrl: e.target.value })}
                      className={rowInputClass}
                    />
                  </GroupRow>
                  <BadLink value={draft.thanks.buttonUrl} />
                </>
              )}
            </Group>

            <Group title="Reward">
              <RewardEditor
                spaceId={space.id}
                formId={form.id}
                reward={draft.reward}
                onChange={(r) => set("reward", r)}
                codes={codes}
                onCodes={setCodes}
              />
            </Group>

            {!form.isDefault && (
              <Group>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="flex min-h-[52px] w-full items-center justify-center px-4 text-[15px] font-medium text-danger transition-colors hover:bg-danger-soft/50"
                >
                  Delete form
                </button>
              </Group>
            )}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-medium text-muted">Preview</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPosition(Math.max(0, pos - 1))}
                  disabled={pos === 0}
                  className="grid size-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="min-w-[72px] text-center text-[13px] text-muted tabular-nums" aria-live="polite">
                  {posLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setPosition(Math.min(positions - 1, pos + 1))}
                  disabled={pos === positions - 1}
                  className="grid size-8 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                  aria-label="Next step"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <div className="mx-auto max-w-[400px] overflow-hidden rounded-[28px] bg-canvas p-2 ring-1 ring-line">
              <div
                className="pointer-events-none max-h-[720px] overflow-hidden rounded-[30px] bg-canvas [mask-image:linear-gradient(#000_85%,transparent)] px-5 pt-8 pb-14 select-none"
                inert
                dir={dir}
              >
                <CollectForm
                  key={`${pos}-${draft.layout}`}
                  preview
                  previewStep={previewStep}
                  previewReward={previewReward}
                  token=""
                  dict={dict}
                  dir={dir}
                  form={publicForm}
                  space={{ id: space.id, name: space.name, logo, website: space.website, wallUrl: null, uploads: storage }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
