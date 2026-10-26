import { keyed, send } from "@/lib/api/http";
import { listWidgets } from "@/lib/api/service";

export async function GET(request: Request) {
  return keyed(request, "read", async (key) => send(await listWidgets(key.spaceId)));
}
