"use client";

import { ChevronRight, Loader2, Plus } from "lucide-react";
import { Link } from "@/components/app/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createForm } from "@/app/actions/forms";
import { FormFromSite } from "@/components/ai/form-from-site";
import { Page, PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Sheet } from "@/components/ui/sheet";
import type { FormListItem } from "@/lib/data/forms";
import { FORM_KINDS, KIND_LABEL, type FormKind } from "@/lib/forms";
import { CollectTabs } from "./tabs";

const KIND_NOTE: Record<FormKind, string> = {
  testimonial: "Text, video and questions",
  nps: "0 to 10, then a testimonial from promoters",
  case_study: "Challenge, solution, results",
};

export function NewFormSheet({
  spaceId,
  open,
  onOpenChange,
  ai = false,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // AI: start from the owner's website.
  ai?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<FormKind | null>(null);
  const [fromSite, setFromSite] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Each time it opens, it starts at the list (reset on open, so closing doesn't flash the list).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFromSite(false);
  }
  async function pick(kind: FormKind) {
    setBusy(kind);
    const res = await createForm(spaceId, kind);
    if (!res.ok) {
      setBusy(null);
      return toast.error(res.error);
    }
    router.push(`/app/${spaceId}/collect/${res.data.id}`);
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={fromSite ? "From your website" : "New form"}
      onBack={fromSite ? () => setFromSite(false) : undefined}
    >
      {fromSite ? (
        <FormFromSite spaceId={spaceId} onCreated={(id) => router.push(`/app/${spaceId}/collect/${id}`)} />
      ) : (
        <div className="p-5">
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line">
            {FORM_KINDS.map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void pick(kind)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{KIND_LABEL[kind]}</span>
                    <span className="block text-[13px] text-muted">{KIND_NOTE[kind]}</span>
                  </span>
                  {busy === kind ? <Loader2 className="size-4 animate-spin text-muted" /> : <ChevronRight className="size-4 text-faint" />}
                </button>
              </li>
            ))}
            {ai && (
              <li>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setFromSite(true)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">From your website</span>
                    <span className="block text-[13px] text-muted">Headline and questions from your site</span>
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

export function FormsList({
  spaceId,
  spaceSlug,
  appUrl,
  forms,
  ai = false,
}: {
  spaceId: string;
  spaceSlug: string;
  appUrl: string;
  forms: FormListItem[];
  ai?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const linkOf = (f: FormListItem) => `${appUrl}/${spaceSlug}${f.isDefault ? "" : `/${f.slug}`}`;
  return (
    <div className="pb-24">
      <PageHeader title="Collect" width="max-w-[880px]">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" strokeWidth={2.5} /> New form
        </Button>
      </PageHeader>
      <Page width="max-w-[880px]">
        <CollectTabs spaceId={spaceId} />
        <ul className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
          {forms.map((f) => {
            const url = linkOf(f);
            return (
              <li key={f.id} className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60 md:px-5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/${spaceId}/collect/${f.id}`}
                    className="text-[15px] font-medium after:absolute after:inset-0 after:content-['']"
                  >
                    {f.name}
                  </Link>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                    <span className="shrink-0">{KIND_LABEL[f.kind]}</span>
                    <span aria-hidden>·</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="relative z-10 truncate hover:text-ink"
                      data-testid={f.isDefault ? "collect-link" : undefined}
                    >
                      {url.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                </div>
                <dl className="hidden shrink-0 grid-cols-2 gap-x-6 text-right sm:grid">
                  <div>
                    <dt className="text-[12px] text-muted">Views</dt>
                    <dd className="text-[15px] font-medium tabular-nums" data-testid="form-views">
                      {f.views}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-muted">Responses</dt>
                    <dd className="text-[15px] font-medium tabular-nums" data-testid="form-responses">
                      {f.responses}
                    </dd>
                  </div>
                </dl>
                <span className="text-[13px] text-muted tabular-nums sm:hidden" aria-label={`${f.views} views, ${f.responses} responses`}>
                  {f.views} · {f.responses}
                </span>
                <CopyButton
                  text={url}
                  iconOnly
                  label={`Copy link to ${f.name}`}
                  toastLabel="Link copied"
                  className="relative z-10 size-9 rounded-[8px] text-muted hover:bg-surface-3/60 hover:text-ink"
                />
              </li>
            );
          })}
        </ul>
      </Page>
      <NewFormSheet spaceId={spaceId} open={creating} onOpenChange={setCreating} ai={ai} />
    </div>
  );
}
