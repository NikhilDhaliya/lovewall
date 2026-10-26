"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Loader2, PenLine, Video } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { inputClass, textareaClass } from "@/components/ui/field";
import { SPRING_SOFT } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { StarInput } from "@/components/ui/stars";
import { cn } from "@/lib/cn";
import { checkAnswer, EMAIL_RE, isEmptyAnswer, isHttpUrl, type Answer, type PublicForm, type RewardResult } from "@/lib/forms";
import { en, type CollectDict, type CollectKey } from "@/lib/i18n/collect/en";
import { t } from "@/lib/i18n/collect/languages";
import { putWithProgress, resizeImage } from "@/lib/media";
import { ConsentBox, NpsScale, QuestionInput } from "./fields";
import { Polish } from "./polish";
import { RewardBlock } from "./reward";
import { buildSteps, stepKey, type Step } from "./steps";
import { VideoRecorder, type RecordedVideo } from "./video-recorder";

export type CollectSpace = {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  wallUrl: string | null;
  uploads?: boolean;
  privacyUrl?: string | null;
};

export type CollectInvite = { token: string; name: string; email: string };

type Mode = "text" | "video";

const X_GLYPH =
  "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z";
const IN_GLYPH =
  "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12M7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0";

// Server error codes the page can say in the visitor's language.
const CODES: Record<string, CollectKey> = {
  expired: "errExpired",
  name: "errName",
  text: "errText",
  video: "errVideo",
  consent: "errConsent",
  rating: "errRating",
  score: "errScore",
  required: "errRequired",
  email: "errEmail",
  url: "errUrl",
};

