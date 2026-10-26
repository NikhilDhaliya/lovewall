import { timingSafeEqual } from "node:crypto";
import { q } from "@/lib/db";
import { emptyTrash } from "@/lib/data/trash";
import { runIntegrationsJobs } from "@/lib/jobs/integrations";
import { runAccountsJobs } from "@/lib/jobs/accounts";
import { runAiJobs } from "@/lib/jobs/ai";
import { runCollectJobs } from "@/lib/jobs/collect";
import { runImportJobs } from "@/lib/jobs/import";
import { runPrivacyJobs } from "@/lib/jobs/privacy";
import { runSecurityJobs } from "@/lib/jobs/security";
import { runShowJobs } from "@/lib/jobs/show";
import { flushDue } from "@/lib/outbox";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Vercel Cron (vercel.json) or any scheduler: retries mail, deletes abandoned uploads (after 3 hours) and old counters.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const mail = await flushDue();
  const security = await runSecurityJobs();
  const files = await emptyTrash();
  await q("delete from rate_limits where reset_at < now() - interval '1 hour'");
  await q(`delete from auth_rate_limits where "lastRequest" < $1`, [Date.now() - 24 * 3600 * 1000]);
  await q(`delete from auth_verifications where "expiresAt" < now() - interval '1 day'`);
  await runAccountsJobs();
  await q(
    "delete from email_outbox where (sent_at is not null and sent_at < now() - interval '7 days') or created_at < now() - interval '30 days'",
  );
  await runCollectJobs();
  await runShowJobs();
  const integrations = await runIntegrationsJobs();
  const imports = await runImportJobs();
  const ai = await runAiJobs();
  const privacy = await runPrivacyJobs();
  return Response.json({ mail, uploadsRemoved: security.uploadsRemoved, files, integrations, imports, ai, privacy });
}
