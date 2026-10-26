"use client";

import {
  BookOpen,
  Captions,
  Check,
  CornerUpLeft,
  Download,
  EyeOff,
  ImageDown,
  Languages,
  MoreHorizontal,
  Pencil,
  Pin,
  Play,
  ShieldCheck,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import { Link } from "@/components/app/link";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SourceIcon } from "@/components/ui/source-icon";
import { Stars } from "@/components/ui/stars";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { OwnerTestimonial } from "@/lib/data/testimonials";
import { sourceLabel } from "@/lib/sources";
import { formatDate, trimFragment, trimOf } from "@/lib/widget/render";

export function SourceLabel({ source, url }: { source: string; url: string | null }) {
  const inner = <SourceIcon source={source} className="size-3.5" label fallback={<span>{sourceLabel(source)}</span>} />;
  const cls = "inline-flex items-center gap-1 text-[12px] text-muted transition-colors";
  return url && /^https:\/\//.test(url) ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(cls, "hover:text-ink")}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

// The text with its best line (AI) marked.
function Marked({ text, highlight }: { text: string; highlight?: string | null }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark
        className="bg-transparent font-medium text-ink underline decoration-ink/25 decoration-2 underline-offset-[3px]"
        data-testid="best-line"
      >
        {highlight}
      </mark>
      {text.slice(at + highlight.length)}
    </>
  );
}

function ClampText({ text, highlight }: { text: string; highlight?: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div>
      <p ref={ref} className={cn("text-[15px] leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line", !open && "line-clamp-6")}>
        <Marked text={text} highlight={highlight} />
      </p>
      {(overflow || open) && (
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), setOpen(!open))}
          className="mt-1 text-[13px] font-medium text-muted hover:text-ink"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function VideoThumb({ t }: { t: OwnerTestimonial }) {
  const [playing, setPlaying] = useState(false);
  const ar = t.video_aspect && t.video_aspect > 0 ? Math.min(16 / 9, Math.max(9 / 16, t.video_aspect)) : 16 / 9;
  // Plays only the trimmed range.
  const range = trimOf({ videoStart: t.video_start, videoEnd: t.video_end });
  return (
    <div className="relative w-full max-w-[360px] overflow-hidden rounded-[8px] bg-surface-2" style={{ aspectRatio: ar, maxHeight: 360 }}>
      {playing ? (
        <video
          src={t.video ? t.video + trimFragment({ videoStart: t.video_start, videoEnd: t.video_end }) : undefined}
          poster={t.poster ?? undefined}
          controls
          autoPlay
          playsInline
          onPlay={(e) => {
            const v = e.currentTarget;
            if (v.currentTime < range.start - 0.3 || (range.end && v.currentTime >= range.end - 0.1)) v.currentTime = range.start;
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (range.end && v.currentTime >= range.end) {
              v.pause();
              v.currentTime = range.start;
            }
          }}
          className="size-full bg-black object-contain"
        >
          {t.captions && <track kind="captions" src={`/api/captions/${t.id}`} label="Captions" default />}
        </video>
      ) : (
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), setPlaying(true))}
          className="group absolute inset-0"
          aria-label={`Play video from ${t.name}`}
        >
          {t.poster && <img src={t.poster} alt="" className="size-full object-cover" loading="lazy" />}
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-transform group-hover:scale-105 group-active:scale-95">
              <Play className="ml-0.5 size-5" fill="currentColor" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

// From collect forms: answers to custom questions (with their labels), the form's name, a case-study link.
export type ItemDetails = { answers: { label: string; value: string }[]; form: string | null; caseStudy: string | null };

const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const) {
    if (Math.abs(s) >= size) return ago.format(Math.round(s / size), unit);
  }
  return "just now";
}