async function presign(spaceId: string, formId: string, token: string, kind: string, blob: Blob, type: string) {
  const res = await fetch(`/api/collect/${spaceId}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, type, size: blob.size, formId, token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data as { key: string; url: string };
}

const primaryButton =
  "flex h-12 items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-[16px] font-medium text-on-accent transition-[background-color,scale,opacity] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-70";
const secondaryButton =
  "flex h-12 items-center justify-center gap-2 rounded-[10px] bg-surface px-5 text-[15px] font-medium ring-1 ring-line transition-[background-color,scale] ring-inset hover:bg-surface-2 active:scale-[0.98]";

// The public collect form, for every kind of form (testimonial, NPS survey, case study), on one page or in steps.
// `preview` renders it inert inside the editor, at `previewStep` (the step count means the thank-you screen).
export function CollectForm({
  space,
  form,
  dict = en,
  token,
  invite = null,
  maxVideoMb = 60,
  preview = false,
  previewStep,
  previewReward = null,
  dir = "ltr",
  lang = "en",
  polish = false,
}: {
  space: CollectSpace;
  form: PublicForm;
  dict?: CollectDict;
  token: string;
  invite?: CollectInvite | null;
  maxVideoMb?: number;
  preview?: boolean;
  previewStep?: number;
  previewReward?: RewardResult | null;
  dir?: "ltr" | "rtl";
  lang?: string;
  // AI spelling help under the testimonial box (the space has it on and the server has a key).
  polish?: boolean;
}) {
  const f = form.fields;
  const uploads = space.uploads !== false;
  const videoOn = f.video !== "off" && uploads;
  const modes: Mode[] =
    f.video === "required" && videoOn
      ? ["video"]
      : [...(f.text !== "off" ? ["text" as const] : []), ...(videoOn ? ["video" as const] : [])];
  const [mode, setMode] = useState<Mode>(modes[0] ?? "text");
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState(invite?.name ?? "");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState(invite?.email ?? "");
  const [homepage, setHomepage] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [video, setVideo] = useState<RecordedVideo | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer | undefined>>({});
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<{ testimonial: boolean } | null>(null);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const photoInput = useRef<HTMLInputElement>(null);
  const focusNext = useRef(false);
  const ids = useId();

  const promoter = preview || (score !== null && score >= 9);
  const steps = buildSteps(form, { promoter, optIn: preview ? true : optIn, video: videoOn });
  // The progress line assumes the longer path until the visitor picks (an NPS fan writing a testimonial).
  const total =
    form.kind === "nps" && !preview
      ? buildSteps(form, { promoter: score === null || promoter, optIn: optIn ?? true, video: videoOn }).length
      : steps.length;
  const stepped = form.layout === "steps";
  const index = Math.min(preview && previewStep !== undefined ? previewStep : stepIndex, steps.length - 1);
  const step = steps[index];
  const last = index === steps.length - 1;
  const makesTestimonial = form.kind !== "nps" || (promoter && optIn === true);
  const showDone = done ?? (preview && previewStep !== undefined && previewStep >= steps.length ? { testimonial: true } : null);
  const shownReward = done ? reward : preview ? previewReward : null;
  const fallbackTitle = t(dict, "defaultTitle", { space: space.name });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await resizeImage(file, 480);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError({ message: dict.errPhoto });
    }
  }

  // ---------- Checks (the server repeats them) ----------

  function check(s: Step, testimonial = makesTestimonial): { message: string; field?: string } | null {
    switch (s.kind) {
      case "score":
        return score === null ? { message: dict.errScore, field: "score" } : null;
      case "experience": {
        if (f.rating === "required" && !rating) return { message: dict.errRating, field: "rating" };
        const videoRequired = mode === "video" && (f.video === "required" || modes.includes("text"));
        if (mode === "video" && videoRequired && !video) return { message: dict.errVideo, field: "video" };
        if (mode === "text" && f.text === "required" && !text.trim()) return { message: dict.errText, field: "text" };
        return null;
      }
      case "question": {
        const q = form.questions.find((x) => x.id === s.id);
        if (!q) return null;
        const res = checkAnswer(q, answers[q.id]);
        if ("error" in res) {
          const key: CollectKey = res.error === "email" ? "errEmail" : res.error === "url" ? "errUrl" : "errRequired";
          return { message: dict[key], field: `q:${q.id}` };
        }
        return null;
      }
      case "about": {
        if (f.name === "required" && !name.trim()) return { message: dict.errName, field: "name" };
        if (f.role === "required" && (!title.trim() || !company.trim()))
          return { message: dict.errRequired, field: title.trim() ? "company" : "title" };
        if (f.photo === "required" && uploads && !photo) return { message: dict.addPhoto, field: "photo" };
        if (f.email !== "off" && (email.trim() ? !EMAIL_RE.test(email.trim()) : f.email === "required"))
          return { message: dict.errEmail, field: "email" };
        if (f.website !== "off" && (homepage.trim() ? !isHttpUrl(homepage.trim()) : f.website === "required"))
          return { message: dict.errUrl, field: "homepage" };
        if (testimonial) {
          const empty = !text.trim() && !video && !rating && Object.values(answers).every(isEmptyAnswer);
          if (empty) return { message: dict.errText, field: "text" };
          if (!consent) return { message: dict.errConsent, field: "consent" };
        }
        return null;
      }
      default:
        return null;
    }
  }

  function showError(e: { message: string; field?: string }) {
    setError(e);
    // Point at the field that needs attention.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${e.field}"]`);
      const inner = el?.matches("input, textarea, button")
        ? el
        : el?.querySelector<HTMLElement>('input:not([type=file]), textarea, [role=radio][tabindex="0"], [role=checkbox], button');
      (inner ?? el)?.focus();
    });
  }

  function go(to: number) {
    setDirection(to > index ? 1 : -1);
    setError(null);
    focusNext.current = true;
    setStepIndex(to);
  }

  function next() {
    if (preview || busy || step.kind === "ask") return;
    const problem = stepped ? check(step) : steps.map((s) => check(s)).find(Boolean);
    if (problem) return showError(problem);
    if (stepped && !last) return go(index + 1);
    void submit();
  }

  // ---------- Sending ----------

  async function submit(opts: { optIn?: boolean } = {}) {
    if (preview || busy) return;
    const testimonial = form.kind !== "nps" || (promoter && (opts.optIn ?? optIn) === true);
    setError(null);
    try {
      let avatarKey: string | null = null;
      let videoKey: string | null = null;
      let posterKey: string | null = null;
      if (testimonial && photo && f.photo !== "off") {
        setBusy(dict.uploadingPhoto);
        const up = await presign(space.id, form.id, token, "avatar", photo.blob, "image/jpeg");
        await putWithProgress(up.url, photo.blob, "image/jpeg");
        avatarKey = up.key;
      }
      if (testimonial && mode === "video" && video) {
        setBusy(t(dict, "uploading", { pct: 0 }));
        const up = await presign(space.id, form.id, token, "video", video.blob, video.type);
        await putWithProgress(up.url, video.blob, video.type, (p) => setBusy(t(dict, "uploading", { pct: Math.round(p * 100) })));
        videoKey = up.key;
        if (video.poster) {
          const p = await presign(space.id, form.id, token, "poster", video.poster, "image/jpeg");
          await putWithProgress(p.url, video.poster, "image/jpeg");
          posterKey = p.key;
        }
      }
      setBusy(dict.sending);
      const cleanAnswers = Object.fromEntries(Object.entries(answers).filter(([, v]) => !isEmptyAnswer(v)));
      const res = await fetch(`/api/collect/${space.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: form.id,
          rating: testimonial ? rating : null,
          text: testimonial ? text.trim() : "",
          name: name.trim(),
          title: title.trim() || null,
          company: company.trim() || null,
          email: email.trim() || null,
          homepage: homepage.trim() || null,
          avatarKey,
          videoKey,
          posterKey,
          videoAspect: videoKey && video ? Math.round(video.aspect * 1000) / 1000 : null,
          answers: cleanAnswers,
          nps: form.kind === "nps" ? { score, comment: reason.trim() } : undefined,
          testimonial,
          consent: testimonial ? consent : false,
          invite: invite?.token,
          lang,
          token,
          website: honey,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; reward?: RewardResult | null };
      if (!res.ok) {
        const key = res.status === 429 ? "errTooMany" : data.code ? CODES[data.code] : undefined;
        throw new Error(key ? dict[key] : dict === en && data.error ? data.error : dict.errSend);
      }
      setReward(data.reward ?? null);
      setDone({ testimonial });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError({ message: (err as Error).message || dict.errSend });
    } finally {
      setBusy(null);
    }
  }

  // ---------- Pieces ----------

  const headingId = `${ids}-h`;
  const header = (big: boolean) => (
    <header className={cn(big ? "pt-2 pb-7" : "pb-5")}>
      {big && space.logo && (
        <img src={space.logo} alt={space.name} className="mb-6 h-12 w-auto max-w-[180px] rounded-[10px] object-contain" />
      )}
      <p className="text-[14px] text-muted">{space.name}</p>
    </header>
  );

  const polishBox =
    polish && !preview ? (
      <Polish spaceId={space.id} token={token} text={text} onUse={setText} dict={dict} disabled={Boolean(busy)} />
    ) : null;

  const title1 = (text: string, opts: { id?: string; sub?: string; hints?: string[] } = {}) => (
    <div className="pb-7">
      <h1
        id={opts.id}
        className="font-display text-[28px] leading-[1.18] font-medium tracking-[-0.022em] text-balance [overflow-wrap:anywhere] sm:text-[32px]"
      >
        {text}
      </h1>
      {opts.sub && <p className="mt-3 text-[16px] leading-relaxed whitespace-pre-line text-muted">{opts.sub}</p>}
      {opts.hints && opts.hints.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {opts.hints.map((h, i) => (
            <li key={i} className="text-[15px] leading-snug text-muted">
              {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const experience = (
    <div className="space-y-5">
      {modes.length > 1 && (
        <Segmented
          label={dict.testimonialType}
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "text",
              label: (
                <span className="flex items-center justify-center gap-1.5">
                  <PenLine className="size-[15px]" /> {dict.write}
                </span>
              ),
            },
            {
              value: "video",
              label: (
                <span className="flex items-center justify-center gap-1.5">
                  <Video className="size-[15px]" /> {dict.video}
                </span>
              ),
            },
          ]}
        />
      )}
      {f.rating !== "off" && (
        <div className="flex" data-field="rating" tabIndex={-1}>
          <StarInput
            value={rating}
            onChange={setRating}
            size={30}
            label={dict.rating}
            starLabel={(i) => (i === 1 ? dict.oneStar : t(dict, "stars", { n: i }))}
          />
        </div>
      )}
      {mode === "video" ? (
        <>
          <div data-field="video" tabIndex={-1} className="outline-none">
            <VideoRecorder value={video} onChange={setVideo} maxMb={maxVideoMb} disabled={preview || Boolean(busy)} dict={dict} />
          </div>
          {f.text !== "off" && (
            <textarea
              aria-label={dict.fewWords}
              placeholder={dict.fewWords}
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
              rows={3}
              className={textareaClass}
            />
          )}
          {f.text !== "off" && polishBox}
        </>
      ) : (
        f.text !== "off" && (
          <textarea
            data-field="text"
            aria-label={f.text === "optional" ? dict.fewWords : dict.yourTestimonial}
            placeholder={f.text === "optional" ? dict.fewWords : dict.yourTestimonial}
            aria-invalid={error?.field === "text" || undefined}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={3000}
            rows={6}
            className={cn(textareaClass, "min-h-[150px]")}
          />
        )
      )}
      {mode !== "video" && f.text !== "off" && polishBox}
    </div>
  );

  const opt = (label: string, mode: string) => (mode === "optional" ? `${label} (${dict.optional})` : label);

  const about = (
    <div className="space-y-5">
      {(f.name !== "off" || (f.photo !== "off" && uploads)) && (
        <div className="flex items-center gap-3.5">
          {f.photo !== "off" && uploads && (
            <>
              <button
                type="button"
                data-field="photo"
                onClick={() => photoInput.current?.click()}
                className="group relative shrink-0 rounded-full outline-none focus-visible:ring-soft"
                aria-label={photo ? dict.changePhoto : dict.addPhoto}
              >
                <Avatar src={photo?.url} size={64} />
                <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-accent text-on-accent ring-2 ring-canvas transition-transform group-active:scale-90">
                  <Camera className="size-3.5" />
                </span>
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
            </>
          )}
          {f.name !== "off" && (
            <input
              data-field="name"
              aria-label={dict.yourName}
              placeholder={opt(dict.yourName, f.name)}
              aria-invalid={error?.field === "name" || undefined}
              autoComplete="name"
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className={cn(inputClass, "h-12 md:h-12")}
            />
          )}
        </div>
      )}
      {f.role !== "off" && (
        <div className="grid grid-cols-2 gap-2.5">
          <input
            data-field="title"
            aria-label={dict.jobTitle}
            placeholder={dict.jobTitle}
            autoComplete="organization-title"
            dir="auto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
          <input
            data-field="company"
            aria-label={dict.company}
            placeholder={dict.company}
            autoComplete="organization"
            dir="auto"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
        </div>
      )}
      {f.email !== "off" && (
        <input
          data-field="email"
          type="email"
          inputMode="email"
          aria-label={dict.email}
          placeholder={opt(dict.email, f.email)}
          aria-invalid={error?.field === "email" || undefined}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          className={inputClass}
        />
      )}
      {f.website !== "off" && (
        <input
          data-field="homepage"
          type="url"
          inputMode="url"
          aria-label={dict.website}
          placeholder={opt(dict.website, f.website)}
          aria-invalid={error?.field === "homepage" || undefined}
          autoComplete="url"
          value={homepage}
          onChange={(e) => setHomepage(e.target.value)}
          maxLength={300}
          className={inputClass}
        />
      )}
      {makesTestimonial && (
        <div data-field="consent" tabIndex={-1} className="outline-none">
          <ConsentBox
            checked={consent}
            onChange={setConsent}
            label={dict.agree}
            text={t(dict, photo ? "consentPhoto" : "consent", { space: space.name })}
            privacy={space.privacyUrl ? { url: space.privacyUrl, label: dict.privacy } : null}
          />
        </div>
      )}
    </div>
  );

  function questionBlock(id: string, inline: boolean) {
    const q = form.questions.find((x) => x.id === id);
    if (!q) return null;
    const labelId = `${ids}-${q.id}`;
    const label = (
      <>
        {q.label}
        {!q.required && <span className="font-normal text-faint"> ({dict.optional})</span>}
      </>
    );
    return (
      <div key={q.id} data-field={`q:${q.id}`} tabIndex={-1} className="outline-none">
        {inline ? (
          <div id={labelId} className="mb-2.5 text-[15px] font-medium [overflow-wrap:anywhere]">
            {label}
          </div>
        ) : (
          <h1
            id={labelId}
            className="pb-6 font-display text-[26px] leading-[1.2] font-medium tracking-[-0.02em] text-balance [overflow-wrap:anywhere] sm:text-[30px]"
          >
            {label}
          </h1>
        )}
        <QuestionInput
          q={q}
          dict={dict}
          labelledBy={labelId}
          invalid={error?.field === `q:${q.id}`}
          value={answers[q.id]}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        />
      </div>
    );
  }

  function stepBody(s: Step) {
    switch (s.kind) {
      case "experience":
        // NPS forms ask for the testimonial after the score; their own title is the score question.
        return (
          <>
            {title1(form.kind === "testimonial" ? form.title || fallbackTitle : fallbackTitle, {
              sub: form.kind === "testimonial" ? form.prompt : undefined,
              hints: form.kind === "case_study" ? [] : form.hints,
            })}
            {experience}
          </>
        );
      case "question":
        return (
          <>
            {index === 0 && form.kind === "case_study" && title1(form.title || fallbackTitle, { sub: form.prompt, hints: form.hints })}
            {questionBlock(s.id, index === 0 && form.kind === "case_study")}
          </>
        );
      case "about":
        return about;
      case "score":
        return (
          <>
            {title1(form.title || fallbackTitle, { id: headingId, sub: form.prompt })}
            <div data-field="score" tabIndex={-1} className="outline-none">
              <NpsScale value={score} onChange={setScore} labelledBy={headingId} dict={dict} />
            </div>
          </>
        );
      case "reason":
        return (
          <>
            {title1(form.followup || dict.npsFollowup, { id: `${headingId}-r` })}
            <textarea
              aria-labelledby={`${headingId}-r`}
              dir="auto"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={3000}
              rows={5}
              className={cn(textareaClass, "min-h-[130px]")}
            />
          </>
        );
      case "ask":
        return (
          <>
            {title1(dict.npsAsk)}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                data-autofocus
                className={primaryButton}
                onClick={() => {
                  setOptIn(true);
                  go(index + 1);
                }}
              >
                {dict.npsAskYes}
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={Boolean(busy)}
                onClick={() => {
                  setOptIn(false);
                  void submit({ optIn: false });
                }}
              >
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : dict.npsAskNo}
              </button>
            </div>
          </>
        );
    }
  }

  // Focus the first field of a step once it has appeared (keyboard users keep going without the mouse).
  const focusFirst = useCallback((el: HTMLDivElement | null) => {
    if (!el || !focusNext.current) return;
    focusNext.current = false;
    const target = el.querySelector<HTMLElement>(
      'button[data-autofocus], input:not([type=checkbox]):not([type=file]):not([tabindex="-1"]), textarea, [role=radio][tabindex="0"], [role=checkbox]',
    );
    target?.focus({ preventScroll: true });
  }, []);
  const slide = dir === "rtl" ? -direction : direction;

  const errorLine = (
    <AnimatePresence>
      {error && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="text-[14px] text-danger"
        >
          {error.message}
        </motion.p>
      )}
    </AnimatePresence>
  );

  const sendLabel = busy ? (
    <>
      <Loader2 className="size-[18px] animate-spin" /> <span className="tabular-nums">{busy}</span>
    </>
  ) : stepped && !last ? (
    dict.next
  ) : (
    dict.send
  );

  const honeypot = (
    // Honeypot: hidden from people and screen readers; bots fill it in.
    <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} name="website" />
      </label>
    </div>
  );

  const shareUrl = space.website || space.wallUrl || "";
  const shareText = t(dict, "shareText", { space: space.name });
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}${shareUrl ? `&url=${encodeURIComponent(shareUrl)}` : ""}`;
  const inHref = shareUrl ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}` : null;
  const thanks = form.thanks;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showDone ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SOFT}
          className="flex flex-col items-center py-16 text-center"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
            className="grid size-14 place-items-center rounded-full bg-accent text-on-accent"
          >
            <Check className="size-7" strokeWidth={2.4} />
          </motion.div>
          <h1 className="mt-6 font-display text-[28px] leading-tight font-medium [overflow-wrap:anywhere]">
            {thanks.title || dict.thanksTitle}
          </h1>
          <p className="mt-2 max-w-[340px] text-[16px] [overflow-wrap:anywhere] whitespace-pre-line text-muted">
            {thanks.text || (showDone.testimonial ? t(dict, "thanksText", { space: space.name }) : dict.feedbackText)}
          </p>
          {shownReward && <RewardBlock reward={shownReward} spaceId={space.id} dict={dict} preview={preview} />}
          {thanks.buttonLabel && thanks.buttonUrl && (
            <a href={thanks.buttonUrl} rel="noopener nofollow" className={cn(primaryButton, "mt-8 h-11 text-[15px]")}>
              {thanks.buttonLabel}
            </a>
          )}
          {showDone.testimonial && (
            <div className={cn("flex flex-wrap justify-center gap-2.5", thanks.buttonLabel && thanks.buttonUrl ? "mt-4" : "mt-8")}>
              <a href={xHref} target="_blank" rel="noopener noreferrer" className={cn(secondaryButton, "h-11 gap-2.5")}>
                <svg viewBox="0 0 24 24" className="size-[16px]" fill="currentColor" aria-hidden>
                  <path d={X_GLYPH} />
                </svg>
                {dict.shareX}
              </a>
              {inHref && (
                <a href={inHref} target="_blank" rel="noopener noreferrer" className={cn(secondaryButton, "h-11 gap-2.5")}>
                  <svg viewBox="0 0 24 24" className="size-[16px]" fill="currentColor" aria-hidden>
                    <path d={IN_GLYPH} />
                  </svg>
                  {dict.shareLinkedIn}
                </a>
              )}
            </div>
          )}
          {space.website && (
            <a
              href={space.website}
              rel="noopener nofollow"
              className="mt-4 flex h-10 items-center text-[15px] text-muted transition-colors hover:text-ink"
            >
              {t(dict, "backTo", { space: space.name })}
            </a>
          )}
        </motion.div>
      ) : (
        <motion.form
          key="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              next();
            }
          }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="pb-6"
        >
          {stepped ? (
            <>
              <div
                role="progressbar"
                aria-label={t(dict, "stepOf", { n: index + 1, total })}
                aria-valuemin={1}
                aria-valuemax={total}
                aria-valuenow={index + 1}
                className="mb-8 h-[2px] overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full bg-ink transition-[width] duration-500 ease-out"
                  style={{ width: `${((index + 1) / total) * 100}%` }}
                />
              </div>
              {header(index === 0)}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stepKey(step)}
                  ref={focusFirst}
                  initial={{ opacity: 0, x: 14 * slide }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 * slide }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                >
                  {stepBody(step)}
                </motion.div>
              </AnimatePresence>
              {honeypot}
              <div className="mt-6 space-y-4">
                {errorLine}
                <div className="flex gap-2.5">
                  {index > 0 && (
                    <button type="button" onClick={() => go(index - 1)} className={secondaryButton} disabled={Boolean(busy)}>
                      {dict.back}
                    </button>
                  )}
                  {step.kind !== "ask" && (
                    <button type="submit" disabled={Boolean(busy)} className={cn(primaryButton, "flex-1")}>
                      {sendLabel}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {header(true)}
              {title1(form.title || fallbackTitle, { sub: form.prompt, hints: form.hints })}
              <div className={form.questions.length ? "space-y-7" : "space-y-5"}>
                {steps.map((s) =>
                  s.kind === "experience" ? (
                    <div key="experience">{experience}</div>
                  ) : s.kind === "question" ? (
                    questionBlock(s.id, true)
                  ) : s.kind === "about" ? (
                    <div key="about">{about}</div>
                  ) : null,
                )}
              </div>
              {honeypot}
              <div className="mt-5 space-y-5">
                {errorLine}
                <button type="submit" disabled={Boolean(busy)} className={cn(primaryButton, "w-full")}>
                  {sendLabel}
                </button>
              </div>
            </>
          )}
        </motion.form>
      )}
    </AnimatePresence>
  );
}
