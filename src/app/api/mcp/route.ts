import { apiError, authorize } from "@/lib/api/http";
import { mcpHandler } from "@/lib/mcp";
import { logError } from "@/lib/log";

// MCP over Streamable HTTP, authorized with an API key: `Authorization: Bearer lw_...`. Clients that can't send
// headers may put the key in the URL instead (`/api/mcp?key=lw_...`); use a dedicated key for those.
async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const fromUrl = url.searchParams.get("key");
    let req = request;
    if (fromUrl && !request.headers.has("authorization")) {
      const headers = new Headers(request.headers);
      headers.set("authorization", `Bearer ${fromUrl}`);
      url.searchParams.delete("key");
      req = new Request(url, { method: request.method, headers, body: request.body, duplex: "half" } as RequestInit);
    }
    const auth = await authorize(req, "read");
    if (auth instanceof Response) return auth;
    const res = await mcpHandler.fetch(req, {
      authInfo: { token: "", clientId: auth.key.id, scopes: [auth.key.scope], extra: { key: auth.key } },
    });
    for (const [name, value] of Object.entries(auth.headers)) res.headers.set(name, value);
    return res;
  } catch (error) {
    logError("mcp", error);
    return apiError("server_error", "Something went wrong", 500);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
