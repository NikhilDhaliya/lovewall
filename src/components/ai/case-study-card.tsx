"use client";

import { Loader2, MoreHorizontal, PenLine, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { discardCaseStudy, saveCaseStudy, writeCaseStudy } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy";
import { inputClass, textareaClass } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { caseStudyMarkdown, type CaseStudyDraft } from "@/lib/case-study";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/widget/render";

type View = "written" | "original";

// One case study: the visitor's answers as a story. With AI on, "Write" turns them into a readable draft the owner
// can edit; the original stays one tab away, and Markdown copies whichever is shown.
export function CaseStudyCard({
  spaceId,
  id,
  date,
  original,
  written: initial,
  ai,
}: {
  spaceId: string;
  id: string;
  date: string;
  original: CaseStudyDraft;
  written: CaseStudyDraft | null;
  ai: boolean;
}) {
  const [written, setWritten] = useState(initial);
  const [view, setView] = useState<View>(initial ? "written" : "original");
  const [busy, setBusy] = useState<"write" | "save" | null>(null);
  const [edit, setEdit] = useState<CaseStudyDraft | null>(null);
  const draft = view === "written" && written ? written : original;
  const role = [draft.person.title, draft.person.company].filter(Boolean).join(", ");

  async function write() {
    if (busy) return;
    if (
      written &&
      !(await confirmAction({ title: "Write it again?", message: "Your edits to this draft are replaced.", confirmLabel: "Write" }))
    )
      return;
    setBusy("write");
    const res = await writeCaseStudy(spaceId, id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setWritten(res.data);
    setView("written");
    setEdit(null);
  }

  async function save() {
    if (!edit || busy) return;
    setBusy("save");
    const res = await saveCaseStudy(spaceId, id, edit);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setWritten(res.data);
    setEdit(null);
    toast.success("Saved");
  }

  async function discard() {
    if (
      !(await confirmAction({
        title: "Discard this draft?",
        message: "The original answers stay.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return;
    const res = await discardCaseStudy(spaceId, id);
    if (!res.ok) return toast.error(res.error);
    setWritten(null);
    setView("original");
    setEdit(null);
  }

  const markdown = caseStudyMarkdown(draft);

  return (
    <article
      id={id}
      className="scroll-mt-24 rounded-[12px] bg-surface ring-1 ring-line"
      data-testid="case-study"
      aria-busy={busy === "write"}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-5 md:px-7 md:pt-7">
        <div className="min-w-0">
          {edit ? (
            <input
              aria-label="Title"
              value={edit.title}
              maxLength={160}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              className={cn(inputClass, "font-display text-[18px] font-medium md:text-[18px]")}
            />
          ) : (
            <h2 className="font-display text-[20px] leading-snug font-medium [overflow-wrap:anywhere]">{draft.title}</h2>
          )}
          <p className="mt-1 text-[14px] text-muted">
            {draft.person.name}
            {role && `, ${role}`} ·{" "}
            <time dateTime={date} className="whitespace-nowrap">
              {formatDate(date)}
            </time>
          </p>
        </div>
        {!edit && (
          <div className="flex shrink-0 items-center gap-1.5">
            {ai && !written && (
              <Button variant="secondary" size="sm" className="h-9" onClick={() => void write()} disabled={busy !== null}>
                {busy === "write" ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
                {busy === "write" ? "Writing" : "Write"}
              </Button>
            )}
            <CopyButton
              text={markdown}
              label="Copy as Markdown"
              toastLabel="Markdown copied"
              className="h-9 shrink-0 rounded-[8px] bg-surface px-3 text-[13px] ring-1 ring-line ring-inset hover:bg-surface-2 max-sm:w-9 max-sm:px-0 max-sm:[&>span:last-child]:sr-only"
            />
            {ai && written && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-9 text-muted" aria-label="Draft options">
                    <MoreHorizontal className="size-[18px]" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => (setView("written"), setEdit(written))}>
                    <PenLine /> Edit
                  </MenuItem>
                  <MenuItem onSelect={() => void write()}>
                    <RefreshCw /> Write again
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem destructive onSelect={() => void discard()}>
                    <Trash2 /> Discard draft
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </div>
        )}
      </header>
      {written && !edit && (
        <div className="px-5 pt-3 md:px-7">
          <Segmented
            variant="tabs"
            size="sm"
            label="Version"
            value={view}
            onChange={setView}
            options={[
              { value: "written", label: "Written" },
              { value: "original", label: "Their words" },
            ]}
          />
        </div>
      )}
      {edit ? (
        <div className="space-y-4 px-5 pt-5 pb-6 md:px-7 md:pb-7">
          <label className="block">
            <span className="text-[13px] font-medium text-muted">Key result</span>
            <input
              value={edit.metric ?? ""}
              maxLength={200}
              onChange={(e) => setEdit({ ...edit, metric: e.target.value })}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          {edit.sections.map((s, i) => (
            <label key={s.id} className="block">
              <span className="text-[13px] font-medium text-muted">{s.heading}</span>
              <textarea
                value={s.body}
                rows={4}
                maxLength={4000}
                onChange={(e) =>
                  setEdit({ ...edit, sections: edit.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })
                }
                className={cn(textareaClass, "mt-1 min-h-[96px] resize-y")}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy !== null}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn("transition-opacity", busy === "write" && "opacity-50")}>
          {draft.metric && (
            <p className="mx-5 mt-5 border-s-2 border-ink ps-3 text-[17px] font-medium [overflow-wrap:anywhere] md:mx-7">{draft.metric}</p>
          )}
          <div className="space-y-5 px-5 pt-5 pb-6 md:px-7 md:pb-7">
            {draft.sections.map((s) => (
              <section key={s.id}>
                <h3 className="text-[13px] font-medium text-muted">{s.heading}</h3>
                <p className="mt-1 text-[15px] leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-line">{s.body}</p>
              </section>
            ))}
            {draft.quote && (
              <blockquote className="border-t border-line pt-5 text-[16px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line">
                “{draft.quote}”
              </blockquote>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
