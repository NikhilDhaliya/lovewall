import { EVENTS } from "@/lib/webhook-events";

// The OpenAPI 3.1 description of the REST API (served at /api/v1/openapi.json). Keep it in step with
// src/lib/api/service.ts and the docs page (/docs/api).

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });
const json = (schema: unknown) => ({ "application/json": { schema } });
const ok = (description: string, schema: unknown) => ({ description, content: json(schema) });
const data = (schema: unknown) => ({ type: "object", required: ["data"], properties: { data: schema } });
const errors = (...codes: (401 | 403 | 404 | 409 | 422 | 429)[]) =>
  Object.fromEntries(
    codes.map((c) => [
      String(c),
      {
        $ref: `#/components/responses/${{ 401: "Unauthorized", 403: "Forbidden", 404: "NotFound", 409: "Conflict", 422: "Invalid", 429: "RateLimited" }[c]}`,
      },
    ]),
  );
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[0-9A-Za-z]{8,32}$" } };

const testimonialFields = {
  name: { type: "string", maxLength: 80, examples: ["Ada Lovelace"] },
  text: { type: "string", maxLength: 3000, examples: ["We set it up in ten minutes."] },
  title: nullable("string", { maxLength: 80, examples: ["Founder"] }),
  company: nullable("string", { maxLength: 80, examples: ["Analytical Engines"] }),
  handle: nullable("string", { maxLength: 60, description: "Social handle, without @" }),
  email: nullable("string", { format: "email", description: "The giver's email. Only returned to read and write keys." }),
  rating: nullable("integer", { minimum: 1, maximum: 5 }),
  source: { type: "string", maxLength: 32, description: "Where it came from: Form, X, LinkedIn, API...", examples: ["LinkedIn"] },
  source_url: nullable("string", { format: "uri", description: "https link to the original. Unique per space." }),
  given_at: { type: "string", format: "date-time" },
  tags: { type: "array", items: { type: "string", maxLength: 32 }, maxItems: 20 },
  status: { type: "string", enum: ["new", "approved", "hidden"] },
  featured: { type: "boolean" },
};

