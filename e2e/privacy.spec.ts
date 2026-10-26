import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import pg from "pg";
import { withHashedIp, withoutTokens } from "../src/lib/auth-privacy";
import { footerAddress, LEGAL } from "../src/lib/legal/config";
import { mailStartupCheck } from "../src/lib/mail-driver";
import { createSpace, mailCode, mailTo, newContext, signIn, uniqueEmail } from "./helpers";

// Privacy: hashed IPs, givers' private links, reports, consent records, account export and deletion, owner-only
// features, the audit log and retention jobs.

const PORT = Number(process.env.E2E_PORT) || 3111;
const APP = `http://localhost:${PORT}`;
const BILLING = `http://localhost:${Number(process.env.E2E_BILLING_PORT) || PORT + 1}`;
const CRON = { authorization: "Bearer e2e-cron-secret" };

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

async function axe(p: Page) {
  await p.waitForTimeout(400);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

const stamp = Date.now();
let ipN = 0;
// A visitor in a fresh browser (no session), with their own IP.
async function visitor(browser: Browser, viewport = { width: 390, height: 844 }) {
  ipN++;
  return browser.newContext({ extraHTTPHeaders: { "x-real-ip": `10.88.${(stamp % 200) + 1}.${ipN}` }, viewport });
}

async function giveTestimonial(browser: Browser, slug: string, who: { name: string; email?: string; text: string }) {
  const ctx = await visitor(browser);
  const g = await ctx.newPage();
  await g.goto(`/${slug}`);
  await g.getByLabel("Your testimonial").fill(who.text);
  await g.getByLabel("Your name").fill(who.name);
  if (who.email) await g.getByLabel("Email").fill(who.email);
  await expect(g.locator("[data-field=consent]").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", `${APP}/legal/privacy`);
  await g.getByRole("checkbox").check();
  await g.waitForTimeout(2600);
  await g.getByRole("button", { name: "Send", exact: true }).click();
  await expect(g.getByRole("heading", { name: /Thank/ })).toBeVisible();
  await ctx.close();
}

test("pure rules: no OAuth tokens, hashed session IPs, no log mail in production, invite footer address", () => {
  expect(withoutTokens({ id: "a", accessToken: "x", refreshToken: "y", idToken: "z", scope: "read" })).toEqual({
    id: "a",
    accessToken: null,
    refreshToken: null,
    idToken: null,
    scope: "read",
  });
  expect(withHashedIp({ ipAddress: "10.1.2.3", userAgent: "ua" }, (ip) => `h(${ip})`)).toEqual({
    ipAddress: "h(10.1.2.3)",
    userAgent: "ua",
  });
  expect(withHashedIp({ ipAddress: "" }, (ip) => ip).ipAddress).toBeNull();
  expect(mailStartupCheck({ NODE_ENV: "development", MAIL_DRIVER: "log" })).toBe("ok");
  expect(mailStartupCheck({ NODE_ENV: "production", MAIL_DRIVER: "log" })).toBe("fail");
  expect(mailStartupCheck({ NODE_ENV: "production", APP_URL: "https://lovewall.tech" })).toBe("fail");
  expect(mailStartupCheck({ NODE_ENV: "production", POLAR_ACCESS_TOKEN: "x" })).toBe("fail");
  expect(mailStartupCheck({ NODE_ENV: "production", APP_URL: "http://localhost:3000" })).toBe("warn");
  expect(mailStartupCheck({ NODE_ENV: "production", SMTP_HOST: "smtp.example.com", APP_URL: "https://lovewall.tech" })).toBe("ok");
  expect(footerAddress("  1 Main St\nSpringfield ")).toBe("1 Main St\nSpringfield");
  // The policy's backup promise covers the database provider's backup window.
  expect(LEGAL.retention.deletedAccountDays).toBeGreaterThanOrEqual(LEGAL.retention.backupDays);
});

test.describe.serial("privacy end to end", () => {
  const ownerEmail = uniqueEmail("privacy-owner");
  const giverEmail = uniqueEmail("privacy-giver");
  let owner: BrowserContext;
  let page: Page;
  let spaceId = "";
  let slug = "";
  let widgetId = "";

  test.beforeAll(async ({ browser }) => {
    owner = await newContext(browser);
    page = await owner.newPage();
    await signIn(page, ownerEmail);
    spaceId = await createSpace(page, "Privacy Co");
    [{ slug }] = await sql<{ slug: string }>("select slug from spaces where id = $1", [spaceId]);
    [{ id: widgetId }] = await sql<{ id: string }>("select id from widgets where space_id = $1", [spaceId]);
    // The form asks for an email (off by default), so givers get a receipt. The default form is made on first view.
    await page.request.get(`/${slug}`);
    await sql(`update forms set fields = fields || '{"email":"optional"}'::jsonb where space_id = $1`, [spaceId]);
  });

  test.afterAll(async () => {
    await owner?.close();
  });

  test("sign-in stores no raw IP and no OAuth token", async () => {
    const [user] = await sql<{ id: string }>("select id from auth_users where email = $1", [ownerEmail]);
    const sessions = await sql<{ ip: string | null }>(`select "ipAddress" as ip from auth_sessions where "userId" = $1`, [user.id]);
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      expect(s.ip).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(s.ip).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
    // Better Auth's limiter rows are keyed by a hash in the app's table, never by "<ip><path>".
    expect(await sql(`select 1 from auth_rate_limits where key like '10.%'`)).toHaveLength(0);
    expect((await sql("select 1 from rate_limits where key like 'auth:%' limit 1")).length).toBe(1);
    expect(
      await sql(`select 1 from auth_accounts where "accessToken" is not null or "refreshToken" is not null or "idToken" is not null`),
    ).toHaveLength(0);
  });

  test("a giver gets a receipt, sees, edits and deletes their testimonial with the private link", async ({ browser }) => {
    await giveTestimonial(browser, slug, { name: "Gina Giver", email: giverEmail, text: "Clear and fast." });
    const [row] = await sql<{ id: string; consent_url: string; consent_text: string; consent_at: Date }>(
      "select id, consent_url, consent_text, consent_at from testimonials where space_id = $1 and name = 'Gina Giver'",
      [spaceId],
    );
    expect(row.consent_url).toBe(`${APP}/${slug}`);
    expect(row.consent_text).toContain("Privacy Co may share this publicly");

    // The owner sees the consent record.
    await page.goto(`/app/${spaceId}`);
    await page.locator(`[data-id="${row.id}"]`).hover();
    await page.locator(`[data-id="${row.id}"]`).getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const record = page.getByTestId("consent-record");
    await expect(record).toContainText("Privacy Co may share this publicly");
    await expect(record).toContainText(`${APP}/${slug}`);
    await page.keyboard.press("Escape");

    const mail = await mailTo(giverEmail, /Your testimonial for Privacy Co/);
    const link = mail.Text.match(/https?:\/\/\S+\/t\/[0-9A-Za-z]{24}/)?.[0];
    expect(link).toBeTruthy();
    expect(mail.Text).toContain("/legal/privacy");
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from giver_links where testimonial_id = $1", [row.id]);
    expect(n).toBe(1);
    // Only a hash of the token is stored.
    expect(await sql("select 1 from giver_links where token_hash = $1", [link!.split("/t/")[1]])).toHaveLength(0);

    await sql("update testimonials set status = 'approved' where id = $1", [row.id]);
    const ctx = await visitor(browser);
    const g = await ctx.newPage();
    await g.goto(link!);
    await expect(g.getByRole("heading", { name: "Your testimonial for Privacy Co" })).toBeVisible();
    await expect(g.getByTestId("giver-status")).toHaveText("Published");
    await expect(g.getByText("You agreed on")).toBeVisible();
    expect(await axe(g)).toEqual([]);
    await g.getByLabel("Your testimonial").fill("Clear, fast and kind.");
    await g.getByRole("button", { name: "Save changes" }).click();
    await expect(g.getByTestId("giver-message")).toHaveText("Saved. Privacy Co will review the change.");
    await expect(g.getByTestId("giver-status")).toHaveText("Waiting for review");
    const [edited] = await sql<{ text: string; status: string }>("select text, status from testimonials where id = $1", [row.id]);
    expect(edited).toEqual({ text: "Clear, fast and kind.", status: "new" });

    await g.getByRole("button", { name: "Delete testimonial" }).click();
    await g.getByRole("alertdialog").getByRole("button", { name: "Delete testimonial" }).click();
    await expect(g.getByText("Your testimonial is deleted.")).toBeVisible();
    expect(await sql("select 1 from testimonials where id = $1", [row.id])).toHaveLength(0);
    const log = await sql<{ action: string; actor_kind: string }>(
      "select action, actor_kind from audit_log where target = $1 order by id",
      [row.id],
    );
    expect(log.map((l) => `${l.actor_kind}:${l.action}`)).toEqual(["giver:giver.edit", "giver:giver.delete"]);

    // The link is dead now; so is a made-up one.
    await g.goto(link!);
    await expect(g.getByText("This link has expired, or the testimonial was deleted.")).toBeVisible();
    await g.goto("/t/AAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(g.getByRole("status")).toHaveText("This link has expired, or the testimonial was deleted.");
    await ctx.close();
  });

  test("anyone can report a published testimonial; members hide it from the inbox queue", async ({ browser }) => {
    await giveTestimonial(browser, slug, { name: "Rex Reported", text: "Total nonsense review." });
    const [t] = await sql<{ id: string }>("select id from testimonials where space_id = $1 and name = 'Rex Reported'", [spaceId]);
    await sql("update testimonials set status = 'approved' where id = $1", [t.id]);

    // Embeds and the wall page link to the report page.
    await expect.poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes(`/r/${widgetId}`)).toBe(true);
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/w/${widgetId}`);
    await v.getByRole("link", { name: "Report" }).click();
    await expect(v.getByRole("heading", { name: "Report a testimonial" })).toBeVisible();
    expect(await axe(v)).toEqual([]);
    await v.getByRole("button", { name: "Send report" }).click();
    await expect(v.getByText("Pick the testimonial")).toBeVisible();
    await v.getByRole("radio", { name: /Rex Reported/ }).check();
    await v.getByRole("radio", { name: "False or misleading" }).check();
    await v.getByLabel("Details (optional)").fill("Never a customer.");
    await v.getByRole("button", { name: "Send report" }).click();
    await expect(v.getByRole("heading", { name: "Thanks" })).toBeVisible();
    await ctx.close();

    const mail = await mailTo(ownerEmail, /A testimonial was reported/);
    expect(mail.Text).toContain("Never a customer.");

    await page.goto(`/app/${spaceId}`);
    const queue = page.getByTestId("reports");
    await expect(queue.getByTestId("report")).toHaveCount(1);
    await expect(queue).toContainText("False or misleading");
    await queue.getByRole("button", { name: "Hide" }).click();
    await expect(queue).toHaveCount(0);
    const [after] = await sql<{ status: string }>("select status from testimonials where id = $1", [t.id]);
    expect(after.status).toBe("hidden");
    const [report] = await sql<{ resolution: string }>("select resolution from reports where testimonial_id = $1", [t.id]);
    expect(report.resolution).toBe("hidden");
  });

  test("reports are limited and only for published testimonials", async ({ browser }) => {
    const [hidden] = await sql<{ id: string }>("select id from testimonials where space_id = $1 and name = 'Rex Reported'", [spaceId]);
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/r/${widgetId}?t=${hidden.id}`);
    // Hidden now: not offered.
    await expect(v.getByText("Nothing to report here.")).toBeVisible();
    await ctx.close();
    expect((await page.request.get("/r/not-a-widget!")).status()).toBe(404);
  });

  test("editors can't export, see integrations, domains or the activity log", async ({ browser }) => {
    const editorEmail = uniqueEmail("privacy-editor");
    const editor = await newContext(browser);
    const e = await editor.newPage();
    await signIn(e, editorEmail);
    const [ed] = await sql<{ id: string }>("select id from auth_users where email = $1", [editorEmail]);
    await sql("insert into space_members (space_id, user_id, role) values ($1, $2, 'editor')", [spaceId, ed.id]);
    expect((await e.request.get(`/api/spaces/${spaceId}/export?format=json`)).status()).toBe(403);
    await e.goto(`/app/${spaceId}`);
    await expect(e.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(e.getByRole("button", { name: "Export" })).toHaveCount(0);
    await e.goto(`/app/${spaceId}/settings`);
    await expect(e.getByRole("button", { name: "Leave space" })).toBeVisible();
    await expect(e.getByText("API keys")).toHaveCount(0);
    await expect(e.locator("#activity")).toHaveCount(0);
    await editor.close();

    // The owner's export works and is logged; the owner sees the log.
    const json = await (await page.request.get(`/api/spaces/${spaceId}/export?format=json`)).json();
    expect(json[0]).toHaveProperty("consent_text");
    expect(json[0]).toHaveProperty("consent_url");
    await page.goto(`/app/${spaceId}/settings`);
    const activity = page.getByTestId("activity");
    await expect(activity).toContainText("Exported");
    await expect(activity).toContainText("Hid a reported testimonial");
    await expect(activity).toContainText("A giver Deleted their testimonial", { ignoreCase: true });
  });

  test("files are cached for an hour at most", async () => {
    const key = `spaces/${spaceId}/avatar/${"A".repeat(12)}.jpg`;
    await sql(
      "insert into uploads (key, space_id, kind, content_type, size, claimed_at) values ($1, $2, 'avatar', 'image/jpeg', 10, now())",
      [key, spaceId],
    );
    const res = await page.request.get(`/api/files/${key}`, { maxRedirects: 0 });
    if (res.status() === 404) return; // no file storage configured on this machine
    expect(res.status()).toBe(302);
    expect(decodeURIComponent(res.headers().location)).toContain("max-age=3600");
    expect(res.headers()["cache-control"]).toContain("max-age=1800");
  });

  test("retention jobs forget invite tracking, old logs, old counters and dead links", async () => {
    const [form] = await sql<{ id: string }>("select id from forms where space_id = $1", [spaceId]);
    await sql(
      `insert into invites (id, space_id, form_id, email, subject, message, sent_at, opened_at, clicked_at)
       values ($1, $2, $3, 'old@lovewall.test', 's', 'm', now() - interval '100 days', now() - interval '99 days', now() - interval '99 days')`,
      [`inv${stamp}`.slice(0, 16), spaceId, form.id],
    );
    await sql("insert into audit_log (space_id, action, created_at) values ($1, 'testimonial.edit', now() - interval '400 days')", [
      spaceId,
    ]);
    await sql("insert into form_views (form_id, day, views) values ($1, current_date - 500, 3) on conflict do nothing", [form.id]);
    const res = await page.request.get("/api/cron/maintenance", { headers: CRON });
    expect(res.status()).toBe(200);
    expect((await res.json()).privacy.inviteTrackingCleared).toBeGreaterThanOrEqual(1);
    const [inv] = await sql<{ opened_at: Date | null; clicked_at: Date | null }>(
      "select opened_at, clicked_at from invites where space_id = $1",
      [spaceId],
    );
    expect(inv).toEqual({ opened_at: null, clicked_at: null });
    expect(await sql("select 1 from audit_log where space_id = $1 and created_at < now() - interval '1 year'", [spaceId])).toHaveLength(0);
    expect(await sql("select 1 from form_views where form_id = $1 and day < current_date - 400", [form.id])).toHaveLength(0);
  });

  test("account export has every space, the consent records and file links, and no secrets", async () => {
    await sql("insert into api_keys (id, space_id, name, scope, prefix, hash) values ($1, $2, 'Zapier', 'read', $3, 'secret-hash-value')", [
      `key${stamp}`.slice(0, 16),
      spaceId,
      `p${stamp}`.slice(0, 12),
    ]);
    await page.goto("/app/settings");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export data/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^lovewall-account-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await (await page.request.get("/api/account/export")).text();
    const data = JSON.parse(text);
    expect(data.account.email).toBe(ownerEmail);
    expect(data.spaces).toHaveLength(1);
    expect(data.spaces[0].space.name).toBe("Privacy Co");
    expect(data.spaces[0].testimonials[0].consent_text).toContain("may share this publicly");
    expect(data.spaces[0].api_keys[0].name).toBe("Zapier");
    expect(data.spaces[0].reports).toHaveLength(1);
    expect(Array.isArray(data.files.items)).toBe(true);
    expect(text).not.toContain("secret-hash-value");
    expect(text).not.toContain('"token_hash"');
  });

  test("deleting the account removes everything, cancels mail sent on its behalf and confirms by email", async () => {
    await sql(
      "insert into email_outbox (to_email, subject, html, body, reply_to, next_at) values ('x@lovewall.test', 'Invite', '', '', $1, now() + interval '1 day')",
      [ownerEmail],
    );
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
    await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
    const mail = await mailTo(ownerEmail, /Your Lovewall account is deleted/);
    expect(mail.Text).toContain("your space");
    expect(await sql("select 1 from spaces where id = $1", [spaceId])).toHaveLength(0);
    expect(await sql("select 1 from auth_users where email = $1", [ownerEmail])).toHaveLength(0);
    expect(await sql("select 1 from email_outbox where reply_to = $1 and sent_at is null", [ownerEmail])).toHaveLength(0);
    // The audit log keeps ids only, and outlives the space.
    expect((await sql("select 1 from audit_log where space_id = $1", [spaceId])).length).toBeGreaterThan(0);
  });
});

// Signs in on another server of the same build (the billing one).
async function signInAt(page: Page, base: string, email: string) {
  await page.goto(`${base}/login`);
  const started = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Code").fill(await mailCode(email, started));
  await page.waitForURL(/\/app(\/|$)/, { waitUntil: "commit" });
}

test("editors of a paused space can still leave it", async ({ browser }) => {
  const ownerEmail = uniqueEmail("privacy-paused");
  const editorEmail = uniqueEmail("privacy-paused-ed");
  const o = await newContext(browser);
  await signInAt(await o.newPage(), BILLING, ownerEmail);
  await o.close();
  // The owner's trial ended long ago; they have a space with an editor.
  const [owner] = await sql<{ id: string }>("select id from auth_users where email = $1", [ownerEmail]);
  const space = `ps${stamp}`.slice(0, 12);
  await sql("insert into spaces (id, owner_id, name, slug) values ($1, $2, 'Paused Co', $3)", [space, owner.id, `paused-${stamp}`]);
  await sql(`update auth_users set "createdAt" = now() - interval '40 days' where id = $1`, [owner.id]);

  const ctx = await newContext(browser);
  const e = await ctx.newPage();
  await signInAt(e, BILLING, editorEmail);
  const [ed] = await sql<{ id: string }>("select id from auth_users where email = $1", [editorEmail]);
  await sql("insert into space_members (space_id, user_id, role) values ($1, $2, 'editor')", [space, ed.id]);

  await e.goto(`${BILLING}/app/${space}`);
  await expect(e.getByRole("heading", { name: "This space is paused" })).toBeVisible();
  await e.getByRole("button", { name: "Leave space" }).click();
  await e.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();
  await expect
    .poll(async () => (await sql("select 1 from space_members where space_id = $1 and user_id = $2", [space, ed.id])).length)
    .toBe(0);
  await e.waitForURL((u) => u.pathname === "/app", { waitUntil: "commit" });
  await ctx.close();
});
