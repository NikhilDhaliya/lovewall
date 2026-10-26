import "server-only";
import { one, q } from "@/lib/db";
import { newId } from "@/lib/ids";
import { appLink, mentionsDigestMail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { getJson } from "./http";
import { clip, htmlText, isoDate } from "./parse";
import { BlockedError, ImportError } from "./types";

// Mentions: each space's keywords, searched on Hacker News (Algolia, newest first) and Reddit (search.json). New
// ones wait in the Mentions list; a daily digest email lists them.

export type MentionPlatform = "hackernews" | "reddit";
export type FoundMention = {
  platform: MentionPlatform;
  externalId: string;
  url: string;
  author: string;
  title: string;
  text: string;
  keyword: string;
  postedAt: string;
};

type HnHit = {
  objectID?: string;
  author?: string;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  story_text?: string | null;
  created_at?: string;
};

type RedditChild = { data?: { id?: string; title?: string; selftext?: string; author?: string; permalink?: string; created_utc?: number } };

// Algolia and Reddit match loosely (stems, other fields): keep only posts that contain the keyword itself.
export function mentionsKeyword(text: string, keyword: string) {
  const k = keyword.trim().toLowerCase();
  return Boolean(k) && text.toLowerCase().includes(k);
}

export function hnMentions(hits: HnHit[], keyword: string): FoundMention[] {
  const out: FoundMention[] = [];
  for (const h of hits) {
    const text = htmlText(h.comment_text ?? h.story_text ?? "");
    const title = htmlText(h.title ?? h.story_title ?? "");
    const date = isoDate(h.created_at);
    if (!h.objectID || !h.author || !date || !mentionsKeyword(`${h.title ?? ""} ${text}`, keyword)) continue;
    out.push({
      platform: "hackernews",
      externalId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: clip(h.author, 80),
      title: clip(title, 200),
      text: clip(text || title, 3000),
      keyword,
      postedAt: date,
    });
  }
  return out;
}

export function redditMentions(children: RedditChild[], keyword: string): FoundMention[] {
  const out: FoundMention[] = [];
  for (const c of children) {
    const d = c.data ?? {};
    const date = isoDate(Number(d.created_utc));
    const text = String(d.selftext ?? "").trim();
    if (!d.id || !d.permalink?.startsWith("/") || !date || !d.author || d.author === "[deleted]") continue;
    if (!mentionsKeyword(`${d.title ?? ""} ${text}`, keyword)) continue;
    out.push({
      platform: "reddit",
      externalId: d.id,
      url: `https://www.reddit.com${d.permalink}`,
      author: clip(d.author, 80),
      title: clip(d.title, 200),
      text: clip(text || d.title, 3000),
      keyword,
      postedAt: date,
    });
  }
  return out;
}

export async function searchMentions(keywords: string[], since: Date) {
  const found: FoundMention[] = [];
  const errors: string[] = [];
  let answered = 0;
  const after = Math.floor(since.getTime() / 1000);
  for (const keyword of keywords.slice(0, 5)) {
    const query = encodeURIComponent(`"${keyword}"`);
    try {
      const hn = await getJson<{ hits?: HnHit[] }>(
        "Hacker News",
        `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=(story,comment)&numericFilters=created_at_i%3E${after}&hitsPerPage=50`,
      );
      found.push(...hnMentions(hn.hits ?? [], keyword));
      answered++;
    } catch (error) {
      errors.push(error instanceof ImportError || error instanceof BlockedError ? error.message : "Hacker News failed");
    }
    try {
      const rd = await getJson<{ data?: { children?: RedditChild[] } }>(
        "Reddit",
        `https://www.reddit.com/search.json?q=${query}&sort=new&t=week&limit=50&raw_json=1`,
      );
      found.push(...redditMentions(rd.data?.children ?? [], keyword).filter((m) => m.postedAt > since.toISOString()));
      answered++;
    } catch (error) {
      errors.push(error instanceof ImportError || error instanceof BlockedError ? error.message : "Reddit failed");
    }
  }
  return { found, errors: [...new Set(errors)], answered };
}

type Settings = { space_id: string; keywords: string[]; checked_at: string | null; failures: number };

// Checks one space: new mentions are stored (duplicates skipped), the next check is in about six hours.
export async function checkSpace(s: Settings): Promise<{ added: number; error: string | null }> {
  const since = s.checked_at ? new Date(new Date(s.checked_at).getTime() - 3600_000) : new Date(Date.now() - 7 * 86400_000);
  const { found, errors, answered } = await searchMentions(s.keywords, since);
  let added = 0;
  for (const m of found) {
    const row = await one(
      `insert into mentions (id, space_id, platform, external_id, url, author, title, text, keyword, posted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict do nothing returning id`,
      [newId(12), s.space_id, m.platform, m.externalId, m.url, m.author, m.title, m.text, m.keyword, m.postedAt],
    );
    if (row) added++;
  }
  // Nothing answering backs off; one platform failing (Reddit often refuses servers) is only reported.
  const failed = answered === 0;
  const error = errors.length ? errors.join(" · ").slice(0, 200) : null;
  await q(
    `update mention_settings set checked_at = case when $2 then checked_at else now() end, last_error = $3,
       failures = case when $2 then failures + 1 else 0 end,
       next_check_at = now() + case when $2 then make_interval(hours => least(power(2, failures + 1)::int, 48)) else interval '6 hours' end
     where space_id = $1`,
    [s.space_id, failed, error],
  );
  return { added, error };
}

export async function checkDue(limit = 4, budgetMs = 15_000) {
  const started = Date.now();
  const rows = await q<Settings>(
    `update mention_settings set next_check_at = now() + interval '30 minutes'
     where space_id in (select space_id from mention_settings where cardinality(keywords) > 0 and next_check_at <= now()
                        order by next_check_at limit $1 for update skip locked)
     returning space_id, keywords, checked_at, failures`,
    [limit],
  );
  let checked = 0;
  let added = 0;
  for (const s of rows) {
    if (Date.now() - started > budgetMs) {
      await q("update mention_settings set next_check_at = now() where space_id = $1", [s.space_id]);
      continue;
    }
    added += (await checkSpace(s)).added;
    checked++;
  }
  return { checked, added };
}

// One digest a day per space, when there are new mentions it hasn't mailed yet.
export async function sendDigests(limit = 20) {
  const spaces = await q<{ space_id: string; name: string; owner_email: string }>(
    `select m.space_id, s.name, u.email as owner_email
     from mention_settings m join spaces s on s.id = m.space_id join auth_users u on u.id = s.owner_id
     where m.digest and (m.digest_at is null or m.digest_at < now() - interval '20 hours')
       and exists (select 1 from mentions x where x.space_id = m.space_id and x.status = 'new' and not x.notified)
     limit $1`,
    [limit],
  );
  let sent = 0;
  for (const s of spaces) {
    const items = await q<{ id: string; platform: MentionPlatform; author: string; title: string; text: string; url: string }>(
      `update mentions set notified = true where id in (
         select id from mentions where space_id = $1 and status = 'new' and not notified order by posted_at desc limit 50
       ) returning id, platform, author, title, text, url`,
      [s.space_id],
    );
    await q("update mention_settings set digest_at = now() where space_id = $1", [s.space_id]);
    if (!items.length) continue;
    const id = await enqueue(
      mentionsDigestMail({ to: s.owner_email, space: s.name, items, url: appLink(`/app/${s.space_id}/mentions`) }),
    ).catch(() => null);
    if (id) {
      await flushOne(id).catch(() => {});
      sent++;
    }
  }
  return { sent };
}
