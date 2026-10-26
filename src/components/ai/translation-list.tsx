"use client";

import { useState } from "react";
import { toast } from "sonner";
import { reviewTranslation } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import type { Translation } from "@/lib/ai/translate";
import { LANGUAGES } from "@/lib/i18n/collect/languages";

const NAMES = new Map<string, string>(LANGUAGES.map((l) => [l.code, l.name]));

// A testimonial's translations. They are machine-made, so widgets and the public API show one only after a member
// approves it here; Discard drops it.
export function TranslationList({
  spaceId,
  testimonialId,
  list,
  onChange,
}: {
  spaceId: string;
  testimonialId: string;
  list: Translation[];
  onChange: (list: Translation[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function review(lang: string, verdict: "approve" | "discard") {
    if (busy) return;
    setBusy(lang);
    const res = await reviewTranslation(spaceId, testimonialId, lang, verdict);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    onChange(
      verdict === "approve" ? list.map((t) => (t.lang === lang ? { ...t, approved: true } : t)) : list.filter((t) => t.lang !== lang),
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" data-testid="translations">
      {list.map((t) => {
        const name = NAMES.get(t.lang) ?? t.lang;
        return (
          <li key={t.lang} className="px-4 py-3" data-lang={t.lang}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-muted">{name}</span>
              <div className="flex items-center gap-1">
                {t.approved ? (
                  <span className="px-2 text-[13px] text-muted">Approved</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Approve ${name}`}
                    disabled={busy !== null}
                    onClick={() => void review(t.lang, "approve")}
                  >
                    Approve
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted"
                  aria-label={`Discard ${name}`}
                  disabled={busy !== null}
                  onClick={() => void review(t.lang, "discard")}
                >
                  Discard
                </Button>
                <CopyButton
                  text={t.text}
                  iconOnly
                  label={`Copy ${name}`}
                  toastLabel="Copied"
                  className="size-8 rounded-[8px] text-muted hover:bg-surface-2 hover:text-ink"
                />
              </div>
            </div>
            <p lang={t.lang} className="mt-1 text-[14.5px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line">
              {t.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
