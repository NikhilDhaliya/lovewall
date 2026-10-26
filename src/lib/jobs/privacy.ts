import "server-only";
import { q } from "@/lib/db";
import { LEGAL } from "@/lib/legal/config";
import { storageConfigured } from "@/lib/storage";

// Retention the privacy policy promises (periods in src/lib/legal/config.ts), for the maintenance cron.
export async function runPrivacyJobs() {
  const r = LEGAL.retention;
  // Invitation opens and clicks are forgotten after 90 days (the invite itself stays, so opt-outs keep working).
  const invites = await q(
    `update invites set opened_at = null, clicked_at = null
     where (opened_at is not null or clicked_at is not null) and coalesce(sent_at, created_at) < now() - make_interval(days => $1) returning id`,
    [r.inviteTrackingDays],
  );
  await q("delete from form_views where day < current_date - $1::int", [r.widgetStatsDays]);
  await q("delete from audit_log where created_at < now() - make_interval(days => $1)", [r.auditLogDays]);
  await q("delete from reports where resolved_at < now() - make_interval(days => $1)", [r.resolvedReportDays]);
  await q("delete from giver_links where expires_at < now()");
  await q(`delete from auth_sessions where "expiresAt" < now()`);
  // Without file storage there is nothing to delete files from: the queue would only grow.
  if (!storageConfigured()) await q("delete from storage_trash");
  return { inviteTrackingCleared: invites.length };
}
