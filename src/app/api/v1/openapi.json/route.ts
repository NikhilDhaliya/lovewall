import { openapiDocument } from "@/lib/api/openapi";

// Built once at build time (static, so no rate limit needed); open to any origin so API tools can load it.
export const dynamic = "force-static";

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export function GET() {
  return Response.json(openapiDocument(appUrl), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
