import { keyed, send } from "@/lib/api/http";
import { spaceInfo } from "@/lib/api/service";

// The key's space: name, links, counts and rating. Also the cheapest way to check a key.
export async function GET(request: Request) {
  return keyed(request, "read", async (key) => send(await spaceInfo(key.spaceId)));
}
