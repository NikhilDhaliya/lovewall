import "server-only";
import { q } from "@/lib/db";

// Maintenance for teams and billing: expired invites and old webhook receipts (Polar stops retrying within days).
export async function runAccountsJobs() {
  const invites = await q("delete from space_invites where expires_at < now() returning id");
  const events = await q("delete from billing_events where received_at < now() - interval '30 days' returning id");
  return { invitesRemoved: invites.length, billingEventsRemoved: events.length };
}
