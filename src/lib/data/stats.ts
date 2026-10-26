import "server-only";
import { one, q } from "@/lib/db";
import type { StatsDay, WidgetStats } from "@/lib/types";

export const STAT_KINDS = ["view", "click", "play"] as const;
export type StatKind = (typeof STAT_KINDS)[number];

const COLUMN: Record<StatKind, "views" | "clicks" | "plays"> = { view: "views", click: "clicks", play: "plays" };

// Sites per widget per day are capped, so a flood of made-up hostnames can't grow the table: the rest count as "".
const MAX_HOSTS_PER_DAY = 25;

// Counts one event for today (UTC). Returns false when the widget doesn't exist.
export async function recordHit(widgetId: string, kind: StatKind, host: string): Promise<boolean> {
  const column = COLUMN[kind];
  let site = host;
  if (site) {
    const known = await one<{ hosts: number; has: boolean }>(
      `select count(*)::int as hosts, bool_or(host = $2) as has from widget_stats where widget_id = $1 and day = current_date`,
      [widgetId, site],
    );
    if (known && !known.has && known.hosts >= MAX_HOSTS_PER_DAY) site = "";
  }
  const rows = await q(
    `insert into widget_stats (space_id, widget_id, day, host, ${column})
     select space_id, id, current_date, $2, 1 from widgets where id = $1
     on conflict (widget_id, day, host) do update set ${column} = widget_stats.${column} + 1
     returning widget_id`,
    [widgetId, site],
  );
  return rows.length > 0;
}

// The last 30 days (today included, zeros filled in) and the sites a widget was seen on.
export async function widgetStats(spaceId: string, widgetId: string): Promise<WidgetStats> {
  const days = await q<StatsDay>(
    `select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(s.views), 0)::int as views, coalesce(sum(s.clicks), 0)::int as clicks,
            coalesce(sum(s.plays), 0)::int as plays
     from generate_series(current_date - 29, current_date, interval '1 day') d
     left join widget_stats s on s.day = d::date and s.widget_id = $2 and s.space_id = $1
     group by d order by d`,
    [spaceId, widgetId],
  );
  const hosts = await q<{ host: string; views: number }>(
    `select host, sum(views)::int as views from widget_stats
     where space_id = $1 and widget_id = $2 and day > current_date - 30 and host <> ''
     group by host having sum(views) > 0 order by 2 desc, 1 limit 8`,
    [spaceId, widgetId],
  );
  return { days, hosts };
}

// Views per widget over the last 30 days, for the widgets list.
export async function viewsByWidget(spaceId: string): Promise<Record<string, number>> {
  const rows = await q<{ widget_id: string; views: number }>(
    `select widget_id, sum(views)::int as views from widget_stats where space_id = $1 and day > current_date - 30 group by widget_id`,
    [spaceId],
  );
  return Object.fromEntries(rows.map((r) => [r.widget_id, r.views]));
}
