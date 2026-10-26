import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page, type Request } from "@playwright/test";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { planFrom } from "../src/lib/billing/plan";
import { POLAR_TEST } from "./mocks/accounts.mjs";
import { createSpace, mailCode, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// Teams and hosted billing. Billing runs against a second server with POLAR_* set (see playwright.config.ts); the
// teams and self-host tests run on the main, self-hosted one. Runs in order; later steps use earlier state.
test.describe.configure({ mode: "serial" });

const PORT = Number(process.env.E2E_PORT) || 3111;
const APP = `http://localhost:${PORT}`;
const BILLING = `http://localhost:${Number(process.env.E2E_BILLING_PORT) || PORT + 1}`;

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

// Direct database access, only to move an account's sign-up date into the past.
async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}
const userId = async (email: string) => (await sql<{ id: string }>("select id from auth_users where email = $1", [email]))[0].id;
const age = (email: string, days: number) =>
  sql(`update auth_users set "createdAt" = now() - make_interval(days => $2) where email = $1`, [email, days]);

async function axe(p: Page) {
  await p.waitForTimeout(500);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

// A signed Polar webhook (Standard Webhooks: HMAC-SHA256 over "id.timestamp.body").
function signed(body: string, opts: { id?: string; secret?: string; timestamp?: number } = {}) {
  const id = opts.id ?? `msg_${randomBytes(8).toString("hex")}`;
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", Buffer.from(opts.secret ?? POLAR_TEST.webhookSecret, "utf8"))
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` };
}

function subscriptionEvent(type: string, data: Record<string, unknown>) {
  return JSON.stringify({ type, timestamp: new Date().toISOString(), api_version: "2026-10", data });
}

// A testimonial through the public API, like the collect form sends it.
async function submit(base: string, space: { id: string; slug: string }, name: string, text: string) {
  const html = await (await fetch(`${base}/${space.slug}`)).text();
  const token = html.match(/\\"token\\":\\"(\d+\.[A-Za-z0-9_-]+)\\"/)?.[1] ?? html.match(/"token":"(\d+\.[A-Za-z0-9_-]+)"/)?.[1];
  expect(token).toBeTruthy();
  await new Promise((r) => setTimeout(r, 2700)); // the form refuses inhumanly fast submissions
  return fetch(`${base}/api/collect/${space.id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.61.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify({ name, text, consent: true, token }),
  });
}

async function slugOf(page: Page, spaceId: string) {
  await page.goto(`/app/${spaceId}`);
  return new URL((await page.getByTestId("collect-url").getAttribute("href"))!).pathname.slice(1);
}

async function signedIn(browser: Browser, email: string, opts: Parameters<typeof newContext>[1] = {}) {
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signIn(page, email);
  return { ctx, page };
}

test("plans: trial, paid, canceling, past due and ended", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-11-01T12:00:00Z");
  const signedUp = new Date(now - 2 * day);
  const sub = (over: Partial<Parameters<typeof planFrom>[1][number]>) => ({
    status: "active",
    interval: "monthly" as const,
    current_period_end: new Date(now + 10 * day),
    cancel_at_period_end: false,
    ended_at: null,
    ...over,
  });
  expect(planFrom(signedUp, [], now)).toMatchObject({ state: "trialing", daysLeft: 12 });
  expect(planFrom(new Date(now - 14 * day + 1000), [], now)).toMatchObject({ state: "trialing", daysLeft: 1 });
  expect(planFrom(new Date(now - 15 * day), [], now)).toEqual({ state: "ended", reason: "trial" });
  expect(planFrom(new Date(now - 90 * day), [sub({})], now)).toMatchObject({ state: "active", interval: "monthly" });
  expect(planFrom(new Date(now - 90 * day), [sub({ cancel_at_period_end: true })], now)).toMatchObject({ state: "canceling" });
  expect(planFrom(new Date(now - 90 * day), [sub({ status: "canceled" })], now)).toMatchObject({ state: "canceling" });
  expect(planFrom(new Date(now - 90 * day), [sub({ status: "past_due" })], now)).toMatchObject({ state: "past_due" });
  expect(planFrom(new Date(now - 90 * day), [sub({ status: "canceled", ended_at: new Date(now - 1000) })], now)).toEqual({
    state: "ended",
    reason: "plan",
  });
  // A checkout that never completed doesn't count as a plan.
  expect(planFrom(new Date(now - 90 * day), [sub({ status: "incomplete_expired" })], now)).toEqual({ state: "ended", reason: "trial" });
});

