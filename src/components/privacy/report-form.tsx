"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { submitReport, type ReportInput } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { inputClass, textareaClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const REASONS = [
  { value: "me", label: "It’s about me, remove it" },
  { value: "false", label: "False or misleading" },
  { value: "offensive", label: "Offensive" },
  { value: "other", label: "Something else" },
] as const;

type Item = { id: string; name: string; text: string };

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 px-4 py-3 text-[15px] transition-colors hover:bg-surface-2 md:text-[14px]",
        checked && "bg-surface-2",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function ReportForm({
  widgetId,
  space,
  items,
  initial,
  privacyUrl,
}: {
  widgetId: string;
  space: string;
  items: Item[];
  initial: string | null;
  privacyUrl: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(initial);
  const [reason, setReason] = useState<ReportInput["reason"] | null>(null);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const chosen = items.find((i) => i.id === picked);

  if (done) {
    return (
      <div className="pt-16 text-center" role="status">
        <h1 className="font-display text-[22px] font-medium">Thanks</h1>
        <p className="mt-1.5 text-[15px] text-muted">{space} will look at it.</p>
      </div>
    );
  }

  return (
    <form
      className="animate-view"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!picked) return setError("Pick the testimonial");
        if (!reason) return setError("Pick a reason");
        setBusy(true);
        setError(null);
        const res = await submitReport(widgetId, { testimonialId: picked, reason, details, email, website: honey });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setDone(true);
      }}
    >
      <p className="text-[14px] text-muted">{space}</p>
      <h1 className="mt-1 font-display text-[26px] leading-tight font-medium">Report a testimonial</h1>

      {items.length === 0 ? (
        <p className="mt-8 text-[15px] text-muted">Nothing to report here.</p>
      ) : (
        <>
          <fieldset className="mt-8">
            <legend className="mb-2 text-[13px] font-medium text-muted">Testimonial</legend>
            {chosen && initial ? (
              <div className="rounded-[12px] bg-surface px-4 py-3 ring-1 ring-line">
                <div className="text-[14px] font-medium">{chosen.name}</div>
                {chosen.text && <p className="mt-0.5 line-clamp-3 text-[14px] text-muted">{chosen.text}</p>}
              </div>
            ) : (
              <div className="max-h-[300px] divide-y divide-line overflow-y-auto rounded-[12px] bg-surface ring-1 ring-line">
                {items.map((i) => (
                  <Choice key={i.id} name="testimonial" checked={picked === i.id} onChange={() => setPicked(i.id)}>
                    <span className="block font-medium">{i.name}</span>
                    {i.text && <span className="line-clamp-2 text-muted">{i.text}</span>}
                  </Choice>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="mt-6">
            <legend className="mb-2 text-[13px] font-medium text-muted">Reason</legend>
            <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
              {REASONS.map((r) => (
                <Choice key={r.value} name="reason" checked={reason === r.value} onChange={() => setReason(r.value)}>
                  {r.label}
                </Choice>
              ))}
            </div>
          </fieldset>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">Details (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={2000} className={textareaClass} />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">Your email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
              className={inputClass}
            />
          </label>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <p role="alert" className="mt-4 min-h-5 text-[14px] text-danger">
            {error}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button type="submit" size="lg" disabled={busy} className="max-sm:flex-1">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send report
            </Button>
            {privacyUrl && (
              <a href={privacyUrl} className="text-[13px] text-muted transition-colors hover:text-ink">
                Privacy
              </a>
            )}
          </div>
        </>
      )}
    </form>
  );
}
