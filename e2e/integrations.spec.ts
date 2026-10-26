import AxeBuilder from "@axe-core/playwright";
import { expect, request as http, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkTarget, discordMessage, sign, slackMessage } from "../src/lib/webhook-format";
import { createSpace, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// Integrations end to end: API keys, the REST API, webhooks (signed, retried), Slack and Discord, REST Hooks for
// Zapier and Make, the MCP server, and the public docs and guides. Deliveries go to the mock site (e2e/mocks).
test.describe.configure({ mode: "serial" });

const RUN = `${Date.now()}`;
const APP = `http://localhost:${Number(process.env.E2E_PORT) || 3111}`;
let owner: BrowserContext;
let page: Page;
let api: APIRequestContext;
let spaceId = "";
let slug = "";
let writeKey = "";
let readKey = "";
let created = "";

async function axe(p: Page) {
  await p.waitForTimeout(500);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

type Received = { headers: Record<string, string>; body: string; status: number };

// What the mock received at /hooks/<name>, waiting until `count` arrived.
async function received(name: string, count = 1): Promise<Received[]> {
  for (let i = 0; i < 60; i++) {
    const list = (await (await fetch(`${SITE}/hooks/${name}/log`)).json()) as Received[];
    if (list.length >= count) return list;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nothing at /hooks/${name}`);
}

// Standard Webhooks verification, as the docs show it.
function verify(secret: string, h: Record<string, string>, body: string) {
  if (Math.abs(Date.now() / 1000 - Number(h["webhook-timestamp"])) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${h["webhook-id"]}.${h["webhook-timestamp"]}.${body}`).digest("base64");
  return h["webhook-signature"].split(" ").some((sig) => {
    const [version, value] = sig.split(",");
    return version === "v1" && value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

// An MCP call over Streamable HTTP (2025 clients; the answer may be JSON or one SSE message).
async function mcp(key: string, method: string, params: unknown = {}, id = 1) {
  const res = await api.post("/api/mcp", {
    headers: { ...auth(key), Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
    data: { jsonrpc: "2.0", id, method, params },
  });
  expect(res.status()).toBe(200);
  const text = await res.text();
  const json = text.trim().startsWith("{")
    ? text
    : text
        .split("\n")
        .find((l) => l.startsWith("data: "))!
        .slice(6);
  return JSON.parse(json) as { result?: Record<string, unknown>; error?: { message: string } };
}

async function newKey(name: string, access: "Read and write" | "Read only") {
  await page.getByRole("button", { name: "New key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: access }).click();
  await dialog.getByRole("button", { name: "Create key" }).click();
  const code = dialog.getByTestId("new-key").locator("pre");
  await expect(code).toHaveText(/^lw_[0-9A-Za-z]{40}$/);
  const key = (await code.textContent())!.trim();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  return key;
}

test.beforeAll(async ({ browser }) => {
  owner = await newContext(browser);
  page = await owner.newPage();
  // API calls look like one more visitor, so failed-key limits don't leak between runs.
  api = await http.newContext({
    baseURL: APP,
    extraHTTPHeaders: { "x-real-ip": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
});

test.afterAll(async () => {
  await api?.dispose();
  await owner?.close();
});

test.describe("pure parts", () => {
  test("webhook targets refuse private, local and credentialed URLs", () => {
    for (const bad of [
      "http://example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.8/x",
      "https://[::1]/x",
      "https://a:b@example.com/",
      "https://example.com:8443/",
      "https://printer.local/",
      "nope",
    ])
      expect(checkTarget(bad, false), bad).not.toBeNull();
    expect(checkTarget("https://hooks.zapier.com/hooks/standard/1/abc", false)).toBeNull();
    expect(checkTarget("http://127.0.0.1:3135/hooks/x", true)).toBeNull();
  });

  test("signatures follow Standard Webhooks", () => {
    const secret = `whsec_${Buffer.from("0123456789abcdef01234567").toString("base64")}`;
    const ts = Math.floor(Date.now() / 1000);
    const body = '{"type":"testimonial.created"}';
    const signature = sign(secret, "msg_1", ts, body);
    expect(verify(secret, { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": signature }, body)).toBe(true);
    expect(verify(secret, { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": signature }, `${body} `)).toBe(
      false,
    );
  });

  test("chat messages can't ping or inject links", () => {
    const payload = {
      type: "testimonial.created",
      timestamp: new Date().toISOString(),
      data: {
        name: "<!channel> Eve",
        text: "Hi <https://evil.example|click> @everyone",
        rating: 5,
        inbox_url: "https://testimonials.example.com/app/x",
      },
    };
    const slack = JSON.stringify(slackMessage(payload, "Acme"));
    expect(slack).not.toContain("<!channel>");
    expect(slack).not.toContain("<https://evil");
    expect(slack).toContain("★★★★★");
    const discord = discordMessage(payload, "Acme");
    expect(discord.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.stringify(discord)).toContain("\\\\@everyone");
  });
});

test("sign in and make a space", async () => {
  await signIn(page, uniqueEmail("integrations"));
  spaceId = await createSpace(page, "Hooks Inc");
  await page.goto(`/app/${spaceId}/collect`);
  slug = (await page.getByTestId("collect-link").textContent())!.split("/").pop()!;
});

test("API keys: shown once, stored hashed, prefix visible", async () => {
  await page.goto(`/app/${spaceId}/settings`);
  writeKey = await newKey("Zapier", "Read and write");
  readKey = await newKey("Dashboard", "Read only");
  await page.reload();
  const html = await page.content();
  expect(html).not.toContain(writeKey);
  expect(html).not.toContain(readKey);
  const row = page.getByTestId("api-key").filter({ hasText: "Zapier" });
  await expect(row).toContainText("Read and write");
  await expect(row).toContainText(writeKey.slice(0, 11));
  await expect(page.getByTestId("api-key").filter({ hasText: "Dashboard" })).toContainText("Read only");
  expect(await axe(page)).toEqual([]);
});

test("REST API: create, read, update, approve, tag, delete", async () => {
  expect((await api.get("/api/v1/space")).status()).toBe(401);
  expect((await api.get("/api/v1/space", { headers: auth("lw_wrong") })).status()).toBe(401);
  const space = await (await api.get("/api/v1/space", { headers: auth(readKey) })).json();
  expect(space.data).toMatchObject({ id: spaceId, slug, counts: { total: 0 } });

  // A read-only key can't write.
  const denied = await api.post("/api/v1/testimonials", { headers: auth(readKey), data: { name: "A", text: "B" } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("forbidden");

  const bad = await api.post("/api/v1/testimonials", { headers: auth(writeKey), data: { name: "", text: "x", rating: 9 } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.message).toMatch(/^name: /);

  const res = await api.post("/api/v1/testimonials", {
    headers: auth(writeKey),
    data: {
      name: "Grace Hopper",
      title: "Rear Admiral",
      text: `It just works <b>${RUN}</b>`,
      rating: 5,
      email: "grace@example.com",
      source: "LinkedIn",
      source_url: `https://www.linkedin.com/posts/grace-${RUN}`,
      tags: ["Launch"],
    },
  });
  expect(res.status()).toBe(201);
  const t = (await res.json()).data;
  created = t.id;
  expect(t).toMatchObject({
    status: "new",
    source: "LinkedIn",
    tags: ["launch"],
    email: "grace@example.com",
    text: `It just works <b>${RUN}</b>`,
  });

  // Same source_url again: conflict.
  const dup = await api.post("/api/v1/testimonials", {
    headers: auth(writeKey),
    data: { name: "G", text: "Again", source_url: t.source_url },
  });
  expect(dup.status()).toBe(409);

  // Read-only keys never see the giver's email.
  const asReader = (await (await api.get(`/api/v1/testimonials/${created}`, { headers: auth(readKey) })).json()).data;
  expect(asReader.name).toBe("Grace Hopper");
  expect(asReader).not.toHaveProperty("email");
  const list = await (await api.get("/api/v1/testimonials?status=new&limit=1", { headers: auth(readKey) })).json();
  expect(list.data.map((x: { id: string }) => x.id)).toEqual([created]);
  expect(list.next_cursor).toBeNull();

  const patched = await api.patch(`/api/v1/testimonials/${created}`, { headers: auth(writeKey), data: { title: null, company: "Navy" } });
  expect((await patched.json()).data).toMatchObject({ title: null, company: "Navy", name: "Grace Hopper" });
  expect((await (await api.post(`/api/v1/testimonials/${created}/approve`, { headers: auth(writeKey) })).json()).data.status).toBe(
    "approved",
  );
  expect((await (await api.post(`/api/v1/testimonials/${created}/feature`, { headers: auth(writeKey) })).json()).data.featured).toBe(true);
  const tagged = await api.post(`/api/v1/testimonials/${created}/tags`, {
    headers: auth(writeKey),
    data: { add: ["vip"], remove: ["launch"] },
  });
  expect((await tagged.json()).data.tags).toEqual(["vip"]);
  expect((await (await api.get("/api/v1/tags", { headers: auth(readKey) })).json()).data).toEqual([{ tag: "vip", count: 1 }]);

  // Widgets: keyed list and get; the public JSON still works without a key.
  const widgets = (await (await api.get("/api/v1/widgets", { headers: auth(readKey) })).json()).data;
  expect(widgets[0]).toMatchObject({ name: "Wall of love", type: "wall" });
  const keyed = await api.get(`/api/v1/widgets/${widgets[0].id}`, { headers: auth(readKey) });
  expect((await keyed.json()).data.embed_html).toContain(`data-lovewall="${widgets[0].id}"`);
  expect(keyed.headers()["access-control-allow-origin"]).toBeUndefined();
  const open = await api.get(`/api/v1/widgets/${widgets[0].id}`);
  expect(open.headers()["access-control-allow-origin"]).toBe("*");
  expect((await open.json()).testimonials[0]).toMatchObject({ name: "Grace Hopper" });

  // Delete with a throwaway one.
  const temp = (await (await api.post("/api/v1/testimonials", { headers: auth(writeKey), data: { name: "Temp", text: "Bye" } })).json())
    .data;
  expect((await api.delete(`/api/v1/testimonials/${temp.id}`, { headers: auth(writeKey) })).status()).toBe(200);
  expect((await api.get(`/api/v1/testimonials/${temp.id}`, { headers: auth(readKey) })).status()).toBe(404);

  // The OpenAPI document describes it.
  const doc = await (await api.get("/api/v1/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toContain("/testimonials/{id}");
});

test("webhooks: a signed event reaches the endpoint", async () => {
  const name = `wh-${RUN}`;
  await page.goto(`/app/${spaceId}/settings`);
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("URL").fill(`${SITE}/hooks/${name}`);
  await dialog.getByText("Testimonial approved").click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const secret = (await dialog.getByTestId("webhook-secret").locator("pre").textContent())!.trim();
  expect(secret).toMatch(/^whsec_/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.reload();
  expect(await page.content()).not.toContain(secret);

  // A new testimonial through the API, then approved: two events, both signed.
  const t = (
    await (
      await api.post("/api/v1/testimonials", { headers: auth(writeKey), data: { name: "Ada", text: "Signed", email: "ada@example.com" } })
    ).json()
  ).data;
  await api.post(`/api/v1/testimonials/${t.id}/approve`, { headers: auth(writeKey) });
  const got = await received(name, 2);
  for (const r of got) expect(verify(secret, r.headers, r.body)).toBe(true);
  const events = got.map((r) => JSON.parse(r.body));
  expect(events.map((e) => e.type)).toEqual(["testimonial.created", "testimonial.approved"]);
  expect(events[0].data).toMatchObject({ id: t.id, name: "Ada", text: "Signed" });
  expect(events[0].data).not.toHaveProperty("email");
  expect(got[0].headers["webhook-id"]).toMatch(/^msg_/);

  // The delivery log shows them.
  await page.getByTestId("webhook").filter({ hasText: name }).click();
  await expect(page.getByRole("dialog").getByTestId("delivery")).toHaveCount(2);
  await expect(page.getByRole("dialog").getByTestId("delivery").first()).toContainText("200");
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
});

test("webhooks: a failed delivery is retried", async () => {
  const name = `flaky-${RUN}`;
  await page.goto(`/app/${spaceId}/settings`);
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("URL").fill(`${SITE}/hooks/${name}`);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("webhook").filter({ hasText: name }).click();
  await dialog.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText(/Test failed: HTTP 500/)).toBeVisible();
  const row = dialog.getByTestId("delivery").first();
  await expect(row).toContainText("Retrying · HTTP 500");
  await row.getByRole("button", { name: "Retry" }).click();
  await expect(row).toContainText("200");
  await expect(row.getByRole("button", { name: "Retry" })).toHaveCount(0);
  const got = await received(name, 2);
  expect(got.map((r) => r.status)).toEqual([500, 200]);
  expect(got[0].headers["webhook-id"]).toBe(got[1].headers["webhook-id"]); // same message on retry
  expect(JSON.parse(got[1].body).type).toBe("webhook.test");
  await page.keyboard.press("Escape");

  // The cron retries too (and needs its secret).
  expect((await api.get("/api/cron/maintenance")).status()).toBe(401);
  const cron = await api.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
  expect((await cron.json()).integrations.webhooks).toHaveProperty("due");
});

test("Slack and Discord: new testimonials post a message", async ({ browser }) => {
  const slack = `slack-${RUN}`;
  const discord = `discord-${RUN}`;
  await page.goto(`/app/${spaceId}/settings`);
  for (const [service, name] of [
    ["Slack", slack],
    ["Discord", discord],
  ]) {
    await page.getByRole("button", { name: `Connect ${service}` }).click();
    await page.getByRole("dialog").getByLabel("Webhook link").fill(`${SITE}/hooks/${name}`);
    await page.getByRole("dialog").getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText(`${service} connected. Test sent.`)).toBeVisible();
  }
  await expect(page.getByTestId("chat-slack")).toContainText("Sent");
  expect(await page.content()).not.toContain(`/hooks/${slack}`); // the link is a credential: never sent back in full

  // A visitor sends a testimonial from the collect page.
  const visitor = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const v = await visitor.newPage();
  await v.goto(`/${slug}`);
  await v.getByRole("radio", { name: "4 stars" }).click();
  await v.getByLabel("Your testimonial").fill(`Lovely <!channel> ${RUN}`);
  await v.getByLabel("Your name").fill("Linus");
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600);
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await visitor.close();

  const [, message] = await received(slack, 2);
  const body = JSON.parse(message.body);
  expect(body.text).toBe("New testimonial from Linus (4/5)");
  const blocks = JSON.stringify(body.blocks);
  expect(blocks).toContain("★★★★☆");
  expect(blocks).toContain(`Lovely &lt;!channel&gt; ${RUN}`);
  expect(blocks).toContain(`${APP}/app/${spaceId}`);
  const [, embed] = await received(discord, 2);
  const d = JSON.parse(embed.body);
  expect(d.allowed_mentions).toEqual({ parse: [] });
  expect(d.embeds[0].author.name).toBe("Linus");
});

test("Zapier and Make: REST Hook subscribe, deliver, unsubscribe", async () => {
  const name = `zap-${RUN}`;
  const sub = await api.post("/api/v1/hooks", {
    headers: auth(readKey),
    data: { target_url: `${SITE}/hooks/${name}`, event: "testimonial.created" },
  });
  expect(sub.status()).toBe(201);
  const hook = (await sub.json()).data;
  await api.post("/api/v1/testimonials", {
    headers: auth(writeKey),
    data: { name: "Zed", text: `Via Zapier ${RUN}`, email: "zed@example.com" },
  });
  const [first] = await received(name, 1);
  const event = JSON.parse(first.body);
  expect(event).toMatchObject({ type: "testimonial.created", data: { name: "Zed" } });
  expect(event.data).not.toHaveProperty("email"); // subscribed with a read-only key
  await page.goto(`/app/${spaceId}/settings`);
  await expect(page.getByTestId("webhook").filter({ hasText: "127.0.0.1:3" })).toHaveCount(3);

  expect((await api.delete(`/api/v1/hooks/${hook.id}`, { headers: auth(readKey) })).status()).toBe(200);
  await api.post("/api/v1/testimonials", { headers: auth(writeKey), data: { name: "Late", text: "After unsubscribe" } });
  await new Promise((r) => setTimeout(r, 1500));
  expect(await received(name, 1)).toHaveLength(1);
});

test("MCP: initialize, list tools, call them", async () => {
  const init = await mcp(readKey, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  expect(init.result).toMatchObject({ serverInfo: { name: "lovewall" }, capabilities: { tools: {} } });

  const readTools = ((await mcp(readKey, "tools/list")).result!.tools as { name: string }[]).map((t) => t.name);
  expect(readTools).toEqual(expect.arrayContaining(["search_testimonials", "get_testimonial", "list_widgets", "get_stats"]));
  expect(readTools).not.toContain("update_testimonials");
  const writeTools = ((await mcp(writeKey, "tools/list")).result!.tools as { name: string }[]).map((t) => t.name);
  expect(writeTools).toEqual(expect.arrayContaining(["update_testimonials", "add_testimonial"]));

  const search = await mcp(readKey, "tools/call", { name: "search_testimonials", arguments: { query: "just works" } });
  const found = search.result!.structuredContent as { testimonials: { id: string; name: string }[] };
  expect(found.testimonials.map((t) => t.id)).toEqual([created]);

  const update = await mcp(writeKey, "tools/call", {
    name: "update_testimonials",
    arguments: { ids: [created], status: "hidden", add_tags: ["mcp"] },
  });
  expect((update.result!.structuredContent as { updated: { status: string; tags: string[] }[] }).updated[0]).toMatchObject({
    status: "hidden",
    tags: ["mcp", "vip"],
  });
  const stats = await mcp(readKey, "tools/call", { name: "get_stats", arguments: {} });
  expect(stats.result!.structuredContent).toMatchObject({ space: "Hooks Inc" });

  // A read-only key can't call write tools; no key, no server.
  const refused = await mcp(readKey, "tools/call", { name: "add_testimonial", arguments: { name: "X", text: "Y" } });
  expect(refused.error ?? refused.result?.isError).toBeTruthy();
  expect((await api.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status()).toBe(401);
});

test("a revoked key stops working", async () => {
  await page.goto(`/app/${spaceId}/settings`);
  await page.getByRole("button", { name: "Revoke Dashboard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Key revoked")).toBeVisible();
  expect((await api.get("/api/v1/space", { headers: auth(readKey) })).status()).toBe(401);
  expect((await api.get("/api/v1/space", { headers: auth(writeKey) })).status()).toBe(200);
});

test("guides and docs are public and accessible", async ({ browser }) => {
  const visitor = await newContext(browser, { colorScheme: "dark", viewport: { width: 390, height: 844 } });
  const v = await visitor.newPage();
  await v.goto("/guides");
  await expect(v.getByRole("heading", { name: "Guides" })).toBeVisible();
  await v.getByRole("link", { name: /Webflow/ }).click();
  await expect(v.getByRole("heading", { name: "Testimonials on Webflow" })).toBeVisible();
  await expect(v.getByText(`<script src="${APP}/embed.js" defer></script>`)).toBeVisible();
  expect(await axe(v)).toEqual([]);
  for (const path of ["/guides", "/guides/notion", "/docs/api", "/docs/mcp"]) {
    await v.goto(path);
    expect(await axe(v), path).toEqual([]);
  }
  expect((await v.goto("/guides/myspace"))!.status()).toBe(404);
  const sitemap = await (await api.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/guides/webflow");
  expect(sitemap).toContain("/docs/api");
  await visitor.close();

  // The embed sheet points to them.
  await page.goto(`/app/${spaceId}/widgets`);
  await page
    .getByRole("button", { name: /More for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Embed" }).click();
  await expect(page.getByRole("link", { name: /Guides for Webflow/ })).toHaveAttribute("href", "/guides");
});
