import { keyed, readJson, send, sendList } from "@/lib/api/http";
import { createTestimonial, listTestimonials } from "@/lib/api/service";

export async function GET(request: Request) {
  return keyed(request, "read", async (key) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return sendList(await listTestimonials(key.spaceId, params, key.scope === "write"));
  });
}

export async function POST(request: Request) {
  return keyed(request, "write", async (key) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    return send(await createTestimonial(key.spaceId, body.body), 201);
  });
}