export function openapiDocument(appUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Lovewall API",
      version: "1.0.0",
      summary: "Read and manage a space's testimonials and widgets.",
      description: `Every request needs an API key from Settings → API keys: \`Authorization: Bearer lw_...\`. A key belongs to one space. Read-only keys can't change anything. Limits: 120 requests a minute per key. Docs: ${appUrl}/docs/api`,
      license: { name: "AGPL-3.0-or-later", identifier: "AGPL-3.0-or-later" },
    },
    servers: [{ url: `${appUrl}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: [
      { name: "Testimonials" },
      { name: "Widgets" },
      { name: "Space" },
      { name: "Hooks", description: "REST Hooks for Zapier, Make and similar tools" },
    ],
    paths: {
      "/space": {
        get: {
          tags: ["Space"],
          operationId: "getSpace",
          summary: "The key's space",
          responses: { "200": ok("The space", data(ref("Space"))), ...errors(401, 429) },
        },
      },
      "/testimonials": {
        get: {
          tags: ["Testimonials"],
          operationId: "listTestimonials",
          summary: "List testimonials",
          description: "Newest first. Pass `next_cursor` back as `cursor` for the next page.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["new", "approved", "hidden", "all"], default: "all" } },
            {
              name: "q",
              in: "query",
              description: "Words in the text, name, title or company",
              schema: { type: "string", maxLength: 100 },
            },
            { name: "tag", in: "query", schema: { type: "string" } },
            { name: "source", in: "query", schema: { type: "string" } },
            { name: "rating", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } },
            { name: "featured", in: "query", schema: { type: "boolean" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": ok("A page of testimonials", {
              type: "object",
              required: ["data", "next_cursor"],
              properties: { data: { type: "array", items: ref("Testimonial") }, next_cursor: nullable("string") },
            }),
            ...errors(401, 422, 429),
          },
        },
        post: {
          tags: ["Testimonials"],
          operationId: "createTestimonial",
          summary: "Create a testimonial",
          description: "Needs a read and write key. Arrives as `new` unless `status` says otherwise.",
          requestBody: { required: true, content: json(ref("TestimonialInput")) },
          responses: { "201": ok("Created", data(ref("Testimonial"))), ...errors(401, 403, 409, 422, 429) },
        },
      },
      "/testimonials/{id}": {
        parameters: [idParam],
        get: {
          tags: ["Testimonials"],
          operationId: "getTestimonial",
          summary: "Get a testimonial",
          responses: { "200": ok("The testimonial", data(ref("Testimonial"))), ...errors(401, 404, 429) },
        },
        patch: {
          tags: ["Testimonials"],
          operationId: "updateTestimonial",
          summary: "Update a testimonial",
          description: "Only the fields you send change. `null` clears an optional field. `tags` replaces the list.",
          requestBody: { required: true, content: json(ref("TestimonialPatch")) },
          responses: { "200": ok("Updated", data(ref("Testimonial"))), ...errors(401, 403, 404, 409, 422, 429) },
        },
        delete: {
          tags: ["Testimonials"],
          operationId: "deleteTestimonial",
          summary: "Delete a testimonial",
          description: "Also deletes its photo and video. Can't be undone.",
          responses: {
            "200": ok(
              "Deleted",
              data({ type: "object", properties: { id: { type: "string" }, deleted: { type: "boolean", const: true } } }),
            ),
            ...errors(401, 403, 404, 429),
          },
        },
      },
      ...Object.fromEntries(
        (
          [
            ["approve", "Approve (it shows in widgets)"],
            ["hide", "Hide"],
            ["feature", "Feature (shows first)"],
            ["unfeature", "Unfeature"],
          ] as const
        ).map(([action, summary]) => [
          `/testimonials/{id}/${action}`,
          {
            parameters: [idParam],
            post: {
              tags: ["Testimonials"],
              operationId: `${action}Testimonial`,
              summary,
              responses: { "200": ok("The testimonial", data(ref("Testimonial"))), ...errors(401, 403, 404, 429) },
            },
          },
        ]),
      ),
      "/testimonials/{id}/tags": {
        parameters: [idParam],
        post: {
          tags: ["Testimonials"],
          operationId: "tagTestimonial",
          summary: "Add or remove tags",
          requestBody: {
            required: true,
            content: json({
              type: "object",
              properties: { add: testimonialFields.tags, remove: testimonialFields.tags },
              examples: [{ add: ["pricing"], remove: ["draft"] }],
            }),
          },
          responses: { "200": ok("The testimonial", data(ref("Testimonial"))), ...errors(401, 403, 404, 422, 429) },
        },
      },
      "/tags": {
        get: {
          tags: ["Testimonials"],
          operationId: "listTags",
          summary: "Tags in use, with counts",
          responses: {
            "200": ok(
              "Tags",
              data({
                type: "array",
                items: { type: "object", properties: { tag: { type: "string" }, count: { type: "integer" } } },
              }),
            ),
            ...errors(401, 429),
          },
        },
      },
      "/widgets": {
        get: {
          tags: ["Widgets"],
          operationId: "listWidgets",
          summary: "List widgets",
          responses: { "200": ok("Widgets", data({ type: "array", items: ref("Widget") })), ...errors(401, 429) },
        },
      },
      "/widgets/{id}": {
        parameters: [idParam],
        get: {
          tags: ["Widgets"],
          operationId: "getWidget",
          summary: "Get a widget",
          description:
            "With a key: the widget. Without a key this URL is the widget's public JSON (the approved testimonials it shows, CORS open) for custom designs.",
          responses: { "200": ok("The widget", data(ref("Widget"))), ...errors(401, 404, 429) },
        },
      },
      "/hooks": {
        post: {
          tags: ["Hooks"],
          operationId: "subscribe",
          summary: "Subscribe to an event (REST Hooks)",
          description:
            "Lovewall POSTs each event to `target_url`, signed like any webhook. Answer 410 to unsubscribe. The subscription is removed with its key.",
          requestBody: { required: true, content: json(ref("HookInput")) },
          responses: { "201": ok("Subscribed", data(ref("Hook"))), ...errors(401, 409, 422, 429) },
        },
      },
      "/hooks/{id}": {
        parameters: [idParam],
        delete: {
          tags: ["Hooks"],
          operationId: "unsubscribe",
          summary: "Unsubscribe",
          responses: {
            "200": ok(
              "Removed",
              data({ type: "object", properties: { id: { type: "string" }, deleted: { type: "boolean", const: true } } }),
            ),
            ...errors(401, 404, 429),
          },
        },
      },
    },
    webhooks: Object.fromEntries(
      EVENTS.map((event) => [
        event,
        {
          post: {
            summary: event,
            description:
              "Sent to your endpoint with Standard Webhooks headers: `webhook-id`, `webhook-timestamp` and `webhook-signature` (v1, HMAC-SHA256 of `id.timestamp.body` with the base64 part of your `whsec_` secret). Answer 2xx within 10 seconds; anything else is retried for about 30 hours.",
            requestBody: { content: json(ref("Event")) },
            responses: { "200": { description: "Received" } },
          },
        },
      ]),
    ),
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "An API key from Settings → API keys (lw_...)" },
      },
      schemas: {
        Testimonial: {
          type: "object",
          required: ["id", "status", "featured", "text", "name", "source", "tags", "given_at", "created_at", "updated_at"],
          properties: {
            id: { type: "string", examples: ["k3Jd8sLq2PzA"] },
            ...testimonialFields,
            avatar_url: nullable("string", { format: "uri" }),
            video_url: nullable("string", { format: "uri" }),
            image_url: nullable("string", { format: "uri" }),
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            inbox_url: { type: "string", format: "uri" },
          },
        },
        TestimonialInput: {
          type: "object",
          required: ["name", "text"],
          properties: {
            ...testimonialFields,
            source: { ...testimonialFields.source, default: "API" },
            status: { ...testimonialFields.status, default: "new" },
            avatar_url: { type: "string", format: "uri", description: "https image, copied into Lovewall" },
          },
        },
        TestimonialPatch: { type: "object", properties: testimonialFields },
        Widget: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["wall", "carousel", "marquee", "single", "badge"] },
            config: { type: "object" },
            page_url: { type: "string", format: "uri" },
            embed_url: { type: "string", format: "uri" },
            embed_html: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Space: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            website: nullable("string"),
            collect_url: { type: "string", format: "uri" },
            inbox_url: { type: "string", format: "uri" },
            counts: {
              type: "object",
              properties: {
                new: { type: "integer" },
                approved: { type: "integer" },
                hidden: { type: "integer" },
                total: { type: "integer" },
              },
            },
            rating: { type: "object", properties: { average: nullable("number"), count: { type: "integer" } } },
          },
        },
        HookInput: {
          type: "object",
          required: ["target_url"],
          properties: {
            target_url: { type: "string", format: "uri", description: "https URL to POST events to" },
            event: { type: "string", enum: [...EVENTS], default: "testimonial.created" },
          },
        },
        Hook: {
          type: "object",
          properties: {
            id: { type: "string" },
            target_url: { type: "string", format: "uri" },
            event: { type: "string", enum: [...EVENTS] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Event: {
          type: "object",
          required: ["type", "timestamp", "data"],
          properties: {
            type: { type: "string", enum: [...EVENTS, "webhook.test"] },
            timestamp: { type: "string", format: "date-time" },
            data: ref("Testimonial"),
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: ["invalid", "unauthorized", "forbidden", "not_found", "conflict", "too_large", "rate_limited", "server_error"],
                },
                message: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        Unauthorized: ok("Missing or invalid key", ref("Error")),
        Forbidden: ok("The key is read-only", ref("Error")),
        NotFound: ok("Not found in this space", ref("Error")),
        Conflict: ok("Already exists (e.g. the same source_url)", ref("Error")),
        Invalid: ok("A field is invalid; the message names it", ref("Error")),
        RateLimited: ok("Too many requests; see Retry-After", ref("Error")),
      },
    },
  };
}
