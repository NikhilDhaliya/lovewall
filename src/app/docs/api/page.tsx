import type { Metadata } from "next";
import { A, C, Code, DocPage, Endpoint, H2, H3, P, Table } from "@/components/docs/site";

export const metadata: Metadata = {
  title: "API",
  description: "Lovewall's REST API, webhooks, REST Hooks for Zapier and Make, and the OpenAPI document.",
  alternates: { canonical: "/docs/api" },
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const base = `${appUrl}/api/v1`;

const TESTIMONIAL = `{
  "id": "k3Jd8sLq2PzA",
  "status": "approved",
  "featured": false,
  "rating": 5,
  "text": "We set it up in ten minutes.",
  "name": "Ada Lovelace",
  "title": "Founder",
  "company": "Analytical Engines",
  "handle": null,
  "email": "ada@example.com",
  "avatar_url": "${appUrl}/api/files/spaces/…/avatar/….jpg",
  "video_url": null,
  "image_url": null,
  "source": "Form",
  "source_url": null,
  "tags": ["pricing"],
  "given_at": "2026-10-26T10:00:00.000Z",
  "created_at": "2026-10-26T10:00:00.000Z",
  "updated_at": "2026-10-26T10:00:00.000Z",
  "inbox_url": "${appUrl}/app/…"
}`;

const VERIFY = `import crypto from "node:crypto";

// secret: the whsec_... value shown when you added the endpoint.
export function verify(secret, headers, rawBody) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // older than 5 minutes
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(\`\${id}.\${timestamp}.\${rawBody}\`).digest("base64");
  return headers["webhook-signature"].split(" ").some((sig) => {
    const [version, value] = sig.split(",");
    return version === "v1" && value.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });
}`;

const TOC = [
  { id: "auth", label: "Authentication" },
  { id: "errors", label: "Errors and limits" },
  { id: "testimonials", label: "Testimonials" },
  { id: "widgets", label: "Widgets" },
  { id: "space", label: "Space" },
  { id: "webhooks", label: "Webhooks" },
  { id: "rest-hooks", label: "Zapier and Make" },
  { id: "openapi", label: "OpenAPI" },
];

export default function ApiDocs() {
  return (
    <DocPage title="API" lead="Read and manage your testimonials from code. JSON over HTTPS, one key per app." toc={TOC}>
      <P>
        Base URL: <C>{base}</C>
      </P>

      <H2 id="auth">Authentication</H2>
      <P>
        Create a key in your space’s <strong className="font-medium">Settings → API keys</strong>. It’s shown once. Send it as a Bearer token.
        A key belongs to one space; <em>read only</em> keys can’t change anything.
      </P>
      <Code label="curl" code={`curl ${base}/testimonials?status=approved \\\n  -H "Authorization: Bearer lw_your_key"`} />
      <P>Keep keys on your server. Browsers can’t call the API with a key (no CORS); use the widget or its public JSON there.</P>

      <H2 id="errors">Errors and limits</H2>
      <P>Errors come with an HTTP status and a body you can show:</P>
      <Code code={`{ "error": { "code": "invalid", "message": "rating: Too big: expected number to be <=5" } }`} />
      <Table
        head={["Status", "Code", "When"]}
        rows={[
          ["401", "unauthorized", "Missing, wrong or revoked key"],
          ["403", "forbidden", "A read-only key tried to change something"],
          ["404", "not_found", "Not in this key’s space"],
          ["409", "conflict", "That source_url is already in the space"],
          ["422", "invalid", "A field is wrong; the message names it"],
          ["429", "rate_limited", "Too many requests; wait for Retry-After seconds"],
        ]}
      />
      <P>
        Each key can make 120 requests a minute. Every answer has <C>X-RateLimit-Remaining</C>. Lists are cursor-paginated: pass{" "}
        <C>next_cursor</C> back as <C>cursor</C> until it is <C>null</C>.
      </P>

      <H2 id="testimonials">Testimonials</H2>
      <P>Every testimonial looks like this:</P>
      <Code code={TESTIMONIAL} label="Testimonial" />
      <P>
        <C>status</C> is <C>new</C> (waiting in the inbox), <C>approved</C> (shown in widgets) or <C>hidden</C>. Featured ones show first.{" "}
        <C>email</C> is only sent to read and write keys; read-only keys, webhooks and chat messages never get it.
      </P>

      <Endpoint id="list" method="GET" path="/testimonials">
        <P>Newest first.</P>
        <Table
          head={["Query", "Meaning"]}
          rows={[
            ["status", "new, approved, hidden or all (default)"],
            ["q", "Words in the text, name, title or company"],
            ["tag, source, rating", "Exact matches"],
            ["featured", "true or false"],
            ["limit", "1 to 100, default 25"],
            ["cursor", "next_cursor from the previous page"],
          ]}
        />
        <Code code={`{ "data": [ … ], "next_cursor": "MjAyNi0xMC0yNlQxMDow…" }`} />
      </Endpoint>

      <Endpoint id="create" method="POST" path="/testimonials">
        <P>
          Needs a read and write key. <C>name</C> and <C>text</C> are required. It arrives as <C>new</C> unless you send a <C>status</C>.{" "}
          <C>avatar_url</C> (https) is copied into Lovewall.
        </P>
        <Code
          label="curl"
          code={`curl -X POST ${base}/testimonials \\
  -H "Authorization: Bearer lw_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Grace Hopper",
    "title": "Rear Admiral",
    "text": "It just works.",
    "rating": 5,
    "source": "LinkedIn",
    "source_url": "https://www.linkedin.com/posts/…",
    "tags": ["launch"]
  }'`}
        />
        <P>
          Answers <C>201</C> with <C>{"{ data: Testimonial }"}</C>. Other fields: <C>company</C>, <C>handle</C>, <C>email</C>, <C>given_at</C>,{" "}
          <C>featured</C>.
        </P>
      </Endpoint>

      <Endpoint id="get" method="GET" path="/testimonials/{id}" />

      <Endpoint id="update" method="PATCH" path="/testimonials/{id}">
        <P>
          Send only what changes. <C>null</C> clears an optional field; <C>tags</C> replaces the list.
        </P>
        <Code code={`{ "status": "approved", "featured": true, "title": "CTO" }`} />
      </Endpoint>

      <Endpoint id="delete" method="DELETE" path="/testimonials/{id}">
        <P>Deletes it with its photo and video. Can’t be undone.</P>
      </Endpoint>

      <Endpoint id="actions" method="POST" path="/testimonials/{id}/approve · /hide · /feature · /unfeature">
        <P>Shortcuts with no body. Each answers with the testimonial.</P>
      </Endpoint>

      <Endpoint id="tags" method="POST" path="/testimonials/{id}/tags">
        <Code code={`{ "add": ["pricing"], "remove": ["draft"] }`} />
        <P>
          <C>GET /tags</C> lists the space’s tags with counts.
        </P>
      </Endpoint>

      <H2 id="widgets">Widgets</H2>
      <Endpoint id="widgets-list" method="GET" path="/widgets">
        <P>Each widget with its config, public page and embed code.</P>
      </Endpoint>
      <Endpoint id="widgets-get" method="GET" path="/widgets/{id}">
        <P>
          With a key, the widget. Without a key, the same URL is the widget’s public JSON: the approved testimonials it shows, open to any
          site, for building your own design.
        </P>
      </Endpoint>

      <H2 id="space">Space</H2>
      <Endpoint id="space-get" method="GET" path="/space">
        <P>Name, links, counts by status and the average rating. A quick way to test a key.</P>
      </Endpoint>

      <H2 id="webhooks">Webhooks</H2>
      <P>
        Add an endpoint in <strong className="font-medium">Settings → Webhooks</strong> and pick its events. Lovewall POSTs JSON to it when
        testimonials change:
      </P>
      <Table
        head={["Event", "When"]}
        rows={[
          ["testimonial.created", "A new one arrives: form, import, by hand or the API"],
          ["testimonial.updated", "Any change, approvals included"],
          ["testimonial.approved", "It was approved (also sends testimonial.updated)"],
          ["testimonial.deleted", "It was deleted; data is the last version"],
        ]}
      />
      <Code code={`{\n  "type": "testimonial.created",\n  "timestamp": "2026-10-26T10:00:00.000Z",\n  "data": { …Testimonial }\n}`} />
      <H3 id="signatures">Signatures</H3>
      <P>
        Requests follow <A href="https://www.standardwebhooks.com">Standard Webhooks</A>: <C>webhook-id</C>, <C>webhook-timestamp</C> and{" "}
        <C>webhook-signature</C> (<C>v1,</C> + base64 HMAC-SHA256 of <C>id.timestamp.body</C>, keyed with the base64 part of your{" "}
        <C>whsec_</C> secret). The secret is shown once; roll it any time. Any Standard Webhooks library verifies them, or:
      </P>
      <Code code={VERIFY} label="Node" />
      <H3 id="retries">Retries</H3>
      <P>
        Answer with any 2xx within 10 seconds. Otherwise Lovewall retries after 1, 5 and 30 minutes, then 2, 5, 10 and 12 hours (8 tries).
        The same event keeps its <C>webhook-id</C>, so you can skip duplicates. Each endpoint keeps a log of the last deliveries with a
        Retry button. Redirects aren’t followed, and private addresses are refused.
      </P>
      <H3 id="chat">Slack and Discord</H3>
      <P>
        Paste an incoming webhook link in <strong className="font-medium">Settings → Slack and Discord</strong>. Each new testimonial posts a
        short message with its stars, text, name and a link to your inbox.
      </P>

      <H2 id="rest-hooks">Zapier and Make</H2>
      <P>
        Zapier and Make subscribe through REST Hooks, so new testimonials reach them in seconds. Any tool can do the same with a key:
      </P>
      <Endpoint id="hooks-subscribe" method="POST" path="/hooks">
        <Code code={`{ "target_url": "https://hooks.zapier.com/…", "event": "testimonial.created" }`} />
        <P>
          Answers <C>201</C> with the subscription’s <C>id</C>. Events arrive signed, like any webhook. Answer <C>410</C> to unsubscribe.
        </P>
      </Endpoint>
      <Endpoint id="hooks-delete" method="DELETE" path="/hooks/{id}">
        <P>Unsubscribes. Revoking the key removes its subscriptions too.</P>
      </Endpoint>

      <H2 id="openapi">OpenAPI</H2>
      <P>
        The whole API as OpenAPI 3.1, for Postman, Insomnia or code generators: <A href={`${base}/openapi.json`}>{`${base}/openapi.json`}</A>
      </P>
      <P>
        Using an AI assistant? Connect it with <A href="/docs/mcp">MCP</A> instead.
      </P>
    </DocPage>
  );
}
