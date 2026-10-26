import { keyed, send } from "@/lib/api/http";
import { listTags } from "@/lib/api/service";

export async function GET(request: Request) {
  return keyed(request, "read", async (key) => send(await listTags(key.spaceId)));
}
