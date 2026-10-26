"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  CheckCheck,
  Download,
  EyeOff,
  Import,
  Loader2,
  PenLine,
  Plus,
  ScrollText,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { markNotSpam, transcribeVideo } from "@/app/actions/ai";
import { changeTags, deleteTestimonials, listTestimonials, setFeatured, setStatus } from "@/app/actions/testimonials";
import { Page, PageHeader, useShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy";
import { Kbd } from "@/components/ui/field";
import { Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SPRING } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { SourceIcon } from "@/components/ui/source-icon";
import { cn } from "@/lib/cn";
import type { FormMeta } from "@/lib/data/forms";
import type { InboxFilters, OwnerTestimonial } from "@/lib/data/testimonials";
import { answerText, NPS_REASON_ID, NPS_SCORE_ID } from "@/lib/forms";
import type { Status } from "@/lib/types";
import { EditSheet, type EditPreset } from "./edit-sheet";
import { ImportSheet } from "./import-sheet";
import { InboxItem, type ItemDetails } from "./item";
import { ReplySheet } from "./reply-sheet";
import { TagsSheet } from "./tags-sheet";

// Loaded when first opened, so the inbox hydrates quickly.
const ExportSheet = dynamic(() => import("./export-sheet").then((m) => m.ExportSheet), { ssr: false });
const ShareImageSheet = dynamic(() => import("./share-image").then((m) => m.ShareImageSheet), { ssr: false });
const SummarySheet = dynamic(() => import("@/components/ai/summary-sheet").then((m) => m.SummarySheet), { ssr: false });
const TranslateSheet = dynamic(() => import("@/components/ai/translate-sheet").then((m) => m.TranslateSheet), { ssr: false });

type Counts = { new: number; approved: number; hidden: number; all: number };
type Meta = { counts: Counts; tags: string[]; sources: string[] };

function keyOf(f: InboxFilters) {
  return JSON.stringify([f.status, f.source ?? "", f.rating ?? 0, f.tag ?? "", f.q ?? "", f.form ?? ""]);
}

// Answers with their question labels, in the form's order (answers to deleted questions are left out).
function detailsOf(t: OwnerTestimonial, forms: Map<string, FormMeta>, spaceId: string): ItemDetails | undefined {
  const f = t.form_id ? forms.get(t.form_id) : undefined;
  if (!f) return undefined;
  const a = t.answers ?? {};
  const answers: ItemDetails["answers"] = [];
  if (a[NPS_SCORE_ID] !== undefined) answers.push({ label: f.scoreLabel, value: `${a[NPS_SCORE_ID]}/10` });
  if (a[NPS_REASON_ID] !== undefined) answers.push({ label: f.reasonLabel, value: answerText(a[NPS_REASON_ID]) });
  for (const [id, label] of Object.entries(f.labels)) if (a[id] !== undefined) answers.push({ label, value: answerText(a[id]) });
  return {
    answers,
    form: f.isDefault ? null : f.name,
    caseStudy: f.kind === "case_study" ? `/app/${spaceId}/collect/${f.id}/results#${t.id}` : null,
  };
}

function matches(t: OwnerTestimonial, f: InboxFilters) {
  if (f.status !== "all" && t.status !== f.status) return false;
  if (f.source && t.source.toLowerCase() !== f.source.toLowerCase()) return false;
  if (f.rating && t.rating !== f.rating) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  if (f.form && t.form_id !== f.form) return false;
  return true;
}

export function Inbox({
  space,
  collectUrl,
  initial,
  forms = [],
  ai,
  notice,
  canExport = true,
}: {
  space: { id: string; name: string; brandColor?: string; hasLogo?: boolean };
  collectUrl: string;
  initial: { filters: InboxFilters; items: OwnerTestimonial[]; next: string | null; meta: Meta };
  forms?: FormMeta[];
  // Which AI keys the server has (nothing AI shows without them).
  ai?: { text: boolean; speech: boolean };
  // Shown above the list (the report queue). Export is for the space's owner.
  notice?: React.ReactNode;
  canExport?: boolean;
}) {
  const { patchSpace } = useShell();
  const [filters, setFilters] = useState<InboxFilters>(initial.filters);
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.next);
  const [meta, setMeta] = useState(initial.meta);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [editing, setEditing] = useState<OwnerTestimonial | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [preset, setPreset] = useState<EditPreset | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tagsFor, setTagsFor] = useState<string[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<OwnerTestimonial | null>(null);
  const formById = useMemo(() => new Map(forms.map((f) => [f.id, f])), [forms]);
  const [exportOpen, setExportOpen] = useState<boolean | null>(null); // null: never opened (not loaded yet)
  const [share, setShare] = useState<{ id: string; open: boolean } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState<boolean | null>(null); // null: never opened (not loaded yet)
  const [translating, setTranslating] = useState<OwnerTestimonial | null>(null);
  const [translateMounted, setTranslateMounted] = useState(false);
  const [query, setQuery] = useState(initial.filters.q ?? "");
  const cache = useRef(new Map<string, { items: OwnerTestimonial[]; next: string | null }>());
  const refs = useRef(new Map<string, HTMLDivElement>());
  const search = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  useEffect(() => {
    cache.current.set(keyOf(initial.filters), { items: initial.items, next: initial.next });
  }, [initial]);

  // Keep the sidebar badge in step with the "new" count.
  useEffect(() => {
    patchSpace(space.id, { fresh: meta.counts.new });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.counts.new, space.id]);

  const load = useCallback(
    async (f: InboxFilters) => {
      const id = ++request.current;
      const cached = cache.current.get(keyOf(f));
      if (cached) {
        setItems(cached.items);
        setNext(cached.next);
      } else setLoading(true);
      const res = await listTestimonials(space.id, f);
      if (id !== request.current) return;
      setLoading(false);
      if (!res.ok) return toast.error(res.error);
      cache.current.set(keyOf(f), { items: res.data.items, next: res.data.next });
      setItems(res.data.items);
      setNext(res.data.next);
      if (res.data.meta) setMeta(res.data.meta);
    },
    [space.id],
  );

  function applyFilters(patch: Partial<InboxFilters>) {
    const f = { ...filters, ...patch };
    setFilters(f);
    setSelected(new Set());
    setFocusId(null);
    void load(f);
  }

  // Search as you type (debounced).
  useEffect(() => {
    if ((filters.q ?? "") === query) return;
    const id = setTimeout(() => applyFilters({ q: query || null }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadMore() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    const res = await listTestimonials(space.id, filters, next);
    setLoadingMore(false);
    if (!res.ok) return toast.error(res.error);
    setItems((list) => {
      const seen = new Set(list.map((t) => t.id));
      return [...list, ...res.data.items.filter((t) => !seen.has(t.id))];
    });
    setNext(res.data.next);
  }

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  });

  // ----- Optimistic mutations -----

  function snapshot() {
    return { items, meta, next };
  }
  function rollback(s: ReturnType<typeof snapshot>, error: string) {
    setItems(s.items);
    setMeta(s.meta);
    setNext(s.next);
    toast.error(error);
  }

  function patchItems(ids: string[], patch: (t: OwnerTestimonial) => OwnerTestimonial) {
    const set = new Set(ids);
    setItems((list) => list.map((t) => (set.has(t.id) ? patch(t) : t)).filter((t) => matches(t, filters) || !set.has(t.id)));
  }

  async function changeStatus(ids: string[], status: Status, opts: { undo?: boolean } = {}) {
    if (!ids.length) return;
    const before = snapshot();
    const byId = new Map(items.map((t) => [t.id, t]));
    const previous = ids.map((id) => ({ id, status: byId.get(id)?.status })).filter((p) => p.status && p.status !== status);
    if (!previous.length) return;
    const counts = { ...meta.counts };
    for (const p of previous) {
      counts[p.status!]--;
      counts[status]++;
    }
    setMeta({ ...meta, counts });
    // Move focus to the next row before this one leaves the list.
    if (focusId && ids.includes(focusId) && filters.status !== "all" && filters.status !== status) {
      const idx = items.findIndex((t) => t.id === focusId);
      const nextRow =
        items.slice(idx + 1).find((t) => !ids.includes(t.id)) ??
        items
          .slice(0, idx)
          .reverse()
          .find((t) => !ids.includes(t.id));
      setFocusId(nextRow?.id ?? null);
    }
    patchItems(ids, (t) => ({ ...t, status }));
    setSelected(new Set());
    cache.current.clear();
    const res = await setStatus(
      space.id,
      previous.map((p) => p.id),
      status,
    );
    if (!res.ok) return rollback(before, res.error);
    if (opts.undo !== false) {
      const label = status === "approved" ? "Approved" : status === "hidden" ? "Hidden" : "Moved to new";
      toast.success(previous.length > 1 ? `${label} · ${previous.length}` : label, {
        action: {
          label: "Undo",
          onClick: async () => {
            cache.current.clear();
            for (const s of ["new", "approved", "hidden"] as Status[]) {
              const group = previous.filter((p) => p.status === s).map((p) => p.id);
              if (group.length) await setStatus(space.id, group, s);
            }
            void load(filters);
          },
        },
      });
    }
  }

  async function notSpam(t: OwnerTestimonial) {
    const before = snapshot();
    const counts = { ...meta.counts, hidden: meta.counts.hidden - 1, new: meta.counts.new + 1 };
    setMeta({ ...meta, counts });
    patchItems([t.id], (x) => ({ ...x, spam: false, status: "new" }));
    cache.current.clear();
    const res = await markNotSpam(space.id, t.id);
    if (!res.ok) return rollback(before, res.error);
    toast.success("Moved to new");
  }

  async function transcribe(t: OwnerTestimonial) {
    const id = toast.loading("Transcribing");
    const res = await transcribeVideo(space.id, t.id);
    toast.dismiss(id);
    if (!res.ok) return toast.error(res.error);
    cache.current.clear();
    patchItems([t.id], (x) => ({ ...x, captions: true, transcript: res.data?.transcript ?? x.transcript, text: res.data?.text ?? x.text }));
    toast.success("Captions added");
  }

  async function toggleFeatured(t: OwnerTestimonial) {
    const before = snapshot();
    patchItems([t.id], (x) => ({ ...x, featured: !t.featured }));
    cache.current.clear();
    const res = await setFeatured(space.id, [t.id], !t.featured);
    if (!res.ok) return rollback(before, res.error);
    toast.success(t.featured ? "Unpinned" : "Featured");
  }

  async function remove(ids: string[]) {
    if (!ids.length) return;
    const ok = await confirmAction({
      title: ids.length > 1 ? `Delete ${ids.length} testimonials?` : "Delete this testimonial?",
      message: "This can’t be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const before = snapshot();
    const set = new Set(ids);
    const counts = { ...meta.counts };
    for (const t of items) {
      if (!set.has(t.id)) continue;
      counts[t.status]--;
      counts.all--;
    }
    setMeta({ ...meta, counts });
    setItems((list) => list.filter((t) => !set.has(t.id)));
    setSelected(new Set());
    cache.current.clear();
    const res = await deleteTestimonials(space.id, ids);
    if (!res.ok) return rollback(before, res.error);
    toast.success(ids.length > 1 ? `Deleted ${ids.length}` : "Deleted");
  }

  async function applyTags(ids: string[], add: string[], removeTags: string[]) {
    if (!add.length && !removeTags.length) return;
    const before = snapshot();
    patchItems(ids, (t) => ({ ...t, tags: [...new Set([...t.tags, ...add])].filter((x) => !removeTags.includes(x)).sort() }));
    setMeta((m) => ({ ...m, tags: [...new Set([...m.tags, ...add])].sort() }));
    cache.current.clear();
    const res = await changeTags(space.id, ids, { add, remove: removeTags });
    if (!res.ok) return rollback(before, res.error);
    toast.success("Tags updated");
  }

  function onSaved(t: OwnerTestimonial, created: boolean) {
    cache.current.clear();
    if (created) {
      setMeta((m) => ({
        ...m,
        counts: { ...m.counts, [t.status]: m.counts[t.status] + 1, all: m.counts.all + 1 },
        sources: [...new Set([...m.sources, t.source])],
      }));
      if (matches(t, filters)) setItems((list) => [t, ...list]);
      else if (filters.status !== t.status) applyFilters({ status: "all", source: null, rating: null, tag: null });
      setFocusId(t.id);
    } else {
      const old = items.find((x) => x.id === t.id);
      if (old && old.status !== t.status) {
        setMeta((m) => ({ ...m, counts: { ...m.counts, [old.status]: m.counts[old.status] - 1, [t.status]: m.counts[t.status] + 1 } }));
      }
      setItems((list) => list.map((x) => (x.id === t.id ? t : x)).filter((x) => matches(x, filters)));
    }
  }

  // ----- Keyboard: j/k move, a approve, h hide, f feature, e edit, x select, # delete, / search, ? help -----

  const focused = items.find((t) => t.id === focusId) ?? null;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog], [role=menu]")) return;
      if (editOpen || importOpen || tagsFor || helpOpen || replyTo || exportOpen || share?.open || summaryOpen || translating) return;
      const idx = items.findIndex((t) => t.id === focusId);
      const move = (d: number) => {
        if (!items.length) return;
        const n = idx === -1 ? (d > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, idx + d));
        setFocusId(items[n].id);
        refs.current.get(items[n].id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      const k = e.key;
      if (k === "j" || k === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (k === "k" || k === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (k === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (k === "?") setHelpOpen(true);
      else if (k === "Escape") {
        setSelected(new Set());
        setFocusId(null);
      } else if (selected.size && (k === "a" || k === "h")) {
        void changeStatus([...selected], k === "a" ? "approved" : "hidden");
      } else if (focused) {
        if (k === "a") void changeStatus([focused.id], focused.status === "approved" ? "new" : "approved");
        else if (k === "h") void changeStatus([focused.id], focused.status === "hidden" ? "new" : "hidden");
        else if (k === "f") void toggleFeatured(focused);
        else if (k === "e" || k === "Enter") {
          // Keep the key out of the sheet's name field, which takes focus right away.
          e.preventDefault();
          setEditing(focused);
          setPreset(null);
          setEditOpen(true);
        } else if (k === "x") {
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(focused.id)) n.delete(focused.id);
            else n.add(focused.id);
            return n;
          });
        } else if (k === "#" || k === "Delete" || k === "Backspace") void remove([focused.id]);
        else if (k === "t") {
          e.preventDefault();
          setTagsFor([focused.id]);
        } else if (k === "r" && focused.email) {
          e.preventDefault();
          setReplyTo(focused);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const statusOptions = useMemo(
    () =>
      (["new", "approved", "hidden", "all"] as const).map((s) => ({
        value: s,
        label: (
          <span className="flex items-center justify-center gap-1.5">
            {s === "new" ? "New" : s === "approved" ? "Approved" : s === "hidden" ? "Hidden" : "All"}
            <span className="text-[11px] text-faint tabular-nums">{meta.counts[s]}</span>
          </span>
        ),
      })),
    [meta.counts],
  );

  const activeFilters = [
    filters.source && { k: "source", label: filters.source },
    filters.rating && { k: "rating", label: `${filters.rating} stars` },
    filters.tag && { k: "tag", label: filters.tag },
    filters.form && { k: "form", label: formById.get(filters.form)?.name ?? "Form" },
  ].filter(Boolean) as { k: "source" | "rating" | "tag" | "form"; label: string }[];

  const empty = meta.counts.all === 0;
  const tagInitial = tagsFor
    ? (items
        .filter((t) => tagsFor.includes(t.id))
        .reduce<string[] | null>((acc, t) => (acc === null ? t.tags : acc.filter((x) => t.tags.includes(x))), null) ?? [])
    : [];

  return (
    <div className="pb-28">
      <PageHeader title="Inbox" width={empty ? undefined : "max-w-[880px]"}>
        <CopyButton
          text={collectUrl}
          label="Copy link"
          toastLabel="Link copied"
          className="h-10 rounded-[8px] bg-surface px-3.5 text-[14px] ring-1 ring-line ring-inset hover:bg-surface-2 max-sm:w-10 max-sm:px-0 md:h-9 max-sm:[&>span:last-child]:hidden"
        />
        {!empty && ai?.text && (
          <Button variant="secondary" className="max-sm:w-10 max-sm:px-0" aria-label="Summary" onClick={() => setSummaryOpen(true)}>
            <ScrollText className="size-4" /> <span className="max-sm:hidden">Summary</span>
          </Button>
        )}
        {!empty && canExport && (
          <Button variant="secondary" size="icon" aria-label="Export" onClick={() => setExportOpen(true)}>
            <Download className="size-4" />
          </Button>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button aria-label="Add testimonials">
              <Plus className="size-4" strokeWidth={2.5} /> Add
            </Button>
          </MenuTrigger>
          <MenuContent className="w-52">
            <MenuItem onSelect={() => setImportOpen(true)}>
              <Import /> Import
            </MenuItem>
            <MenuItem
              onSelect={() => {
                setEditing(null);
                setPreset(null);
                setEditOpen(true);
              }}
            >
              <PenLine /> Add manually
            </MenuItem>
          </MenuContent>
        </Menu>
      </PageHeader>

      <Page width={empty ? undefined : "max-w-[880px]"}>
        {notice}
        {empty ? (
          <EmptyInbox collectUrl={collectUrl} onImport={() => setImportOpen(true)} />
        ) : (
          <>
            <div className="sticky top-14 z-20 -mx-4 mb-4 flex flex-wrap items-end gap-x-4 bar px-4 sm:shadow-[inset_0_-1px_0_var(--line)] md:top-0 md:mx-0 md:px-0">
              <Segmented
                variant="tabs"
                label="Status"
                value={filters.status}
                onChange={(status) => applyFilters({ status })}
                options={statusOptions}
                className="no-scrollbar overflow-x-auto max-sm:w-full max-sm:shadow-[inset_0_-1px_0_var(--line)]"
              />
              <div className="flex w-full items-center gap-2 py-2 sm:ml-auto sm:w-auto sm:flex-1 sm:justify-end sm:py-1.5">
                <label className="relative flex h-9 min-w-0 flex-1 items-center sm:max-w-[240px]">
                  <Search className="pointer-events-none absolute left-3 size-4 text-faint" />
                  <input
                    ref={search}
                    type="search"
                    aria-label="Search"
                    placeholder="Search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setQuery(""))}
                    className="h-full w-full rounded-[8px] bg-surface pr-3 pl-9 text-[14px] ring-1 ring-line transition-[box-shadow] outline-none ring-inset placeholder:text-faint focus:ring-[1.5px] focus:ring-ink/35"
                  />
                </label>
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Filter"
                      className={cn("size-9", activeFilters.length && "bg-accent text-on-accent ring-accent hover:bg-accent-hover")}
                    >
                      <SlidersHorizontal className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent className="w-56">
                    <MenuLabel>Rating</MenuLabel>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <MenuCheck
                        key={r}
                        checked={filters.rating === r}
                        onCheckedChange={() => applyFilters({ rating: filters.rating === r ? null : r })}
                      >
                        {r} {r === 1 ? "star" : "stars"}
                      </MenuCheck>
                    ))}
                    {meta.sources.length > 0 && (
                      <>
                        <MenuSeparator />
                        <MenuLabel>Source</MenuLabel>
                        {meta.sources.map((s) => (
                          <MenuCheck
                            key={s}
                            checked={filters.source === s}
                            onCheckedChange={() => applyFilters({ source: filters.source === s ? null : s })}
                          >
                            <span className="min-w-0 flex-1 truncate">{s}</span>
                            <SourceIcon source={s} className="size-3.5 text-muted" />
                          </MenuCheck>
                        ))}
                      </>
                    )}
                    {forms.length > 1 && (
                      <>
                        <MenuSeparator />
                        <MenuLabel>Form</MenuLabel>
                        {forms.map((f) => (
                          <MenuCheck
                            key={f.id}
                            checked={filters.form === f.id}
                            onCheckedChange={() => applyFilters({ form: filters.form === f.id ? null : f.id })}
                          >
                            <span className="truncate">{f.name}</span>
                          </MenuCheck>
                        ))}
                      </>
                    )}
                    {meta.tags.length > 0 && (
                      <>
                        <MenuSeparator />
                        <MenuLabel>Tag</MenuLabel>
                        {meta.tags.map((t) => (
                          <MenuCheck
                            key={t}
                            checked={filters.tag === t}
                            onCheckedChange={() => applyFilters({ tag: filters.tag === t ? null : t })}
                          >
                            {t}
                          </MenuCheck>
                        ))}
                      </>
                    )}
                  </MenuContent>
                </Menu>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 md:hidden"
                  onClick={() => (setSelecting(!selecting), setSelected(new Set()))}
                >
                  {selecting ? "Done" : "Select"}
                </Button>
              </div>
              {activeFilters.length > 0 && (
                <div className="flex w-full flex-wrap gap-1.5 pb-2">
                  {activeFilters.map((f) => (
                    <button
                      key={f.k}
                      type="button"
                      onClick={() => applyFilters({ [f.k]: null })}
                      className="flex h-7 items-center gap-1 rounded-[6px] bg-surface pr-1.5 pl-2.5 text-[12.5px] font-medium text-ink ring-1 ring-line transition-[background-color,scale] ring-inset hover:bg-surface-2 active:scale-95"
                    >
                      {f.label} <X className="size-3.5 text-muted" strokeWidth={2.5} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={cn("transition-opacity duration-200", loading && "opacity-50")} aria-busy={loading}>
              {items.length === 0 && !loading ? (
                <FilteredEmpty
                  status={filters.status}
                  filtered={activeFilters.length > 0 || Boolean(filters.q)}
                  onClear={() => (setQuery(""), applyFilters({ source: null, rating: null, tag: null, q: null, form: null }))}
                />
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
                  <AnimatePresence initial={false}>
                    {items.map((t) => (
                      <motion.li
                        key={t.id}
                        layout="position"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.14 } }}
                        transition={SPRING}
                      >
                        <InboxItem
                          ref={(el) => {
                            if (el) refs.current.set(t.id, el);
                            else refs.current.delete(t.id);
                          }}
                          t={t}
                          focused={focusId === t.id}
                          selected={selected.has(t.id)}
                          selecting={selecting || selected.size > 0}
                          showStatus={filters.status === "all"}
                          details={detailsOf(t, formById, space.id)}
                          actions={{
                            reply: t.email ? () => setReplyTo(t) : undefined,
                            approve: () => void changeStatus([t.id], "approved"),
                            hide: () => void changeStatus([t.id], "hidden"),
                            restore: () => void changeStatus([t.id], "new"),
                            feature: () => void toggleFeatured(t),
                            edit: () => (setEditing(t), setPreset(null), setEditOpen(true)),
                            tags: () => setTagsFor([t.id]),
                            remove: () => void remove([t.id]),
                            toggleSelect: () =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (n.has(t.id)) n.delete(t.id);
                                else n.add(t.id);
                                return n;
                              }),
                            focus: () => setFocusId(t.id),
                            share: () => setShare({ id: t.id, open: true }),
                            download: () => window.location.assign(`/api/spaces/${space.id}/testimonials/${t.id}/video`),
                            notSpam: ai?.text ? () => void notSpam(t) : undefined,
                            translate: ai?.text ? () => (setTranslateMounted(true), setTranslating(t)) : undefined,
                            transcribe: ai?.speech ? () => void transcribe(t) : undefined,
                          }}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
              {next && (
                <div ref={sentinel} className="flex justify-center py-6">
                  <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="size-4 animate-spin" />} More
                  </Button>
                </div>
              )}
              <p className="mt-8 hidden text-center text-[12px] text-faint lg:block">
                <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>a</Kbd> approve · <Kbd>h</Kbd> hide · <Kbd>?</Kbd> all shortcuts
              </p>
            </div>
          </>
        )}
      </Page>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-6 md:pl-[248px]"
          >
            <div
              role="toolbar"
              aria-label="Selected testimonials"
              className="flex items-center gap-1 rounded-[10px] bg-surface p-1 shadow-float"
            >
              <span className="px-3 text-[13px] font-semibold tabular-nums">{selected.size}</span>
              <Button size="sm" onClick={() => void changeStatus([...selected], "approved")}>
                <Check className="size-4" strokeWidth={2.5} /> <span className="max-sm:hidden">Approve</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void changeStatus([...selected], "hidden")} aria-label="Hide">
                <EyeOff className="size-4" /> <span className="max-sm:hidden">Hide</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTagsFor([...selected])} aria-label="Tag">
                <Tag className="size-4" /> <span className="max-sm:hidden">Tag</span>
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove([...selected])} aria-label="Delete">
                <Trash2 className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(items.map((t) => t.id)))} aria-label="Select all">
                <CheckCheck className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => (setSelected(new Set()), setSelecting(false))}
                aria-label="Clear selection"
              >
                <X className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <EditSheet
        spaceId={space.id}
        editing={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onSaved}
        preset={preset}
        details={editing ? detailsOf(editing, formById, space.id) : undefined}
        readText={Boolean(ai?.text)}
        translations={Boolean(ai?.text)}
      />
      <ReplySheet
        spaceId={space.id}
        to={replyTo}
        onOpenChange={(o) => !o && setReplyTo(null)}
        onSent={(id, repliedAt) => {
          cache.current.clear();
          setItems((list) => list.map((t) => (t.id === id ? { ...t, replied_at: repliedAt } : t)));
        }}
      />
      <ImportSheet
        spaceId={space.id}
        open={importOpen}
        onOpenChange={setImportOpen}
        onPaste={(p) => {
          setImportOpen(false);
          setEditing(null);
          setPreset(p);
          setEditOpen(true);
        }}
        onImported={() => {
          // Imports can add hundreds at once: reload, showing everything (or the new ones).
          cache.current.clear();
          const f: InboxFilters = { status: filters.status === "new" ? "new" : "all", source: null, rating: null, tag: null, q: null };
          setQuery("");
          setFilters(f);
          setSelected(new Set());
          void load(f);
        }}
      />
      <TagsSheet
        open={tagsFor !== null}
        onOpenChange={(o) => !o && setTagsFor(null)}
        allTags={meta.tags}
        initial={tagInitial}
        count={tagsFor?.length ?? 0}
        onApply={(add, rm) => tagsFor && void applyTags(tagsFor, add, rm)}
      />
      {exportOpen !== null && (
        <ExportSheet spaceId={space.id} filters={filters} total={meta.counts.all} open={exportOpen} onOpenChange={setExportOpen} />
      )}
      {summaryOpen !== null && <SummarySheet spaceId={space.id} open={summaryOpen} onOpenChange={setSummaryOpen} />}
      {translateMounted && <TranslateSheet spaceId={space.id} testimonial={translating} onOpenChange={(o) => !o && setTranslating(null)} />}
      {share && (
        <ShareImageSheet
          spaceId={space.id}
          testimonialId={share.id}
          brandColor={space.brandColor ?? "#1d1d1f"}
          hasLogo={Boolean(space.hasLogo)}
          open={share.open}
          onOpenChange={(open) => setShare((s) => s && { ...s, open })}
        />
      )}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen} title="Shortcuts">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-5 text-[14px]">
          {[
            ["j / k", "Next / previous"],
            ["a", "Approve"],
            ["h", "Hide"],
            ["f", "Feature"],
            ["e", "Edit"],
            ["t", "Tags"],
            ["r", "Reply"],
            ["x", "Select"],
            ["#", "Delete"],
            ["/", "Search"],
            ["Esc", "Clear"],
          ].map(([k, label]) => (
            <div key={k} className="contents">
              <dt className="flex gap-1">
                {k.split(" / ").map((p) => (
                  <Kbd key={p}>{p}</Kbd>
                ))}
              </dt>
              <dd className="text-muted">{label}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}

function EmptyInbox({ collectUrl, onImport }: { collectUrl: string; onImport: () => void }) {
  const display = collectUrl.replace(/^https?:\/\//, "");
  return (
    <div className="flex animate-view flex-col items-center px-4 pt-12 pb-16 text-center md:pt-24">
      <h2 className="font-display text-[22px] font-semibold">Share your link</h2>
      <p className="mt-1.5 text-[15px] text-muted">Testimonials you collect land here.</p>
      <div className="mt-7 flex w-full max-w-[440px] items-center gap-1 rounded-[10px] bg-surface p-1 pl-3.5 ring-1 ring-line">
        <a
          href={collectUrl}
          target="_blank"
          className="min-w-0 flex-1 truncate text-left text-[15px] font-medium"
          data-testid="collect-url"
        >
          {display}
        </a>
        <CopyButton
          text={collectUrl}
          label="Copy"
          toastLabel="Link copied"
          className="h-9 rounded-[8px] bg-accent px-3.5 text-[14px] text-on-accent hover:bg-accent-hover"
        />
      </div>
      <button type="button" onClick={onImport} className="mt-5 text-[14px] font-medium text-muted transition-colors hover:text-ink">
        Or import reviews
      </button>
    </div>
  );
}

function FilteredEmpty({ status, filtered, onClear }: { status: InboxFilters["status"]; filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex animate-view flex-col items-center rounded-[12px] py-20 text-center ring-1 ring-line">
      <h2 className="font-display text-[17px] font-medium">
        {filtered ? "No matches" : status === "new" ? "All caught up" : "Nothing here"}
      </h2>
      {filtered && (
        <button type="button" onClick={onClear} className="mt-2 text-[14px] font-medium text-muted hover:text-ink">
          Clear filters
        </button>
      )}
    </div>
  );
}
