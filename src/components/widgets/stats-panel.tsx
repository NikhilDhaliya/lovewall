"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { StatsDay, WidgetStats } from "@/lib/types";

type Metric = "views" | "clicks" | "plays";

const METRICS: { key: Metric; label: string; unit: [string, string] }[] = [
  { key: "views", label: "Views", unit: ["view", "views"] },
  { key: "clicks", label: "Clicks", unit: ["click", "clicks"] },
  { key: "plays", label: "Video plays", unit: ["play", "plays"] },
];

const NUM = new Intl.NumberFormat("en");
const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

// A clean axis maximum: 1, 2 or 5 times a power of ten.
function niceMax(n: number) {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 5, 10].map((m) => m * p).find((m) => m >= n) ?? 10 * p) as number;
}

// Thirty days of one metric as columns: hover or arrow keys show the day's numbers.
function DailyChart({ days, metric }: { days: StatsDay[]; metric: Metric }) {
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const max = niceMax(Math.max(...days.map((d) => d[metric])));
  const unit = METRICS.find((m) => m.key === metric)!.unit;

  function pick(clientX: number) {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return;
    const i = Math.floor(((clientX - box.left) / box.width) * days.length);
    setActive(Math.max(0, Math.min(days.length - 1, i)));
  }

  const day = active === null ? null : days[active];
  return (
    <div>
      <div className="flex gap-3">
        {/* Y axis: 0, half and the top, on hairlines. */}
        <div className="relative h-[180px] w-8 shrink-0 text-right text-[11px] text-faint tabular-nums" aria-hidden>
          {[max, max / 2, 0].map((v, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>
              {COMPACT.format(v)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            ref={plot}
            role="group"
            tabIndex={0}
            aria-label={`${METRICS.find((m) => m.key === metric)!.label} per day, last 30 days. Use the arrow keys to read each day.`}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setActive((a) => Math.max(0, Math.min(days.length - 1, (a ?? days.length) + (e.key === "ArrowLeft" ? -1 : 1))));
            }}
            className="relative flex h-[180px] items-end gap-[2px] rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
          >
            {[0, 0.5, 1].map((f) => (
              <span key={f} className="pointer-events-none absolute inset-x-0 h-px bg-line" style={{ top: `${f * 100}%` }} aria-hidden />
            ))}
            {days.map((d, i) => (
              <div key={d.day} className="relative flex h-full flex-1 items-end justify-center">
                <span
                  className={cn(
                    "block w-full max-w-[24px] rounded-t-[4px] transition-colors duration-150",
                    active === i ? "bg-ink" : "bg-muted/70",
                  )}
                  style={{ height: d[metric] ? `max(2px, ${(d[metric] / max) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {day && active !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-[8px] bg-surface px-2.5 py-1.5 text-[12.5px] shadow-float ring-1 ring-line"
              style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
              role="status"
            >
              <div className="text-faint">{fmtDay(day.day)}</div>
              {METRICS.map((m) => (
                <div key={m.key} className={cn("tabular-nums", m.key === metric ? "font-semibold text-ink" : "text-muted")}>
                  {NUM.format(day[m.key])} {day[m.key] === 1 ? m.unit[0] : m.unit[1]}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-between text-[11.5px] text-faint tabular-nums" aria-hidden>
            <span>{fmtDay(days[0].day)}</span>
            <span>{fmtDay(days[Math.floor(days.length / 2)].day)}</span>
            <span>{fmtDay(days[days.length - 1].day)}</span>
          </div>
        </div>
      </div>
      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{unit[1]}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{fmtDay(d.day)}</th>
              <td>{d[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPanel({ stats, appHost }: { stats: WidgetStats; appHost: string }) {
  const [metric, setMetric] = useState<Metric>("views");
  const totals = useMemo(
    () =>
      stats.days.reduce((t, d) => ({ views: t.views + d.views, clicks: t.clicks + d.clicks, plays: t.plays + d.plays }), {
        views: 0,
        clicks: 0,
        plays: 0,
      }),
    [stats.days],
  );
  const empty = totals.views + totals.clicks + totals.plays === 0;
  const maxHost = Math.max(1, ...stats.hosts.map((h) => h.views));

  return (
    <div className="space-y-5 pb-6">
      <h2 className="font-display text-[17px] font-medium">Last 30 days</h2>
      <div className="overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
        <div role="radiogroup" aria-label="Metric" className="grid grid-cols-3 divide-x divide-line border-b border-line">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "relative px-4 py-3.5 text-left transition-colors sm:px-5 sm:py-4",
                metric === m.key ? "bg-surface" : "bg-grouped/60 hover:bg-surface",
              )}
            >
              <div className={cn("text-[13px]", metric === m.key ? "text-ink" : "text-muted")}>{m.label}</div>
              <div className="mt-0.5 font-display text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
                {NUM.format(totals[m.key])}
              </div>
              {metric === m.key && <span className="absolute inset-x-0 bottom-0 h-[1.5px] bg-ink" aria-hidden />}
            </button>
          ))}
        </div>
        <div className="px-4 pt-8 pb-4 sm:px-6">
          {empty ? (
            <div className="grid h-[200px] place-items-center text-center">
              <div>
                <p className="text-[15px] font-medium">No views yet</p>
                <p className="mt-1 text-[13.5px] text-muted">Embed it to start counting.</p>
              </div>
            </div>
          ) : (
            <DailyChart days={stats.days} metric={metric} />
          )}
        </div>
      </div>
      {stats.hosts.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-[13px] font-medium text-muted">Sites</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
            {stats.hosts.map((h) => (
              <li key={h.host} className="relative flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                <span
                  className="absolute inset-y-1 left-1 rounded-[6px] bg-ink/[0.05]"
                  style={{ width: `calc(${(h.views / maxHost) * 100}% - 8px)` }}
                  aria-hidden
                />
                <span className="relative truncate">{h.host === appHost ? "Wall page" : h.host}</span>
                <span className="relative text-muted tabular-nums">{NUM.format(h.views)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
