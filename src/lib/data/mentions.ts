import "server-only";
import { one, q } from "@/lib/db";

export type Mention = {
  id: string;
  platform: "hackernews";
  url: string;
  author: string;
  title: string;
  text: string;
  keyword: string;
  postedAt: string;
  status: "new" | "saved" | "dismissed";
};

export type MentionCounts = { new: number; saved: number; dismissed: number };

export type MentionSettings = {
  keywords: string[];
  digest: boolean;
  checkedAt: string | null;
  lastError: string | null;
};

type Row = Omit<Mention, "postedAt"> & { posted_at: string };

export async function mentionSettings(spaceId: string): Promise<MentionSettings> {
  const row = await one<{ keywords: string[]; digest: boolean; checked_at: string | null; last_error: string | null }>(
    "select keywords, digest, checked_at, last_error from mention_settings where space_id = $1",
    [spaceId],
  );
  return {
    keywords: row?.keywords ?? [],
    digest: row?.digest ?? true,
    checkedAt: row?.checked_at ? new Date(row.checked_at).toISOString() : null,
    lastError: row?.last_error ?? null,
  };
}

export async function listMentions(spaceId: string, status: Mention["status"]): Promise<{ items: Mention[]; counts: MentionCounts }> {
  const rows = await q<Row>(
    `select id, platform, url, author, title, text, keyword, posted_at, status from mentions
     where space_id = $1 and status = $2 order by posted_at desc limit 200`,
    [spaceId, status],
  );
  const counts = await one<MentionCounts>(
    `select count(*) filter (where status = 'new')::int as new, count(*) filter (where status = 'saved')::int as saved,
            count(*) filter (where status = 'dismissed')::int as dismissed
     from mentions where space_id = $1`,
    [spaceId],
  );
  return {
    items: rows.map(({ posted_at, ...r }) => ({ ...r, postedAt: new Date(posted_at).toISOString() })),
    counts: counts ?? { new: 0, saved: 0, dismissed: 0 },
  };
}
