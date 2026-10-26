import { expect, test, type Browser, type BrowserContext, type Page, type Request } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { FloodGate } from "../src/lib/flood";
import { isHttpUrl } from "../src/lib/forms";
import { describeError, redact } from "../src/lib/log";
import { isPrivateAddress, isPrivateLiteral } from "../src/lib/net";
import { safeNext } from "../src/lib/redirect";
import { startupProblems } from "../src/lib/startup";
import { checkChatTarget } from "../src/lib/webhook-format";
import { customCss } from "../src/lib/widget/render";
import { createSpace, newContext, signIn, uniqueEmail } from "./helpers";

// Security: headers, cookies, CSRF, open redirects, and one user (or one API key) never reaching another space.
// Runs in order; later steps use earlier state.
test.describe.configure({ mode: "serial" });

const PORT = Number(process.env.E2E_PORT) || 3111;
const APP = `http://localhost:${PORT}`;

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

const id = (n = 12) =>
  randomBytes(32)
    .toString("base64")
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(0, n);

// An API key made straight in the database (the UI flow is covered by the integrations suite).
async function makeKey(spaceId: string, createdBy: string, scope: "read" | "write" = "write") {
  const prefix = id(8);
  const key = `lw_${prefix}${id(32)}`;
  await sql("insert into api_keys (id, space_id, name, scope, prefix, hash, created_by) values ($1, $2, 'sec', $3, $4, $5, $6)", [
    id(),
    spaceId,
    scope,
    prefix,
    createHash("sha256").update(key).digest("hex"),
    createdBy,
  ]);
  return key;
}

async function addTestimonial(spaceId: string, text: string) {
  const tid = id();
  await sql(
    "insert into testimonials (id, space_id, status, source, text, name, email) values ($1, $2, 'approved', 'Form', $3, 'Giver', 'giver@lovewall.test')",
    [tid, spaceId, text],
  );
  return tid;
}

test.describe("pure parts", () => {
  test("sign-in redirects stay on this site", () => {
    for (const evil of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/%09/evil.com".replace("%09", "\t"),
      "https://evil.com",
      "javascript:alert(1)",
      "/\u0000/evil.com",
      " /app",
      "app",
      "",
      null,
    ]) {
      expect(safeNext(evil), String(evil)).toBe("/app");
    }
    expect(safeNext("/app/abc123?x=1#y")).toBe("/app/abc123?x=1#y");
    expect(safeNext("/invite/AbC-_")).toBe("/invite/AbC-_");
    expect(safeNext("/app/../../evil")).toBe("/evil");
  });

  test("private addresses, also as URL literals", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:127.0.0.1", "::7f00:1", "fec0::1", "fd00::1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("93.184.215.14")).toBe(false);
    for (const url of [
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://0x7f.1/",
    ]) {
      expect(isPrivateLiteral(new URL(url)), url).toBe(true);
    }
    expect(isPrivateLiteral(new URL("https://example.com/"))).toBe(false);
    expect(isPrivateLiteral(new URL("https://93.184.215.14/"))).toBe(false);
  });

  test("custom CSS can't load from this app or sneak in escapes", () => {
    const out = customCss(
      `@\\69mport url(/api/x); .a{background:url(/api/files/x)} .b{background:url('//evil.com/x')} .c{background:url(https://cdn.example/x.png)} .d{background:url(data:image/png;base64,AAA)}`,
    );
    expect(out).not.toMatch(/@import|\\|url\(\s*['"]?\/|url\(\s*['"]?\/\//i);
    expect(out).toContain("url(https://cdn.example/x.png)");
    expect(out).toContain("url(data:image/png;base64,AAA)");
  });

  test("links: http(s) or a bare host only", () => {
    expect(isHttpUrl("javascript:alert(1)//@a.b")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)+'@b.c'")).toBe(false);
    expect(isHttpUrl("data:text/html,x.y")).toBe(false);
    expect(isHttpUrl("acme.com")).toBe(true);
    expect(isHttpUrl("https://acme.com/x")).toBe(true);
  });

  test("Slack and Discord hooks only go to Slack and Discord", () => {
    expect(checkChatTarget("slack", "https://hooks.slack.com/services/T/B/x", false)).toBeNull();
    expect(checkChatTarget("slack", "https://evil.com/services/x", false)).not.toBeNull();
    expect(checkChatTarget("discord", "https://discord.com/api/webhooks/1/x", false)).toBeNull();
    expect(checkChatTarget("discord", "https://discord.com.evil.com/api/webhooks/1/x", false)).not.toBeNull();
    expect(checkChatTarget("slack", "http://127.0.0.1/x", true)).toBeNull();
  });

  test("weak secrets stop a production server", () => {
    expect(startupProblems({ NODE_ENV: "production", BETTER_AUTH_SECRET: "replace-with-a-long-random-string" })).toHaveLength(1);
    expect(startupProblems({ NODE_ENV: "production" })).toHaveLength(1);
    expect(
      startupProblems({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40), CRON_SECRET: "replace-with-another" }),
    ).toHaveLength(1);
    expect(startupProblems({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40), CRON_SECRET: "y".repeat(20) })).toEqual([]);
    expect(startupProblems({ NODE_ENV: "development" })).toEqual([]);
  });

  test("logs mask emails and keys, and drop database row details", () => {
    expect(redact("to=ada@example.com key=lw_ABCDEFGH0123456789012345678901234567890a Bearer abc.def-ghi")).toBe(
      "to=<email> key=lw_ABCDEFGH<redacted> Bearer <redacted>",
    );
    const error = Object.assign(new Error('duplicate key value violates unique constraint "x"'), {
      code: "23505",
      detail: "Key (email)=(ada@example.com) already exists.",
    });
    const line = describeError(error);
    expect(line).toContain("[23505]");
    expect(line).not.toContain("ada@example.com");
  });

  test("the flood gate counts per IP per minute", () => {
    const gate = new FloodGate(3);
    expect([1, 2, 3, 4].map(() => gate.allow("1.2.3.4", 1000))).toEqual([true, true, true, false]);
    expect(gate.allow("5.6.7.8", 1000)).toBe(true);
    expect(gate.allow("1.2.3.4", 62_000)).toBe(true);
    expect(gate.allow("unknown", 1000)).toBe(true);
  });
});

