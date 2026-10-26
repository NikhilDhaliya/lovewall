import { accountExport } from "@/lib/data/account-export";
import { audit } from "@/lib/privacy";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";

// The signed-in account's data, as one JSON file (Account settings > Export data).
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  const limit = await rateLimit(`account-export:${user.id}`, 5, 3600);
  if (!limit.ok) return tooMany(limit);
  const data = await accountExport(user);
  await audit({ spaceId: null, actorId: user.id, action: "account.export", detail: { spaces: data.spaces.length } });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lovewall-account-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