test.describe("hosted billing", () => {
  test.use({ baseURL: BILLING });

  const ownerEmail = uniqueEmail("payer");
  let owner: BrowserContext;
  let page: Page;
  let spaceId = "";

  test.afterAll(async () => {
    await owner?.close();
  });

  test("a new account starts a 14-day trial", async ({ browser }) => {
    ({ ctx: owner, page } = await signedIn(browser, ownerEmail));
    spaceId = await createSpace(page, "Northwind Hosted");
    await expect(page.getByRole("link", { name: "14 days left" })).toBeVisible();
    await page.getByRole("link", { name: "14 days left" }).click();
    await page.waitForURL(/\/app\/settings/);
    const billing = page.locator("#billing");
    await expect(billing.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(billing.getByText("Trial, 14 days left")).toBeVisible();
    await expect(billing.getByRole("radio", { name: "Monthly · $9" })).toBeChecked();
    expect(await axe(page)).toEqual([]);
  });

  test("subscribe through Polar's checkout", async () => {
    const billing = page.locator("#billing");
    await billing.getByRole("radio", { name: "Yearly · $90" }).click();
    await billing.getByRole("button", { name: "Subscribe" }).click();
    await page.waitForURL(`${SITE}/polar/checkout/**`);
    await expect(page.getByRole("heading", { name: "Mock Polar checkout" })).toBeVisible();
    await expect(page.getByText(`${ownerEmail} · ${POLAR_TEST.yearly}`)).toBeVisible();
    await page.getByRole("link", { name: "Pay" }).click();
    await page.waitForURL(`${BILLING}/app/settings**`);
    await expect(page.getByText("You’re subscribed")).toBeVisible();
    await expect(billing.getByText("Yearly, $90")).toBeVisible();
    await expect(billing.getByText("Renews")).toBeVisible();
    await expect(page.getByRole("link", { name: /days left/ })).toHaveCount(0);
    await billing.getByRole("button", { name: "Manage billing" }).click();
    await page.waitForURL(`${SITE}/polar/portal**`);
    await expect(page.getByRole("heading", { name: "Mock customer portal" })).toBeVisible();
  });

  test("signed webhooks change the plan; forged and replayed ones don't", async ({ request }) => {
    const uid = await userId(ownerEmail);
    const [row] = await sql<{ id: string; customer_id: string }>("select id, customer_id from subscriptions where user_id = $1", [uid]);
    expect(row).toBeTruthy();
    const base = {
      id: row.id,
      customer_id: row.customer_id,
      product_id: POLAR_TEST.yearly,
      current_period_end: new Date(Date.now() + 200 * 86400_000).toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      customer: { external_id: uid },
    };
    const hook = "/api/billing/webhook";
    const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();

    // Forged: wrong secret, no signature, an old timestamp.
    const canceled = subscriptionEvent("subscription.canceled", {
      ...base,
      status: "active",
      cancel_at_period_end: true,
      modified_at: later(1),
    });
    expect(
      (await request.post(hook, { headers: signed(canceled, { secret: "not-the-secret" }), data: Buffer.from(canceled) })).status(),
    ).toBe(403);
    expect((await request.post(hook, { headers: { "content-type": "application/json" }, data: Buffer.from(canceled) })).status()).toBe(403);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await request.post(hook, { headers: signed(canceled, { timestamp: old }), data: Buffer.from(canceled) })).status()).toBe(403);
    expect((await request.post(hook, { headers: signed("not json"), data: Buffer.from("not json") })).status()).toBe(400);

    // Signed: canceled at the end of the period.
    const headers = signed(canceled);
    expect((await request.post(hook, { headers, data: Buffer.from(canceled) })).status()).toBe(202);
    await page.goto("/app/settings");
    await expect(page.locator("#billing").getByText("Ends")).toBeVisible();

    // The same delivery again (same webhook-id) is ignored, even with another body.
    const uncanceled = subscriptionEvent("subscription.uncanceled", {
      ...base,
      status: "active",
      cancel_at_period_end: false,
      modified_at: later(2),
    });
    const replay = signed(uncanceled, { id: headers["webhook-id"] });
    expect((await request.post(hook, { headers: replay, data: Buffer.from(uncanceled) })).status()).toBe(202);
    await page.reload();
    await expect(page.locator("#billing").getByText("Ends")).toBeVisible();

    // A new delivery applies; an older state arriving late doesn't undo it.
    expect((await request.post(hook, { headers: signed(uncanceled), data: Buffer.from(uncanceled) })).status()).toBe(202);
    const stale = subscriptionEvent("subscription.updated", {
      ...base,
      status: "active",
      cancel_at_period_end: true,
      modified_at: later(-60),
    });
    expect((await request.post(hook, { headers: signed(stale), data: Buffer.from(stale) })).status()).toBe(202);
    await page.reload();
    await expect(page.locator("#billing").getByText("Renews")).toBeVisible();

    // Another product in the same Polar organization is not ours.
    const other = subscriptionEvent("subscription.created", {
      ...base,
      id: "sub_other_product",
      product_id: "prod_someone_else",
      status: "active",
    });
    expect((await request.post(hook, { headers: signed(other), data: Buffer.from(other) })).status()).toBe(202);
    expect(await sql("select 1 from subscriptions where id = 'sub_other_product'")).toHaveLength(0);

    // Revoked after the trial is long over: the dashboard locks.
    await age(ownerEmail, 40);
    const revoked = subscriptionEvent("subscription.revoked", {
      ...base,
      status: "canceled",
      cancel_at_period_end: false,
      current_period_end: new Date(Date.now() - 1000).toISOString(),
      ended_at: new Date(Date.now() - 1000).toISOString(),
      modified_at: later(3),
    });
    expect((await request.post(hook, { headers: signed(revoked), data: Buffer.from(revoked) })).status()).toBe(202);
    await page.goto(`/app/${spaceId}`);
    await expect(page.getByRole("heading", { name: "Your plan has ended" })).toBeVisible();
  });

  test("an ended trial locks the dashboard; collect page and widgets keep working", async ({ browser, request }) => {
    const email = uniqueEmail("trial");
    const memberEmail = uniqueEmail("trial-member");
    const { ctx, page: p } = await signedIn(browser, email);
    const space = await createSpace(p, "Trial Rockets");
    const slug = await slugOf(p, space);
    const [widget] = await sql<{ id: string }>("select id from widgets where space_id = $1", [space]);

    // A teammate joins while the trial runs.
    await p.goto(`/app/${space}/settings`);
    await p.getByLabel("Email to invite").fill(memberEmail);
    await p.getByRole("button", { name: "Invite" }).click();
    await expect(p.getByText("Invite sent")).toBeVisible();
    const link = (await mailTo(memberEmail, /invited you to Trial Rockets/)).Text.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]{43}/)![0];
    const { ctx: memberCtx, page: m } = await signedIn(browser, memberEmail);
    await m.goto(link);
    await m.getByRole("button", { name: "Join" }).click();
    await m.waitForURL(`**/app/${space}`);
    // Members never pay, so no trial line for them.
    await expect(m.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(m.getByRole("link", { name: /days left/ })).toHaveCount(0);

    // Fifteen days later.
    await age(email, 15);
    for (const path of [`/app/${space}`, `/app/${space}/widgets`, `/app/${space}/settings`, "/app/new"]) {
      await p.goto(path);
      await expect(p.getByRole("heading", { name: "Your trial has ended" }), path).toBeVisible();
    }
    await expect(p.getByRole("button", { name: "Subscribe" })).toBeVisible();
    expect(await axe(p)).toEqual([]);
    await p.getByRole("link", { name: "Account settings" }).click();
    await expect(p.locator("#billing").getByText("Trial ended")).toBeVisible();
    await expect(p.getByRole("button", { name: "Delete account" })).toBeVisible();

    await m.goto(`/app/${space}`);
    await expect(m.getByRole("heading", { name: "This space is paused" })).toBeVisible();
    await expect(m.getByText(/needs to subscribe\./)).toBeVisible();

    // Public pages and submissions keep working.
    expect((await request.get(`/${slug}`)).status()).toBe(200);
    expect((await request.get(`/embed/${widget.id}`)).status()).toBe(200);
    expect((await request.get(`/w/${widget.id}`)).status()).toBe(200);
    expect((await request.get(`/api/v1/widgets/${widget.id}`)).status()).toBe(200);
    const res = await submit(BILLING, { id: space, slug }, "Late Customer", "Still collecting while the trial is over.");
    expect(res.status).toBe(200);

    // Subscribing (here: Polar's webhook) opens the dashboard again, with the new testimonial in it.
    const uid = await userId(email);
    const active = subscriptionEvent("subscription.active", {
      id: `sub_${randomBytes(6).toString("hex")}`,
      status: "active",
      customer_id: `cus_${uid}`,
      product_id: POLAR_TEST.monthly,
      current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
      cancel_at_period_end: false,
      ended_at: null,
      modified_at: new Date().toISOString(),
      customer: { external_id: uid },
    });
    expect((await request.post("/api/billing/webhook", { headers: signed(active), data: Buffer.from(active) })).status()).toBe(202);
    await p.goto(`/app/${space}`);
    await expect(p.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(p.locator("[data-id]").filter({ hasText: "Still collecting while the trial is over." })).toBeVisible();
    await memberCtx.close();
    await ctx.close();
  });

  test("deleting the account cancels the plan", async ({ request }) => {
    // The first owner subscribes again (the earlier plan was revoked), then deletes the account.
    await page.goto("/app/settings");
    await page.locator("#billing").getByRole("button", { name: "Subscribe" }).click();
    await page.waitForURL(`${SITE}/polar/checkout/**`);
    await page.getByRole("link", { name: "Pay" }).click();
    await page.waitForURL(`${BILLING}/app/settings**`);
    await expect(page.locator("#billing").getByText("Monthly, $9")).toBeVisible();
    const uid = await userId(ownerEmail);
    const [live] = await sql<{ id: string }>("select id from subscriptions where user_id = $1 and status = 'active'", [uid]);
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Your plan is canceled.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
    await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
    const state = (await (await request.get(`${SITE}/polar/_state`)).json()) as { revoked: string[] };
    expect(state.revoked).toContain(live.id);
    expect(await sql("select 1 from auth_users where id = $1", [uid])).toHaveLength(0);
  });
});

