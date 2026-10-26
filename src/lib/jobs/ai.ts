import "server-only";
import { runDueJobs, queueTranslations } from "@/lib/ai/jobs";
import { anyAi } from "@/lib/ai/settings";
import { q } from "@/lib/db";

// AI jobs for the maintenance cron: retries of background work (analysis, transcripts, screenshots), translations
// for widgets shown in another language, and old bookkeeping. Each run stays short.
export async function runAiJobs() {
  await q("delete from ai_jobs where done_at < now() - interval '7 days' or created_at < now() - interval '14 days'");
  await q("delete from ai_usage where day < current_date - 60");
  if (!anyAi()) return { queued: 0, ran: 0 };
  const queued = await queueTranslations(null, 100, { run: false });
  const ran = await runDueJobs();
  return { queued, ran };
}
