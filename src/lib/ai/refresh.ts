import "server-only";
import { revalidateTag } from "next/cache";
import { q } from "@/lib/db";

// Background work changes what widgets show (best line, captions, translations, transcripts): expire their cached
// payloads. Route handlers, after() and the cron can't use updateTag.
export async function expireWidgets(spaceId: string) {
  try {
    const rows = await q<{ id: string }>("select id from widgets where space_id = $1", [spaceId]);
    for (const r of rows) revalidateTag(`widget:${r.id}`, { expire: 0 });
  } catch {
    // Outside a request (scripts) there is no cache to expire.
  }
}
