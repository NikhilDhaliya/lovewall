"use client";

import { ChevronLeft, ExternalLink } from "lucide-react";
import { Link } from "@/components/app/link";
import { useMemo, useState } from "react";
import { CaseStudyCard } from "@/components/ai/case-study-card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Segmented } from "@/components/ui/segmented";
import { type CaseStudyDraft } from "@/lib/case-study";
import { cn } from "@/lib/cn";
import type { NpsResponse } from "@/lib/data/forms";
import { npsGroup, npsScore, type NpsGroup } from "@/lib/forms";
import { PAGE } from "@/lib/layout";
import { formatDate } from "@/lib/widget/render";
import { TabLinks } from "./tabs";

function Header({
  spaceId,
  formId,
  name,
  url,
  kind,
}: {
  spaceId: string;
  formId: string;
  name: string;
  url: string;
  kind: "nps" | "case_study";
}) {
  return (
    <>
      <h1 className="sr-only">{name}</h1>
      <div className="sticky top-14 z-20 bar md:top-0">
        <div className={cn(PAGE, "flex h-14 items-center gap-2")}>
          <Link
            href={`/app/${spaceId}/collect`}
            className="flex h-9 items-center gap-0.5 rounded-lg pr-2 text-[14px] font-medium text-muted transition-colors hover:text-ink"
            aria-label="Back to forms"
          >
            <ChevronLeft className="size-5" /> <span className="max-sm:hidden">Collect</span>
          </Link>
          <span className="min-w-0 flex-1 truncate px-2 font-display text-[16px] font-medium">{name}</span>
          <Button variant="secondary" size="icon" asChild>
            <a href={url} target="_blank" rel="noopener" aria-label="Open form">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>
      <div className={cn(PAGE, "pt-2")}>
        <TabLinks
          className="mb-6 max-w-[760px]"
          tabs={[
            { href: `/app/${spaceId}/collect/${formId}`, label: "Edit", exact: true },
            { href: `/app/${spaceId}/collect/${formId}/results`, label: kind === "nps" ? "Results" : "Case studies" },
          ]}
        />
      </div>
    </>
  );
}

function Empty({ title, url }: { title: string; url: string }) {
  return (
    <div className="flex animate-view flex-col items-center rounded-[12px] py-16 text-center ring-1 ring-line">
      <h2 className="font-display text-[17px] font-medium">{title}</h2>
      <CopyButton
        text={url}
        label="Copy link"
        toastLabel="Link copied"
        className="mt-4 h-9 rounded-[8px] bg-surface px-3.5 text-[14px] ring-1 ring-line ring-inset hover:bg-surface-2"
      />
    </div>
  );
}

const GROUP_LABEL: Record<NpsGroup, string> = { promoter: "Promoters", passive: "Passives", detractor: "Detractors" };

export function NpsResults({
  spaceId,
  formId,
  name,
  url,
  responses,
}: {
  spaceId: string;
  formId: string;
  name: string;
  url: string;
  responses: NpsResponse[];
}) {
  const groups = useMemo(() => {
    const g: Record<NpsGroup, NpsResponse[]> = { promoter: [], passive: [], detractor: [] };
    for (const r of responses) g[npsGroup(r.score)].push(r);
    return g;
  }, [responses]);
  const [tab, setTab] = useState<NpsGroup>(groups.detractor.length ? "detractor" : groups.promoter.length ? "promoter" : "passive");
  const counts = { promoters: groups.promoter.length, passives: groups.passive.length, detractors: groups.detractor.length };
  const score = npsScore(counts);
  const total = responses.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const list = groups[tab];

  return (
    <div className="pb-24">
      <Header spaceId={spaceId} formId={formId} name={name} url={url} kind="nps" />
      <div className={PAGE}>
        <div className="max-w-[760px]">
          {total === 0 ? (
            <Empty title="No answers yet" url={url} />
          ) : (
            <>
              <section className="rounded-[12px] bg-surface p-5 ring-1 ring-line md:p-6" aria-label="NPS">
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
                  <div>
                    <div className="text-[13px] text-muted">NPS</div>
                    <div className="font-display text-[44px] leading-none font-medium tabular-nums" data-testid="nps-score">
                      {score! > 0 ? `+${score}` : score}
                    </div>
                    <div className="mt-2 text-[13px] text-muted tabular-nums">{total === 1 ? "1 answer" : `${total} answers`}</div>
                  </div>
                  <dl className="grid grid-cols-3 gap-6 sm:gap-10">
                    {(["promoter", "passive", "detractor"] as const).map((g) => (
                      <div key={g}>
                        <dt className="text-[13px] text-muted">{GROUP_LABEL[g]}</dt>
                        <dd className="text-[20px] font-medium tabular-nums" data-testid={`nps-${g}`}>
                          {groups[g].length}
                          <span className="ml-1.5 text-[13px] font-normal text-faint">{pct(groups[g].length)}%</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="mt-5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {counts.promoters > 0 && <div className="bg-ink" style={{ width: `${pct(counts.promoters)}%` }} />}
                  {counts.passives > 0 && <div className="bg-ink/45" style={{ width: `${pct(counts.passives)}%` }} />}
                  {counts.detractors > 0 && <div className="bg-ink/20" style={{ width: `${pct(counts.detractors)}%` }} />}
                </div>
              </section>

              <Segmented
                variant="tabs"
                label="Group"
                value={tab}
                onChange={setTab}
                className="mt-8 shadow-[inset_0_-1px_0_var(--line)]"
                options={(["promoter", "passive", "detractor"] as const).map((g) => ({
                  value: g,
                  label: (
                    <span className="flex items-center gap-1.5">
                      {GROUP_LABEL[g]} <span className="text-[11px] text-faint tabular-nums">{groups[g].length}</span>
                    </span>
                  ),
                }))}
              />
              {list.length === 0 ? (
                <p className="py-12 text-center text-[15px] text-muted">None yet</p>
              ) : (
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
                  {list.map((r) => (
                    <li key={r.id} className="flex gap-3.5 px-4 py-4 md:px-5" data-testid="nps-response">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] text-[15px] font-medium tabular-nums ring-1 ring-line ring-inset">
                        {r.score}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[15px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line",
                            !r.comment && "text-faint",
                          )}
                        >
                          {r.comment || "No comment"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                          {r.name && <span>{r.name}</span>}
                          {r.email && <span className="truncate">{r.email}</span>}
                          <time dateTime={r.date}>{formatDate(r.date)}</time>
                          {r.testimonialId && (
                            <Link href={`/app/${spaceId}`} className="font-medium text-ink underline-offset-2 hover:underline">
                              Wrote a testimonial
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CaseStudies({
  spaceId,
  formId,
  name,
  url,
  studies,
  ai = false,
}: {
  spaceId: string;
  formId: string;
  name: string;
  url: string;
  // written: the AI-written draft (when AI is on and one was made).
  studies: { id: string; date: string; draft: CaseStudyDraft; written?: CaseStudyDraft | null }[];
  ai?: boolean;
}) {
  return (
    <div className="pb-24">
      <Header spaceId={spaceId} formId={formId} name={name} url={url} kind="case_study" />
      <div className={PAGE}>
        <div className="max-w-[760px] space-y-6">
          {studies.length === 0 ? (
            <Empty title="No case studies yet" url={url} />
          ) : (
            studies.map(({ id, date, draft, written }) => (
              <CaseStudyCard key={id} spaceId={spaceId} id={id} date={date} original={draft} written={written ?? null} ai={ai} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
