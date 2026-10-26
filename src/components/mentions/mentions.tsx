"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, RefreshCw, Undo2, X } from "lucide-react";
import { Link } from "@/components/app/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  checkMentionsNow,
  loadMentions,
  saveMention,
  saveMentionSettings,
  setMentionStatus,
  type MentionsState,
} from "@/app/actions/mentions";
import { Group, GroupRow } from "@/components/app/grouped";
import { Page, PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { SourceIcon } from "@/components/ui/source-icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { Mention } from "@/lib/data/mentions";
import { formatDate } from "@/lib/widget/render";

type Status = Mention["status"];

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (Math.abs(s) < 60) return "just now";
  if (Math.abs(s) < 3600) return RELATIVE.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 86400) return RELATIVE.format(Math.round(s / 3600), "hour");
  return RELATIVE.format(Math.round(s / 86400), "day");
}

// Mentions of the space's keywords on Hacker News, checked by the cron: save the good ones as
// testimonials, dismiss the rest. A daily email lists new ones (switch).
export function Mentions({ spaceId, initial }: { spaceId: string; initial: MentionsState }) {
  const [settings, setSettings] = useState(initial.settings);
  const [items, setItems] = useState(initial.items);
  const [counts, setCounts] = useState(initial.counts);
  const [view, setView] = useState<Status>("new");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0);

  function apply(s: MentionsState) {
    setSettings(s.settings);
    setItems(s.items);
    setCounts(s.counts);
  }

  async function show(status: Status) {
    setView(status);
    setLoading(true);
    const id = ++request.current;
    const res = await loadMentions(spaceId, status);
    if (id !== request.current) return;
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    apply(res.data);
  }

  async function saveKeywords(keywords: string[]) {
    setChecking(true);
    const res = await saveMentionSettings(spaceId, { keywords }, view);
    setChecking(false);
    if (!res.ok) return toast.error(res.error) && false;
    apply(res.data);
    return true;
  }

  async function addKeyword(e?: React.FormEvent) {
    e?.preventDefault();
    const k = keyword.trim();
    if (!k) return;
    if (settings.keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return setKeyword("");
    if (settings.keywords.length >= 5) return toast.error("Up to 5 keywords");
    if (await saveKeywords([...settings.keywords, k])) setKeyword("");
  }

  async function checkNow() {
    setChecking(true);
    const res = await checkMentionsNow(spaceId, view);
    setChecking(false);
    if (!res.ok) return toast.error(res.error);
    const added = res.data.counts.new - counts.new;
    apply(res.data);
    toast.success(added > 0 ? `${added} new` : "Nothing new");
  }

  // Moves a row out of this tab at once; the server catches up (and puts it back on failure).
  async function move(m: Mention, to: Status, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(m.id);
    const res = await action();
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "Something went wrong");
    setItems((list) => list.filter((x) => x.id !== m.id));
    setCounts((c) => ({ ...c, [m.status]: c[m.status] - 1, [to]: c[to] + 1 }));
  }

  const tabs = useMemo(
    () =>
      (["new", "saved", "dismissed"] as const).map((s) => ({
        value: s,
        label: (
          <span className="flex items-center gap-1.5">
            {s === "new" ? "New" : s === "saved" ? "Saved" : "Dismissed"}
            <span className="text-[11px] text-faint tabular-nums">{counts[s]}</span>
          </span>
        ),
      })),
    [counts],
  );

  const status = settings.lastError
    ? settings.lastError
    : settings.checkedAt
      ? `Checked ${ago(settings.checkedAt)}`
      : settings.keywords.length
        ? "First check soon"
        : "Hacker News";

  return (
    <div className="pb-28">
      <PageHeader title="Mentions" width="max-w-[880px]">
        {settings.keywords.length > 0 && (
          <Button variant="secondary" onClick={() => void checkNow()} disabled={checking} aria-label="Check now">
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="max-sm:hidden">Check now</span>
          </Button>
        )}
      </PageHeader>
      <Page width="max-w-[880px]">
        <Group>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="mention-keyword" className="text-[14.5px]">
                Keywords
              </label>
              <span className={cn("truncate text-[12.5px]", settings.lastError ? "text-danger" : "text-muted")} aria-live="polite">
                {checking ? "Checking…" : status}
              </span>
            </div>
            <form onSubmit={addKeyword} className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {settings.keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex h-8 items-center gap-1 rounded-[6px] pr-1 pl-2.5 text-[13.5px] ring-1 ring-line ring-inset"
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => void saveKeywords(settings.keywords.filter((x) => x !== k))}
                    className="grid size-6 place-items-center rounded-[5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    aria-label={`Remove ${k}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {settings.keywords.length < 5 && (
                <input
                  id="mention-keyword"
                  value={keyword}
                  maxLength={60}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={settings.keywords.length ? "Add another" : "Your product's name"}
                  enterKeyHint="done"
                  className="h-8 min-w-40 flex-1 rounded-[6px] bg-transparent px-2 text-[14px] outline-none placeholder:text-faint focus:bg-surface-2"
                />
              )}
            </form>
          </div>
          <GroupRow label="Daily email" htmlFor="mention-digest">
            <Switch
              id="mention-digest"
              on={settings.digest}
              onChange={async (digest) => {
                setSettings((s) => ({ ...s, digest }));
                const res = await saveMentionSettings(spaceId, { digest }, view);
                if (!res.ok) {
                  setSettings((s) => ({ ...s, digest: !digest }));
                  return toast.error(res.error);
                }
                toast.success(digest ? "Daily email on" : "Daily email off");
              }}
            />
          </GroupRow>
        </Group>

        <div className="mt-6 mb-4 shadow-[inset_0_-1px_0_var(--line)]">
          <Segmented variant="tabs" label="Mentions" value={view} onChange={(s) => void show(s)} options={tabs} />
        </div>

        <div className={cn("transition-opacity duration-200", loading && "opacity-50")} aria-busy={loading}>
          {items.length === 0 ? (
            <div className="flex animate-view flex-col items-center rounded-[12px] px-6 py-16 text-center ring-1 ring-line">
              <h2 className="font-display text-[17px] font-medium">
                {!settings.keywords.length ? "No keywords yet" : view === "new" ? "No new mentions" : "Nothing here"}
              </h2>
              {!settings.keywords.length && <p className="mt-1.5 text-[14px] text-muted">Add one above to watch Hacker News.</p>}
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
              <AnimatePresence initial={false}>
                {items.map((m) => (
                  <motion.li
                    key={m.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.14 } }}
                    transition={SPRING}
                    className="px-4 py-4 md:px-5"
                    data-mention={m.id}
                  >
                    <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
                      <span className="flex min-w-0 items-center gap-2">
                        <SourceIcon source={m.platform} className="size-3.5 text-ink" label />
                        <span className="truncate font-medium text-ink">{m.author}</span>
                        {settings.keywords.length > 1 && <span className="shrink-0">· {m.keyword}</span>}
                      </span>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="shrink-0 tabular-nums hover:text-ink"
                        aria-label="Open on Hacker News"
                      >
                        {formatDate(m.postedAt)}
                      </a>
                    </div>
                    {m.title && m.title !== m.text && <p className="mt-2 text-[14.5px] font-medium">{m.title}</p>}
                    <p className="mt-1.5 line-clamp-5 text-[14.5px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line">
                      {m.text}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5">
                      {m.status === "new" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy === m.id}
                            onClick={() =>
                              void move(m, "saved", async () => {
                                const res = await saveMention(spaceId, m.id);
                                if (res.ok) toast.success("Saved as testimonial");
                                return res;
                              })
                            }
                          >
                            {busy === m.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" strokeWidth={2.5} />}
                            Save as testimonial
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted"
                            disabled={busy === m.id}
                            onClick={() => void move(m, "dismissed", () => setMentionStatus(spaceId, m.id, "dismissed"))}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                      {m.status === "dismissed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted"
                          disabled={busy === m.id}
                          onClick={() => void move(m, "new", () => setMentionStatus(spaceId, m.id, "new"))}
                        >
                          <Undo2 className="size-4" /> Restore
                        </Button>
                      )}
                      {m.status === "saved" && (
                        <Link href={`/app/${spaceId}`} className="text-[13px] font-medium text-muted hover:text-ink">
                          In the inbox
                        </Link>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </Page>
    </div>
  );
}
