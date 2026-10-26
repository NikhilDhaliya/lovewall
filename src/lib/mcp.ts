import "server-only";
import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { VerifiedKey } from "@/lib/api/keys";
import { createTestimonial, getTestimonial, listTestimonials, listWidgets, stats, updateMany, type Out } from "@/lib/api/service";
import type { ApiTestimonial } from "@/lib/api/shape";
import { logError } from "@/lib/log";

// The MCP server: the same operations as the REST API, as tools for Claude, ChatGPT, Cursor and other clients.
// One stateless server per request (Streamable HTTP; 2025 clients use the SDK's stateless fallback). The key was
// checked by the route; its space and scope arrive as authInfo. A read-only key gets only the read tools.

const INSTRUCTIONS = `Lovewall holds the testimonials of one space (a product or brand). New testimonials wait in the
inbox as "new" until approved; only approved ones show in widgets. Featured ones show first. Use search_testimonials
to find them, get_stats for an overview, and update_testimonials to approve, hide, feature or tag them.`;

function result(out: Out<unknown>, shape?: (data: unknown) => Record<string, unknown>): CallToolResult {
  if (!out.ok) return { content: [{ type: "text", text: out.message }], isError: true };
  const data = shape ? shape(out.data) : (out.data as Record<string, unknown>);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

// A shorter testimonial for lists (no files, no internal links).
const brief = (t: ApiTestimonial) => ({
  id: t.id,
  status: t.status,
  featured: t.featured,
  rating: t.rating,
  name: t.name,
  title: t.title,
  company: t.company,
  text: t.text,
  source: t.source,
  source_url: t.source_url,
  tags: t.tags,
  given_at: t.given_at,
});

const STATUS = z.enum(["new", "approved", "hidden"]);
const TAGS = z.array(z.string().max(32)).max(20);

export function buildServer(key: VerifiedKey) {
  const server = new McpServer({ name: "lovewall", title: "Lovewall", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const space = key.spaceId;
  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "search_testimonials",
    {
      title: "Search testimonials",
      description:
        "Find testimonials by words, status, rating, tag, source or featured. Newest first. Returns up to `limit` and a cursor for more.",
      inputSchema: z.object({
        query: z.string().max(100).optional().describe("Words to look for in the text, name, title or company"),
        status: z.enum(["new", "approved", "hidden", "all"]).optional().describe("Defaults to all"),
        rating: z.number().int().min(1).max(5).optional(),
        tag: z.string().max(32).optional(),
        source: z.string().max(32).optional().describe("Where it came from, e.g. Form, X, LinkedIn, API"),
        featured: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Defaults to 20"),
        cursor: z.string().max(120).optional().describe("next_cursor from a previous call"),
      }),
      annotations: read,
    },
    async (args) =>
      result(await listTestimonials(space, { ...args, q: args.query, limit: args.limit ?? 20 }, false), (d) => {
        const page = d as { data: ApiTestimonial[]; next_cursor: string | null };
        return { testimonials: page.data.map(brief), next_cursor: page.next_cursor };
      }),
  );

  server.registerTool(
    "get_testimonial",
    {
      title: "Get a testimonial",
      description: "One testimonial with everything: text, author, rating, status, tags, links to its photo or video.",
      inputSchema: z.object({ id: z.string().max(32) }),
      annotations: read,
    },
    async ({ id }) => result(await getTestimonial(space, id, key.scope === "write")),
  );

  server.registerTool(
    "list_widgets",
    {
      title: "List widgets",
      description: "The space's widgets (wall, carousel, marquee, single, badge) with their public page and embed code.",
      inputSchema: z.object({}),
      annotations: read,
    },
    async () => result(await listWidgets(space), (d) => ({ widgets: d })),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Get stats",
      description: "Counts by status, average rating, new testimonials in the last 7 and 30 days, sources and top tags.",
      inputSchema: z.object({}),
      annotations: read,
    },
    async () => result(await stats(space)),
  );

  if (key.scope !== "write") return server;

  server.registerTool(
    "update_testimonials",
    {
      title: "Update testimonials",
      description:
        "Approve, hide or reset to new, feature or unfeature, and add or remove tags on one or more testimonials. Approved ones appear in widgets.",
      inputSchema: z.object({
        ids: z.array(z.string().max(32)).min(1).max(100),
        status: STATUS.optional(),
        featured: z.boolean().optional(),
        add_tags: TAGS.optional(),
        remove_tags: TAGS.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => result(await updateMany(space, args), (d) => ({ updated: (d as ApiTestimonial[]).map(brief) })),
  );

  server.registerTool(
    "add_testimonial",
    {
      title: "Add a testimonial",
      description: "Add a testimonial by hand (e.g. from an email or a review). It arrives as new unless a status is given.",
      inputSchema: z.object({
        name: z.string().max(80),
        text: z.string().max(3000),
        title: z.string().max(80).optional(),
        company: z.string().max(80).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        source: z.string().max(32).optional().describe("Where it came from, e.g. Email, LinkedIn. Defaults to API"),
        source_url: z.string().max(500).optional().describe("https link to the original"),
        tags: TAGS.optional(),
        status: STATUS.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => result(await createTestimonial(space, args)),
  );

  return server;
}

export const mcpHandler = createMcpHandler(
  (ctx) => {
    const key = ctx.authInfo?.extra?.key as VerifiedKey | undefined;
    if (!key) throw new Error("No key");
    return buildServer(key);
  },
  { onerror: (error) => logError("mcp", error) },
);
