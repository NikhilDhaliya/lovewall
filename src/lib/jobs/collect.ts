import "server-only";
import { q } from "@/lib/db";
import { sendDueReminders } from "@/lib/invites";

// Collect's part of the maintenance cron: invite reminders, and old spin tokens that can no longer be used.
export async function runCollectJobs() {
  const reminders = await sendDueReminders(50);
  await q("update reward_claims set token_hash = null where token_hash is not null and created_at < now() - interval '2 days'");
  return { reminders };
}
