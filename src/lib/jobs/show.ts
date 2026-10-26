import "server-only";
import { q } from "@/lib/db";

// Widget analytics keep about a year of daily rows.
export async function runShowJobs() {
  const old = await q("delete from widget_stats where day < current_date - 400 returning 1");
  return { statsRemoved: old.length };
}
