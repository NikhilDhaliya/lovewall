import { keyed, readJson, send } from "@/lib/api/http";
import { subscribe } from "@/lib/api/service";

// REST Hooks subscribe (Zapier, Make): { target_url, event }. Events are POSTed to target_url, signed.
export async function POST(request: Request) {
  return keyed(request, "read", async (key) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    return send(await subscribe(key, body.body), 201);
  });
}
