import "server-only";
import { q } from "@/lib/db";
import { checkDue, sendDigests } from "@/lib/import/mentions";
import { recheckDue } from "@/lib/import/recheck";
import { syncDue } from "@/lib/import/sync";

// Import jobs for the maintenance cron: synced feeds due for their daily run, the weekly look at oEmbed posts,
// mention searches, digests, and mentions older than 90 days that weren't saved as testimonials. Each part is capped
// so one run stays short.
export async function runImportJobs() {
  const sync = await syncDue();
  const recheck = await recheckDue();
  const mentions = await checkDue();
  const digests = await sendDigests();
  await q("delete from mentions where status <> 'saved' and created_at < now() - interval '90 days'");
  return { sync, recheck, mentions, digests };
}