export function AnswerList({ answers, className }: { answers: ItemDetails["answers"]; className?: string }) {
  if (!answers.length) return null;
  return (
    <dl className={cn("space-y-2", className)}>
      {answers.map((a, i) => (
        <div key={i}>
          <dt className="text-[12.5px] [overflow-wrap:anywhere] text-muted">{a.label}</dt>
          <dd className="text-[14px] leading-snug [overflow-wrap:anywhere] whitespace-pre-line">{a.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// A screenshot or review card; opens full size in a new tab.
function ImageThumb({ t }: { t: OwnerTestimonial }) {
  return (
    <a
      href={t.image!}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block w-fit max-w-full overflow-hidden rounded-[8px] bg-surface-2 ring-1 ring-line transition-opacity hover:opacity-90 sm:max-w-[360px]"
    >
      <img
        src={t.image!}
        alt={t.name ? `Screenshot from ${t.name}` : "Screenshot"}
        loading="lazy"
        className="block max-h-[320px] w-auto max-w-full object-contain"
      />
    </a>
  );
}

export type ItemActions = {
  reply?: () => void;
  approve: () => void;
  hide: () => void;
  restore: () => void;
  feature: () => void;
  edit: () => void;
  tags: () => void;
  remove: () => void;
  toggleSelect: () => void;
  focus: () => void;
  share: () => void;
  download: () => void;
  // AI, when a key is set.
  notSpam?: () => void;
  translate?: () => void;
  transcribe?: () => void;
};

function IconAction({
  label,
  shortcut,
  onClick,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      label={
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut && <span className="text-faint">{shortcut}</span>}
        </span>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          "grid size-10 place-items-center rounded-[6px] transition-[background-color,color,scale] active:scale-90 md:size-8",
          active ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export const InboxItem = forwardRef<
  HTMLDivElement,
  {
    t: OwnerTestimonial;
    focused: boolean;
    selected: boolean;
    selecting: boolean;
    showStatus: boolean;
    actions: ItemActions;
    details?: ItemDetails;
  }
>(function InboxItem({ t, focused, selected, selecting, showStatus, actions, details }, ref) {
  const role = [t.title, t.company].filter(Boolean).join(", ") || (t.handle ? `@${t.handle}` : "");
  return (
    <div
      ref={ref}
      data-id={t.id}
      data-focused={focused || undefined}
      onClick={actions.focus}
      className={cn(
        "group relative flex gap-3 px-4 py-4 transition-[background-color,box-shadow] duration-150 md:gap-3.5 md:px-5",
        selected ? "bg-surface-2" : focused && "bg-surface-2/60",
        focused && "shadow-[inset_2px_0_0_var(--ink)]",
      )}
    >
      {t.status === "new" && (
        <span className="absolute top-[30px] left-1.5 size-1.5 rounded-full bg-accent md:left-2" aria-label="New" role="img" />
      )}
      {selecting && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t.name ? `Select testimonial from ${t.name}` : "Select testimonial"}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleSelect();
          }}
          className={cn(
            "mt-2 grid size-5 shrink-0 place-items-center rounded-[6px] ring-1 ring-line ring-inset md:hidden",
            selected && "bg-accent ring-accent",
          )}
        >
          <Check className={cn("size-3.5 text-on-accent", !selected && "opacity-0")} strokeWidth={3} />
        </button>
      )}
      {/* The avatar turns into a checkbox on hover, or while selecting (laptop). */}
      <div className="relative mt-0.5 size-9 shrink-0">
        <Avatar
          src={t.avatar}
          size={36}
          className={cn("transition-opacity", (selected || selecting) && "md:opacity-0", "md:group-hover:opacity-0")}
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t.name ? `Select testimonial from ${t.name}` : "Select testimonial"}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleSelect();
          }}
          className={cn(
            "absolute inset-0 m-auto grid size-5 place-items-center rounded-[6px] bg-surface ring-1 ring-line transition-opacity ring-inset max-md:hidden",
            selected ? "bg-accent ring-accent" : "",
            selected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Check className={cn("size-3.5 text-on-accent", !selected && "opacity-0")} strokeWidth={3} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn("truncate text-[14.5px] font-medium", !t.name && "text-muted")}>{t.name || "No name"}</span>
              {t.featured && <Pin className="size-3 shrink-0 fill-current text-ink" aria-label="Featured" />}
            </div>
            {role && <div className="truncate text-[13px] text-muted">{role}</div>}
          </div>
          {/* Laptop: the action toolbar takes this corner on hover, so the date steps aside. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-2.5 pt-0.5 text-[12px] text-muted transition-opacity",
              focused ? "md:opacity-0" : "md:group-focus-within:opacity-0 md:group-hover:opacity-0",
            )}
          >
            {t.spam && t.status === "hidden" ? (
              <span data-testid="spam">Spam</span>
            ) : (
              showStatus && t.status === "hidden" && <span>Hidden</span>
            )}
            {t.source !== "Form" && <SourceLabel source={t.source} url={t.source_url} />}
            {t.source === "Form" && details?.form && <span className="max-w-[140px] truncate">{details.form}</span>}
            <time className="tabular-nums" dateTime={t.given_at}>
              {formatDate(t.given_at)}
            </time>
          </div>
        </div>
        {t.rating ? <Stars value={t.rating} size={12} className="mt-2" /> : null}
        <div className="mt-2 space-y-3">
          {t.video && <VideoThumb t={t} />}
          {t.text && <ClampText text={t.text} highlight={t.highlight} />}
          {t.transcript && t.transcript !== t.text && (
            <details className="group text-[13.5px]">
              <summary className="w-fit cursor-pointer list-none text-muted transition-colors select-none hover:text-ink [&::-webkit-details-marker]:hidden">
                Transcript
              </summary>
              <p className="mt-1.5 leading-[1.55] [overflow-wrap:anywhere] whitespace-pre-line text-muted">{t.transcript}</p>
            </details>
          )}
          {details && <AnswerList answers={details.answers} />}
          {t.image && <ImageThumb t={t} />}
        </div>
        {t.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.tags.map((tag) => (
              <span key={tag} className="rounded-[5px] px-1.5 py-px text-[12px] text-muted ring-1 ring-line ring-inset">
                {tag}
              </span>
            ))}
          </div>
        )}
        {t.replied_at && (
          <p className="mt-2.5 flex items-center gap-1 text-[12.5px] text-muted" data-testid="replied">
            <CornerUpLeft className="size-3.5" />
            <span suppressHydrationWarning>Replied {timeAgo(t.replied_at)}</span>
          </p>
        )}
        <div
          className={cn(
            "mt-3 -mb-1 flex items-center justify-end gap-0.5 transition-opacity md:absolute md:top-3 md:right-3 md:mt-0 md:mb-0 md:rounded-[8px] md:bg-surface md:p-0.5 md:ring-1 md:ring-line",
            focused
              ? "md:opacity-100"
              : "md:pointer-events-none md:opacity-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
          )}
        >
          {t.status === "approved" ? (
            <IconAction label="Approved" shortcut="A" onClick={actions.restore} active>
              <Check className="size-4" strokeWidth={2.5} />
            </IconAction>
          ) : (
            <IconAction label="Approve" shortcut="A" onClick={actions.approve}>
              <Check className="size-4" strokeWidth={2.5} />
            </IconAction>
          )}
          {t.status === "hidden" ? (
            <IconAction label="Hidden" shortcut="H" onClick={actions.restore} active>
              <EyeOff className="size-4" />
            </IconAction>
          ) : (
            <IconAction label="Hide" shortcut="H" onClick={actions.hide}>
              <EyeOff className="size-4" />
            </IconAction>
          )}
          <IconAction label={t.featured ? "Unpin" : "Feature"} shortcut="F" onClick={actions.feature} active={t.featured}>
            <Pin className={cn("size-[15px]", t.featured && "fill-current")} />
          </IconAction>
          <Menu>
            <MenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="grid size-10 place-items-center rounded-[6px] text-muted transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-soft data-[state=open]:bg-surface-2 md:size-8"
              aria-label="More"
            >
              <MoreHorizontal className="size-[18px]" />
            </MenuTrigger>
            <MenuContent onClick={(e) => e.stopPropagation()}>
              {actions.reply && (
                <MenuItem onSelect={actions.reply}>
                  <CornerUpLeft /> Reply
                </MenuItem>
              )}
              {details?.caseStudy && (
                <MenuItem asChild>
                  <Link href={details.caseStudy}>
                    <BookOpen /> Case study
                  </Link>
                </MenuItem>
              )}
              <MenuItem onSelect={actions.edit}>
                <Pencil /> Edit
              </MenuItem>
              <MenuItem onSelect={actions.tags}>
                <Tag /> Tags
              </MenuItem>
              {t.text && (
                <MenuItem onSelect={actions.share}>
                  <ImageDown /> Share image
                </MenuItem>
              )}
              {t.video && (
                <MenuItem onSelect={actions.download}>
                  <Download /> Download video
                </MenuItem>
              )}
              {actions.translate && t.text && (
                <MenuItem onSelect={actions.translate}>
                  <Languages /> Translate
                </MenuItem>
              )}
              {actions.transcribe && t.video && !t.captions && (
                <MenuItem onSelect={actions.transcribe}>
                  <Captions /> Transcribe
                </MenuItem>
              )}
              {actions.notSpam && t.spam && (
                <MenuItem onSelect={actions.notSpam}>
                  <ShieldCheck /> Not spam
                </MenuItem>
              )}
              {t.status !== "new" && !t.spam && (
                <MenuItem onSelect={actions.restore}>
                  <Undo2 /> Mark as new
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem destructive onSelect={actions.remove}>
                <Trash2 /> Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </div>
  );
});
