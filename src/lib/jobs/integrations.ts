import "server-only";
import { q } from "@/lib/db";
import { deliverDue } from "@/lib/webhooks";

// Maintenance for integrations: retry webhook deliveries that are due, forget old ones. Kept short for serverless.
export async function runIntegrationsJobs() {
  const webhooks = await deliverDue(50);
  // Deliveries hold testimonial data: kept 30 days for the log, then deleted. (Revoked keys are deleted at once.)
  await q("delete from webhook_deliveries where created_at < now() - interval '30 days'");
  return { webhooks };
}
