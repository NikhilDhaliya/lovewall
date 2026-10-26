import "server-only";
import { q } from "@/lib/db";
import { trash } from "@/lib/data/trash";
import { LEGAL } from "@/lib/legal/config";

// Maintenance for abuse limits, run by the maintenance cron: files nobody attached to anything (a public form's uploads
// count against byte budgets for an hour, so they don't need to stay long), and the hosted sign-up history.
export async function runSecurityJobs() {
  const r = LEGAL.retention;
  const stale = await q<{ key: string }>(
    "delete from uploads where claimed_at is null and created_at < now() - make_interval(hours => $1) returning key",
    [r.unclaimedUploadHours],
  );
  await trash(stale.map((row) => row.key));
  await q("delete from signup_history where deleted_at < now() - make_interval(days => $1)", [r.signupHistoryDays]);
  return { uploadsRemoved: stale.length };
}
