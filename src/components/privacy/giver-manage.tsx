"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { deleteMyTestimonial, updateMyTestimonial } from "@/app/actions/giver";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { inputClass, textareaClass } from "@/components/ui/field";
import { StarInput } from "@/components/ui/stars";
import type { CollectDict } from "@/lib/i18n/collect/en";
import type { Status } from "@/lib/types";

type Draft = { name: string; title: string; company: string; text: string; rating: number | null };

const fill = (s: string, space: string) => s.replace("{space}", space);

// A giver's own testimonial: the fields they wrote, editable, and a delete button. Texts come in the form's language.
type View = {
  title: string;
  space: string;
  logo: string | null;
  initial: Draft & { status: Status; video: boolean; photo: string | null };
  consent: { text: string; date: string } | null;
};

export function GiverManage({
  token,
  dict,
  privacyUrl,
  view,
}: {
  token: string;
  dict: CollectDict;
  privacyUrl: string | null;
  view: View | null;
}) {
  const [deleted, setDeleted] = useState(false);
  if (deleted || !view) {
    return (
      <h1 className="pt-16 text-center font-display text-[22px] leading-snug font-medium text-balance" role="status">
        {deleted ? dict.manageDeleted : dict.manageExpired}
      </h1>
    );
  }
  return <Manage token={token} dict={dict} privacyUrl={privacyUrl} {...view} onDeleted={() => setDeleted(true)} />;
}

function Manage({
  token,
  dict,
  title,
  space,
  logo,
  privacyUrl,
  initial,
  consent,
  onDeleted,
}: View & { token: string; dict: CollectDict; privacyUrl: string | null; onDeleted: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Draft>(initial);
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setMessage(null);
  };

  const statusLabel =
    status === "approved" ? dict.manageStatusApproved : status === "hidden" ? dict.manageStatusHidden : dict.manageStatusNew;

  return (
    <div className="animate-view">
      <div className="flex items-center gap-3">
        {logo && <img src={logo} alt="" className="size-10 rounded-[10px] object-cover ring-1 ring-line" />}
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-snug font-medium text-balance [overflow-wrap:anywhere]">{title}</h1>
          <p className="text-[14px] text-muted" data-testid="giver-status">
            {statusLabel}
          </p>
        </div>
      </div>

      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty || busy) return;
          setBusy("save");
          const res = await updateMyTestimonial(token, {
            name: draft.name,
            title: draft.title,
            company: draft.company,
            text: draft.text,
            rating: draft.rating,
          });
          setBusy(null);
          if (!res.ok) return setMessage({ text: res.error, error: true });
          setSaved(draft);
          setStatus(res.data.status);
          setMessage({ text: fill(dict.manageSaved, space) });
        }}
      >
        <div>
          <span className="mb-2 block text-[13px] font-medium text-muted" id="giver-rating">
            {dict.rating}
          </span>
          <StarInput value={draft.rating} onChange={(v) => set("rating", v)} size={28} label={dict.rating} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">{dict.yourTestimonial}</span>
          <textarea value={draft.text} onChange={(e) => set("text", e.target.value)} rows={6} maxLength={3000} className={textareaClass} />
        </label>
        {initial.video && <p className="text-[13px] text-muted">{dict.manageVideoNote}</p>}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">{dict.yourName}</span>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">{dict.jobTitle}</span>
            <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={80} className={inputClass} />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">{dict.company}</span>
            <input value={draft.company} onChange={(e) => set("company", e.target.value)} maxLength={80} className={inputClass} />
          </label>
        </div>
        <p className="text-[13px] text-muted">{fill(dict.manageReview, space)}</p>
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" size="lg" disabled={!dirty || busy !== null} className="max-sm:flex-1">
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}
            {busy === "save" ? dict.manageSaving : dict.manageSave}
          </Button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className={message?.error ? "text-[14px] text-danger" : "text-[14px] text-muted"}
          data-testid="giver-message"
        >
          {message?.text}
        </p>
      </form>

      {consent && (
        <div className="mt-10 border-t border-line pt-6 text-[13px] leading-relaxed text-muted">
          <p>{dict.manageConsent.replace("{date}", consent.date)}</p>
          <p className="mt-1 text-ink">“{consent.text}”</p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <Button
          variant="danger"
          disabled={busy !== null}
          onClick={async () => {
            const sure = await confirmAction({
              title: dict.manageDelete,
              message: dict.manageDeleteConfirm,
              confirmLabel: dict.manageDelete,
              cancelLabel: dict.manageDeleteCancel,
              destructive: true,
            });
            if (!sure) return;
            setBusy("delete");
            const res = await deleteMyTestimonial(token);
            setBusy(null);
            if (!res.ok) return setMessage({ text: res.error, error: true });
            onDeleted();
          }}
        >
          {busy === "delete" && <Loader2 className="size-4 animate-spin" />}
          {dict.manageDelete}
        </Button>
        {privacyUrl && (
          <a href={privacyUrl} className="text-[13px] text-muted transition-colors hover:text-ink">
            {dict.privacy}
          </a>
        )}
      </div>
    </div>
  );
}
