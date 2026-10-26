import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncSubscriptions } from "@/lib/polar";
import { rateLimit } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { logError } from "@/lib/log";

// Polar sends the customer here after checkout. The webhook may not have arrived yet, so pull the subscription now
// (the success redirect itself proves nothing; only Polar's answer counts), then show the account page.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${env.appUrl}/login?next=${encodeURIComponent("/app/settings")}`);
  if (env.billing && (await rateLimit(`billing-sync:${user.id}`, 10, 600)).ok) {
    await syncSubscriptions(user.id).catch((error) => logError("billing: sync after checkout", error));
  }
  return NextResponse.redirect(`${env.appUrl}/app/settings?subscribed=1#billing`);
}
