import "server-only";
import { q } from "@/lib/db";
import { checkDue, sendDigests } from "@/lib/import/mentions";
import { syncDue } from "@/lib/import/sync";

// Import jobs for the maintenance cron: connected sources due for their daily sync, mention searches, digests, and
// old dismissed mentions. Each part is capped so one run stays short.
export async function runImportJobs() {
  const sync = await syncDue();
  const mentions = await checkDue();
  const digests = await sendDigests();
  await q("delete from mentions where status = 'dismissed' and created_at < now() - interval '90 days'");
  return { sync, mentions, digests };
}