test.describe("self-hosted", () => {
  test("no trial, no billing, nothing locked", async ({ browser, request }) => {
    const email = uniqueEmail("selfhost");
    const { ctx, page } = await signedIn(browser, email);
    const space = await createSpace(page, "Self Hosted");
    await age(email, 40);
    await page.goto(`/app/${space}`);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText(/days left|Subscribe|trial/i)).toHaveCount(0);
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Billing" })).toHaveCount(0);
    await expect(page.getByText(/plan|trial|\$9/i)).toHaveCount(0);
    expect((await request.post("/api/billing/webhook", { data: "{}" })).status()).toBe(404);
    await ctx.close();
  });
});

test.describe("teams", () => {
  const ownerEmail = uniqueEmail("team-owner");
  const editorEmail = uniqueEmail("team-editor");
  const QUOTE = `Teamwork made this easy ${Date.now()}`;
  let owner: BrowserContext;
  let editor: BrowserContext;
  let o: Page;
  let e: Page;
  let spaceId = "";
  let inviteLink = "";

  test.afterAll(async () => {
    await owner?.close();
    await editor?.close();
  });

  test("the owner invites a teammate by email", async ({ browser }) => {
    ({ ctx: owner, page: o } = await signedIn(browser, ownerEmail));
    spaceId = await createSpace(o, "Team Rockets");
    const slug = await slugOf(o, spaceId);
    expect((await submit(APP, { id: spaceId, slug }, "Grace Hopper", QUOTE)).status).toBe(200);

    await o.goto(`/app/${spaceId}/settings`);
    const members = o.locator("section").filter({ has: o.getByRole("heading", { name: "Members" }) });
    await expect(members.locator(`[data-member="${ownerEmail}"]`)).toContainText("Owner");
    // Bad input is refused.
    await o.getByLabel("Email to invite").fill(ownerEmail);
    await o.getByRole("button", { name: "Invite" }).click();
    await expect(o.getByText("That’s you")).toBeVisible();
    await o.getByLabel("Email to invite").fill(editorEmail);
    await o.getByRole("button", { name: "Invite" }).click();
    await expect(o.getByText("Invite sent")).toBeVisible();
    await expect(members.locator(`[data-invite="${editorEmail}"]`)).toContainText("Invited");
    expect(await axe(o)).toEqual([]);

    const mail = await mailTo(editorEmail, /invited you to Team Rockets/);
    inviteLink = mail.Text.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]{43}/)![0];
    // Only the token's hash is stored.
    const token = inviteLink.split("/").pop()!;
    expect(await sql("select 1 from space_invites where token_hash = $1", [token])).toHaveLength(0);
    expect(await sql("select 1 from space_invites where token_hash = $1", [createHash("sha256").update(token).digest("hex")])).toHaveLength(
      1,
    );
  });

  test("only the invited address can accept", async ({ browser }) => {
    const { ctx, page } = await signedIn(browser, uniqueEmail("stranger"));
    await page.goto(inviteLink);
    await expect(page.getByText(`This invite is for ${editorEmail}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Join" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Switch account" })).toBeVisible();
    await ctx.close();
  });

  test("the teammate signs in, joins and approves a testimonial", async ({ browser }) => {
    editor = await newContext(browser);
    e = await editor.newPage();
    await e.goto(inviteLink);
    await expect(e.getByRole("heading", { name: "Join Team Rockets" })).toBeVisible();
    await e.getByRole("link", { name: "Sign in to join" }).click();
    await expect(e.getByLabel("Email")).toHaveValue(editorEmail);
    const started = Date.now();
    await e.getByRole("button", { name: "Continue" }).click();
    await e.getByLabel("Code").fill(await mailCode(editorEmail, started));
    await e.waitForURL(/\/invite\//);
    await e.getByRole("button", { name: "Join" }).click();
    await e.waitForURL(`**/app/${spaceId}`);
    const item = e.locator("[data-id]").filter({ hasText: QUOTE });
    await expect(item).toBeVisible();
    await e.keyboard.press("j");
    await e.keyboard.press("a");
    await expect(item).toHaveCount(0); // approved: it left the "New" list
    await expect
      .poll(async () => (await sql<{ status: string }>("select status from testimonials where space_id = $1", [spaceId]))[0].status)
      .toBe("approved");

    // The link worked once.
    const fresh = await newContext(browser);
    const f = await fresh.newPage();
    await f.goto(inviteLink);
    await expect(f.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
    await fresh.close();
  });

  test("an editor can't delete the space or manage members, also on the server", async () => {
    await e.goto(`/app/${spaceId}/settings`);
    await expect(e.locator(`[data-member="${ownerEmail}"]`)).toContainText("Owner");
    await expect(e.locator(`[data-member="${editorEmail}"]`)).toContainText("Editor");
    await expect(e.getByRole("button", { name: "Delete space" })).toHaveCount(0);
    await expect(e.getByLabel("Email to invite")).toHaveCount(0);
    await expect(e.getByRole("button", { name: "Leave space" })).toBeVisible();
    expect(await axe(e)).toEqual([]);

    // Replay the owner's own server-action calls with the editor's session: the server refuses them.
    const capture = (p: Page) => p.waitForRequest((r: Request) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
    await o.goto(`/app/${spaceId}/settings`);
    const sent = capture(o);
    await o.getByLabel("Email to invite").fill(uniqueEmail("second"));
    await o.getByRole("button", { name: "Invite" }).click();
    const invite = await sent;
    await expect(o.getByText("Invite sent")).toBeVisible();

    const scratch = await createSpace(o, "Scratch");
    await o.goto(`/app/${scratch}/settings`);
    await o.getByRole("button", { name: "Delete space" }).click();
    const deleted = capture(o);
    await o.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    const del = await deleted;
    await o.waitForURL(/\/app(\/|$)/);

    const replay = async (r: Request, body: string) => {
      const headers = { ...r.headers() };
      delete headers.cookie;
      const res = await editor.request.post(r.url(), { headers: { ...headers, origin: APP }, data: Buffer.from(body) });
      return res.text();
    };
    const intruder = uniqueEmail("intruder");
    expect(await replay(invite, JSON.stringify([spaceId, intruder]))).toContain("Only the owner can invite people");
    expect(await sql("select 1 from space_invites where email = $1", [intruder])).toHaveLength(0);
    expect(await replay(del, JSON.stringify([spaceId]))).toContain("Only the owner can delete the space");
    expect(await sql("select 1 from spaces where id = $1", [spaceId])).toHaveLength(1);
  });

  test("a removed member gets a 404", async () => {
    await o.goto(`/app/${spaceId}/settings`);
    await o
      .locator(`[data-member="${editorEmail}"]`)
      .getByRole("button", { name: /^More for / })
      .click();
    await o.getByRole("menuitem", { name: "Remove" }).click();
    await o.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(o.getByText("Removed")).toBeVisible();
    await expect(o.locator(`[data-member="${editorEmail}"]`)).toHaveCount(0);
    for (const path of [`/app/${spaceId}`, `/app/${spaceId}/settings`]) {
      const res = await e.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(e.getByText("Space not found")).toBeVisible();
    }
  });

  test("the owner hands the space over, then leaves", async ({ browser }) => {
    const nextEmail = uniqueEmail("team-next");
    await o.goto(`/app/${spaceId}/settings`);
    await o.getByLabel("Email to invite").fill(nextEmail);
    await o.getByRole("button", { name: "Invite" }).click();
    await expect(o.getByText("Invite sent")).toBeVisible();
    const link = (await mailTo(nextEmail, /invited you to Team Rockets/)).Text.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]{43}/)![0];
    const { ctx, page: n } = await signedIn(browser, nextEmail);
    await n.goto(link);
    await n.getByRole("button", { name: "Join" }).click();
    await n.waitForURL(`**/app/${spaceId}`);

    await o.reload();
    await o
      .locator(`[data-member="${nextEmail}"]`)
      .getByRole("button", { name: /^More for / })
      .click();
    await o.getByRole("menuitem", { name: "Make owner" }).click();
    await o.getByRole("alertdialog").getByRole("button", { name: "Make owner" }).click();
    await expect(o.locator(`[data-member="${nextEmail}"]`)).toContainText("Owner");
    await expect(o.locator(`[data-member="${ownerEmail}"]`)).toContainText("Editor");
    await expect(o.getByRole("button", { name: "Delete space" })).toHaveCount(0);

    await n.goto(`/app/${spaceId}/settings`);
    await expect(n.getByRole("button", { name: "Delete space" })).toBeVisible();

    await o.getByRole("button", { name: "Leave space" }).click();
    await o.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();
    await o.waitForURL(/\/app(\/|$)/);
    expect((await o.goto(`/app/${spaceId}`))?.status()).toBe(404);
    await ctx.close();
  });
});