test("headers: CSP everywhere, only embeds frameable, no sniffing", async ({ request }) => {
  const page = await request.get("/login");
  const csp = page.headers()["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(page.headers()["x-frame-options"]).toBe("DENY");
  expect(page.headers()["x-content-type-options"]).toBe("nosniff");
  expect(page.headers()["strict-transport-security"]).toMatch(/max-age=\d{8}/);
  expect(page.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(page.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(page.headers()["x-powered-by"]).toBeUndefined();

  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  for (const path of ["/api/health", "/api/v1/space", "/api/files/nope"]) {
    const res = await request.get(path);
    expect(res.headers()["content-security-policy"], path).toContain("default-src 'none'");
    expect(res.headers()["x-frame-options"], path).toBe("DENY");
  }
  const embed = await request.get("/embed/AAAAAAAAAAAA");
  expect(embed.status()).toBe(404);
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
  expect(embed.headers()["x-frame-options"]).toBeUndefined();
  // Unknown widgets get no share image (each would be a full render).
  expect((await request.get("/w/AAAAAAAAAAAA/opengraph-image")).status()).toBe(404);
});

test("error answers carry no internals", async ({ request }) => {
  const bad = await request.post("/api/collect/AAAAAAAAAAAA", { data: "{not json" });
  expect(bad.status()).toBe(400);
  const api = await request.get("/api/v1/testimonials?limit=abc", { headers: { Authorization: "Bearer lw_nope" } });
  expect(api.status()).toBe(401);
  for (const res of [bad, api]) expect(await res.text()).not.toMatch(/at \w+ \(|node_modules|select |postgres|stack/i);
});

test.describe("two users, two spaces", () => {
  let alice: BrowserContext, bob: BrowserContext;
  let a: Page, b: Page;
  let aliceId = "",
    bobId = "";
  let alpha = "",
    bravo = "";
  let tAlpha = "",
    tBravo = "";
  let keyAlpha = "",
    keyBravo = "";

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const aliceEmail = uniqueEmail("sec-alice");
    const bobEmail = uniqueEmail("sec-bob");
    alice = await newContext(browser);
    bob = await newContext(browser);
    a = await alice.newPage();
    b = await bob.newPage();
    await signIn(a, aliceEmail);
    alpha = await createSpace(a, "Alpha Sec");
    await signIn(b, bobEmail);
    bravo = await createSpace(b, "Bravo Sec");
    [aliceId, bobId] = await Promise.all(
      [aliceEmail, bobEmail].map(async (e) => (await sql<{ id: string }>("select id from auth_users where email = $1", [e]))[0].id),
    );
    tAlpha = await addTestimonial(alpha, "Alpha secret words");
    tBravo = await addTestimonial(bravo, "Bravo words");
    keyAlpha = await makeKey(alpha, aliceId);
    keyBravo = await makeKey(bravo, bobId);
  });

  test.afterAll(async () => {
    await alice?.close();
    await bob?.close();
  });

  test("the session cookie is httpOnly and SameSite", async () => {
    const cookie = (await alice.cookies()).find((c) => /lovewall\.session_token$/.test(c.name));
    expect(cookie).toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });

  test("a signed-in user is never sent off-site by ?next=", async () => {
    for (const next of ["/%09/evil.com", "//evil.com", "/%5Cevil.com", "https://evil.com"]) {
      const res = await alice.request.get(`/login?next=${next}`, { maxRedirects: 0 });
      expect(res.status(), next).toBeGreaterThanOrEqual(300);
      const location = res.headers()["location"] ?? "";
      expect(new URL(location, APP).origin, next).toBe(APP);
    }
  });

  test("pages, exports and media of another space are not found", async () => {
    for (const path of [`/app/${alpha}`, `/app/${alpha}/settings`, `/app/${alpha}/widgets`, `/app/${alpha}/collect`]) {
      expect((await b.goto(path))?.status(), path).toBe(404);
    }
    for (const path of [
      `/api/spaces/${alpha}/export?format=csv`,
      `/api/spaces/${alpha}/testimonials/${tAlpha}/image`,
      `/api/spaces/${alpha}/testimonials/${tAlpha}/video`,
      // Bob's own space, Alice's testimonial.
      `/api/spaces/${bravo}/testimonials/${tAlpha}/image`,
    ]) {
      const res = await bob.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
    const own = await bob.request.get(`/api/spaces/${bravo}/export?format=json`);
    expect(own.status()).toBe(200);
    expect(await own.text()).not.toContain("Alpha secret words");
  });

  test("an API key only reaches its own space (REST and MCP)", async ({ request }) => {
    const auth = { Authorization: `Bearer ${keyBravo}` };
    expect((await request.get(`/api/v1/testimonials/${tAlpha}`, { headers: auth })).status()).toBe(404);
    expect((await request.patch(`/api/v1/testimonials/${tAlpha}`, { headers: auth, data: { status: "hidden" } })).status()).toBe(404);
    expect((await request.post(`/api/v1/testimonials/${tAlpha}/hide`, { headers: auth })).status()).toBe(404);
    expect((await request.delete(`/api/v1/testimonials/${tAlpha}`, { headers: auth })).status()).toBe(404);
    expect((await request.post(`/api/v1/testimonials/${tBravo}/constructor`, { headers: auth })).status()).toBe(404);
    const list = await (await request.get("/api/v1/testimonials?status=all", { headers: auth })).json();
    expect(JSON.stringify(list)).not.toContain(tAlpha);
    expect(JSON.stringify(list)).toContain(tBravo);
    expect((await sql("select status from testimonials where id = $1", [tAlpha]))[0].status).toBe("approved");

    const mcp = await request.post("/api/mcp", {
      headers: { ...auth, Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_testimonial", arguments: { id: tAlpha } } },
    });
    const text = await mcp.text();
    expect(text).not.toContain("Alpha secret words");

    // Guessing keys: after 20 failures an IP gets 429s.
    const guesser = { "x-real-ip": "10.66.6.6" };
    let last = 0;
    for (let i = 0; i < 22; i++)
      last = (await request.get("/api/v1/space", { headers: { ...guesser, Authorization: `Bearer lw_${id(40)}` } })).status();
    expect(last).toBe(429);
  });

  test("server actions: another space is refused, and so is another origin", async () => {
    // Capture Bob's own "rename space" call, then replay it at Alice's space.
    await b.goto(`/app/${bravo}/settings`);
    const sent = b.waitForRequest((r: Request) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
    await b.getByLabel("Name", { exact: true }).fill("Bravo Renamed");
    await b.getByLabel("Name", { exact: true }).blur();
    const rename = await sent;
    await expect.poll(async () => (await sql("select name from spaces where id = $1", [bravo]))[0].name).toBe("Bravo Renamed");
    const replay = async (body: unknown[], origin = APP) => {
      const headers = { ...rename.headers() };
      delete headers.cookie;
      return bob.request.post(rename.url(), { headers: { ...headers, origin }, data: Buffer.from(JSON.stringify(body)) });
    };
    await replay([alpha, { name: "Pwned" }]);
    expect((await sql("select name from spaces where id = $1", [alpha]))[0].name).toBe("Alpha Sec");
    // CSRF: the same call from another site is rejected before it runs.
    const forged = await replay([bravo, { name: "Forged" }], "http://evil.example");
    expect(forged.status()).toBeGreaterThanOrEqual(400);
    expect((await sql("select name from spaces where id = $1", [bravo]))[0].name).toBe("Bravo Renamed");

    // Better Auth checks the origin too.
    const out = await bob.request.post("/api/auth/sign-out", { headers: { origin: "http://evil.example" }, data: {} });
    expect(out.status()).toBe(403);
  });

  test("an editor can't change the owner-only settings or export", async () => {
    await sql("insert into space_members (space_id, user_id, role) values ($1, $2, 'editor')", [alpha, bobId]);
    await b.goto(`/app/${bravo}/settings`);
    const sent = b.waitForRequest((r: Request) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
    await b.getByLabel("Name", { exact: true }).fill("Bravo Again");
    await b.getByLabel("Name", { exact: true }).blur();
    const rename = await sent;
    const replay = (body: unknown[]) => {
      const headers = { ...rename.headers() };
      delete headers.cookie;
      return bob.request.post(rename.url(), { headers: { ...headers, origin: APP }, data: Buffer.from(JSON.stringify(body)) });
    };
    const slug = `hijack-${id(6).toLowerCase()}`;
    expect(await (await replay([alpha, { slug }])).text()).toContain("Only the owner can change this");
    expect(await (await replay([alpha, { notify: false }])).text()).toContain("Only the owner can change this");
    expect((await sql("select slug from spaces where id = $1", [alpha]))[0].slug).not.toBe(slug);
    // Editors keep the everyday settings.
    await replay([alpha, { name: "Alpha Edited" }]);
    expect((await sql("select name from spaces where id = $1", [alpha]))[0].name).toBe("Alpha Edited");
    // Pages: no AI, integrations or domain settings for editors.
    await b.goto(`/app/${alpha}/settings`);
    await expect(b.locator("#slug")).toHaveAttribute("readonly", "");
    await expect(b.getByText("Email me new testimonials")).toHaveCount(0);
    expect((await bob.request.get(`/api/spaces/${alpha}/export?format=csv`)).status()).toBe(403);
  });

  test("a removed member loses the space and their API keys at once", async ({ request }) => {
    const bobsKey = await makeKey(alpha, bobId, "read");
    expect((await request.get("/api/v1/space", { headers: { Authorization: `Bearer ${bobsKey}` } })).status()).toBe(200);
    expect((await b.goto(`/app/${alpha}`))?.status()).toBe(200);

    await a.goto(`/app/${alpha}/settings`);
    await a
      .locator("[data-member]")
      .filter({ hasNotText: "Owner" })
      .getByRole("button", { name: /^More for / })
      .click();
    await a.getByRole("menuitem", { name: "Remove" }).click();
    await a.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(a.getByText("Removed")).toBeVisible();

    expect((await b.goto(`/app/${alpha}`))?.status()).toBe(404);
    expect((await request.get("/api/v1/space", { headers: { Authorization: `Bearer ${bobsKey}` } })).status()).toBe(401);
    // Alice's own key is untouched.
    expect((await request.get("/api/v1/space", { headers: { Authorization: `Bearer ${keyAlpha}` } })).status()).toBe(200);
  });
});
