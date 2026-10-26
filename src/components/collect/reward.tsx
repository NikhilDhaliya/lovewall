"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMedia } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import type { RewardResult, SpinResult } from "@/lib/forms";
import type { CollectDict } from "@/lib/i18n/collect/en";
import { t } from "@/lib/i18n/collect/languages";

function CodeBox({ code, dict }: { code: string; dict: CollectDict }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-[10px] px-5 py-3 font-mono text-[22px] font-semibold tracking-wide [overflow-wrap:anywhere] ring-1 ring-line select-all ring-inset"
        data-testid="reward-code"
        dir="ltr"
      >
        {code}
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* the code stays selectable */
          }
        }}
        className="flex h-10 items-center gap-1.5 rounded-[8px] px-3.5 text-[14px] font-medium text-muted ring-1 ring-line transition-colors ring-inset hover:bg-surface-2 hover:text-ink"
      >
        {copied ? <Check className="size-4" strokeWidth={2.5} /> : <Copy className="size-4" />}
        <span aria-live="polite">{copied ? dict.copied : dict.copyCode}</span>
      </button>
    </div>
  );
}

function LinkButton({ url, label }: { url: string; label: string }) {
  if (!/^https?:\/\//i.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex h-11 items-center gap-2 rounded-[10px] px-5 text-[15px] font-medium ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
    >
      {label} <ExternalLink className="size-4 text-muted" />
    </a>
  );
}

const SIZE = 248;
const R = SIZE / 2;

function slicePath(i: number, n: number) {
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const r = R - 2;
  const p = (a: number) => `${R + r * Math.cos(a)} ${R + r * Math.sin(a)}`;
  return `M${R} ${R} L${p(a0)} A${r} ${r} 0 ${n <= 2 ? 1 : 0} 1 ${p(a1)} Z`;
}

// Spin the wheel: the server picks the prize; the wheel only shows it. Calm: one slow turn-down, no confetti, and
// no motion at all for people who ask for less.
function SpinWheel({
  spaceId,
  claim,
  prizes,
  dict,
  preview,
}: {
  spaceId: string;
  claim: string;
  prizes: string[];
  dict: CollectDict;
  preview?: boolean;
}) {
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const n = prizes.length;
  const slice = 360 / n;

  async function spin() {
    if (preview || phase !== "idle") return;
    setError(null);
    setPhase("spinning");
    try {
      const res = await fetch(`/api/collect/${spaceId}/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim }),
      });
      const data = (await res.json().catch(() => ({}))) as SpinResult & { error?: string };
      if (!res.ok || typeof data.index !== "number") throw new Error(res.status === 429 ? dict.errTooMany : dict.errSend);
      setResult(data);
      // Land in the middle of the winning slice (with a little play), after a few slow turns.
      const jitter = (Math.random() - 0.5) * slice * 0.5;
      const target = 360 * 5 + (360 - (data.index + 0.5) * slice) + jitter;
      if (reduce) {
        setAngle(target % 360);
        setPhase("done");
      } else setAngle(target);
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={dict.spinTitle}
          style={{
            transform: `rotate(${angle}deg)`,
            transition: reduce || phase === "idle" ? "none" : "transform 4.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onTransitionEnd={() => phase === "spinning" && setPhase("done")}
        >
          {prizes.map((label, i) => {
            const mid = (i + 0.5) * slice;
            return (
              <g key={i}>
                <path d={slicePath(i, n)} fill={i % 2 ? "var(--surface)" : "var(--surface-2)"} stroke="var(--line)" strokeWidth={1} />
                <text
                  x={R}
                  y={26}
                  transform={`rotate(${mid} ${R} ${R})`}
                  textAnchor="middle"
                  fontSize={n > 6 ? 11 : 12.5}
                  fontWeight={500}
                  fill="var(--ink)"
                >
                  {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                </text>
              </g>
            );
          })}
          <circle cx={R} cy={R} r={R - 1.5} fill="none" stroke="var(--line)" strokeWidth={1.5} />
          <circle cx={R} cy={R} r={14} fill="var(--surface)" stroke="var(--line)" />
        </svg>
        {/* Pointer */}
        <svg className="absolute -top-2 left-1/2 -translate-x-1/2" width="18" height="16" viewBox="0 0 18 16" aria-hidden>
          <path d="M9 16 L1 2 Q0 0 2 0 L16 0 Q18 0 17 2 Z" fill="var(--ink)" />
        </svg>
      </div>
      <div className="mt-5 flex min-h-11 flex-col items-center" aria-live="polite">
        {phase === "done" && result ? (
          result.prize.kind === "none" ? (
            <p className="text-[16px] text-muted">{dict.noPrize}</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-[16px] font-medium" data-testid="spin-result">
                {t(dict, "youWon", { prize: result.prize.label })}
              </p>
              {result.prize.kind === "code" && result.prize.value && <CodeBox code={result.prize.value} dict={dict} />}
              {result.prize.kind === "link" && result.prize.value && <LinkButton url={result.prize.value} label={dict.claimReward} />}
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => void spin()}
            disabled={phase !== "idle"}
            className="flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-[10px] bg-accent px-6 text-[15px] font-medium text-on-accent transition-[background-color,scale,opacity] hover:bg-accent-hover active:scale-[0.97] disabled:opacity-70"
          >
            {phase === "spinning" && <Loader2 className="size-4 animate-spin" />}
            {phase === "spinning" ? dict.spinning : dict.spin}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[14px] text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function RewardBlock({
  reward,
  spaceId,
  dict,
  preview,
}: {
  reward: RewardResult;
  spaceId: string;
  dict: CollectDict;
  preview?: boolean;
}) {
  return (
    <section
      aria-label={reward.type === "wheel" ? dict.spinTitle : dict.rewardTitle}
      className={cn("mt-8 w-full max-w-[360px] rounded-[12px] bg-surface p-5 ring-1 ring-line", reward.type === "wheel" && "pt-6")}
    >
      <h2 className="mb-4 text-[14px] font-medium text-muted">{reward.type === "wheel" ? dict.spinTitle : dict.rewardTitle}</h2>
      {reward.type === "code" && (
        <>
          {reward.label && <p className="mb-3 text-[15px]">{reward.label}</p>}
          <CodeBox code={reward.code} dict={dict} />
        </>
      )}
      {reward.type === "link" && (
        <div className="flex justify-center">
          <LinkButton url={reward.url} label={reward.label || dict.claimReward} />
        </div>
      )}
      {reward.type === "wheel" && <SpinWheel spaceId={spaceId} claim={reward.claim} prizes={reward.prizes} dict={dict} preview={preview} />}
    </section>
  );
}
