"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listTranslations, translate } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import type { Translation } from "@/lib/ai/translate";
import { LANGUAGES } from "@/lib/i18n/collect/languages";
import { TranslationList } from "./translation-list";

// A testimonial in another language. Translations are kept; widgets set to that language show the approved ones.
export function TranslateSheet({
  spaceId,
  testimonial,
  onOpenChange,
}: {
  spaceId: string;
  testimonial: { id: string; name: string } | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [lang, setLang] = useState<string>("es");
  const [list, setList] = useState<Translation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  if ((testimonial?.id ?? null) !== seen) {
    setSeen(testimonial?.id ?? null);
    setList(null);
  }

  useEffect(() => {
    if (!testimonial) return;
    let live = true;
    void listTranslations(spaceId, testimonial.id).then((res) => {
      if (!live) return;
      if (!res.ok) toast.error(res.error);
      setList(res.ok ? res.data : []);
    });
    return () => {
      live = false;
    };
  }, [spaceId, testimonial]);

  async function run() {
    if (!testimonial || busy) return;
    setBusy(true);
    const res = await translate(spaceId, testimonial.id, lang);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setList((l) => [res.data, ...(l ?? []).filter((x) => x.lang !== res.data.lang)]);
  }

  return (
    <Sheet open={testimonial !== null} onOpenChange={onOpenChange} title="Translate">
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Language"
            className="min-w-0 flex-1"
            value={lang}
            onChange={setLang}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          />
          <Button onClick={() => void run()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Translate
          </Button>
        </div>
        {list === null || !testimonial ? (
          <div className="h-16 animate-pulse rounded-[10px] bg-surface-2" aria-busy />
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-[13.5px] text-muted">No translations yet</p>
        ) : (
          <TranslationList spaceId={spaceId} testimonialId={testimonial.id} list={list} onChange={setList} />
        )}
      </div>
    </Sheet>
  );
}
