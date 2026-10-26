import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { createSpace, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// The whole product, end to end, against the production build. Runs in order; later steps use earlier state.
test.describe.configure({ mode: "serial" });

const ownerEmail = uniqueEmail("owner");
const XSS = `<img src=x onerror="window.__xss=1">`;
const QUOTE = `Lovewall made our launch page feel alive ${Date.now()}`;
let owner: BrowserContext;
let page: Page;
let spaceId = "";
let slug = "";
let widgetId = "";

async function axe(p: Page) {
  await p.waitForTimeout(600); // let entrance animations finish
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

test.beforeAll(async ({ browser }) => {
  owner = await newContext(browser);
  page = await owner.newPage();
});

test.afterAll(async () => {
  await owner?.close();
});

test("sign in with a code from email", async () => {
  await signIn(page, ownerEmail);
  await expect(page.getByRole("heading", { name: "Create your first space" })).toBeVisible();
});

test("create a space", async () => {
  spaceId = await createSpace(page, "Acme Rockets");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share your link" })).toBeVisible();
  const url = await page.getByTestId("collect-url").getAttribute("href");
  slug = new URL(url!).pathname.slice(1);
  expect(slug).toMatch(/^acme-rockets(-[a-z0-9]{4})?$/);
});

test("brand the collect page with a logo and questions", async ({ request }) => {
  await page.goto(`/app/${spaceId}/collect`);
  await page.getByRole("link", { name: "Testimonials" }).click(); // the default form
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles(path.join(__dirname, "fixtures", "photo.png"));
  await expect(page.getByText("Logo updated")).toBeVisible();
  await page.getByRole("button", { name: "Add hint" }).click();
  await page.getByLabel("Hint 4", { exact: true }).fill("Anything else?");
  await expect(page.getByText("Saved")).toBeVisible();
  const html = await (await request.get(`/${slug}`)).text();
  expect(html).toContain("Anything else?");
  expect(html).toMatch(/\/api\/files\/spaces\/[0-9A-Za-z]+\/logo\//);
});

test("a visitor submits a testimonial with rating, text and photo", async ({ browser }) => {
  const visitor = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const v = await visitor.newPage();
  const dialogs: string[] = [];
  v.on("dialog", (d) => (dialogs.push(d.message()), d.dismiss()));
  await v.goto(`/${slug}`);
  await expect(v.getByRole("heading", { name: "What do you love about Acme Rockets?" })).toBeVisible();
  await v.getByRole("radio", { name: "5 stars" }).click();
  await v.getByLabel("Your testimonial").fill(`${QUOTE}\n${XSS}`);
  await v.locator('input[type="file"][accept="image/*"]').setInputFiles(path.join(__dirname, "fixtures", "photo.png"));
  await v.getByLabel("Your name").fill("Ada Lovelace");
  await v.getByLabel("Title").fill("Founder");
  await v.getByLabel("Company").fill("Analytical Engines");
  // Sending without consent is refused.
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByText("Tick the box to agree.")).toBeVisible();
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600); // the form refuses inhumanly fast submissions
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  const share = v.getByRole("link", { name: "Share on X" });
  await expect(share).toHaveAttribute("href", /^https:\/\/x\.com\/intent\/post\?text=/);
  expect(dialogs).toEqual([]);
  await visitor.close();

  // The owner gets an email, with the text escaped.
  const mail = await mailTo(ownerEmail, /New testimonial from Ada Lovelace/);
  expect(mail.HTML).toContain("&lt;img src=x onerror=");
  expect(mail.HTML).not.toContain("<img src=x");
});

test("approve it in the inbox with the keyboard", async () => {
  await page.goto(`/app/${spaceId}`);
  const item = page.locator("[data-id]").filter({ hasText: QUOTE });
  await expect(item).toBeVisible();
  await expect(item.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  await expect(item.locator("img")).toHaveAttribute("src", /\/api\/files\/spaces\//);
  // The shortcuts work once the inbox has hydrated: retry "j" until the item takes focus.
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(item).toHaveAttribute("data-focused", "true", { timeout: 500 });
  }).toPass();
  await page.keyboard.press("a");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(item).toHaveCount(0); // it left the "New" list
  await page.getByRole("radio", { name: /Approved/ }).click();
  await expect(page.locator("[data-id]").filter({ hasText: QUOTE })).toBeVisible();
  // The XSS payload is plain text.
  await expect(page.locator("[data-id]").filter({ hasText: QUOTE }).getByText(XSS)).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("create a wall widget", async () => {
  await page.goto(`/app/${spaceId}/widgets`);
  await expect(page.getByText("Wall of love")).toBeVisible(); // made with the space
  await page.getByRole("button", { name: "New widget" }).first().click();
  await page.getByRole("button", { name: "Wall", exact: true }).click();
  await page.waitForURL(/\/widgets\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
  widgetId = page.url().split("/").pop()!;
  const preview = page.frameLocator('iframe[title="Widget preview"]');
  await expect(preview.getByText(QUOTE)).toBeVisible();
  await page.getByLabel("Widget name").fill("Homepage wall");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Embed" }).click();
  await expect(page.getByText(`data-lovewall="${widgetId}"`)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("embed.js shows the testimonial on another website", async ({ browser }) => {
  const site = await newContext(browser);
  const s = await site.newPage();
  await s.addInitScript(() => ((window as unknown as { __xss?: number }).__xss = 0));
  await s.goto(`${SITE}/site.html?id=${widgetId}`);
  const frame = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
  await expect(frame.getByText(QUOTE)).toBeVisible();
  await expect(frame.getByText(XSS)).toBeVisible();
  await expect(frame.getByText("Ada Lovelace")).toBeVisible();
  // The iframe sized itself to its content (no scrollbar, no clipping).
  const iframe = s.locator(`iframe[src$="/embed/${widgetId}"]`);
  await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).toBeGreaterThan(120);
  const inner = await frame.locator("body").evaluate((b) => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
    h: b.getBoundingClientRect().height,
  }));
  expect(inner.scroll).toBeLessThanOrEqual(inner.client + 1);
  const xss = await s.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  expect(xss).toBe(0);
  await site.close();
});

test("every layout renders in the embed", async ({ browser }) => {
  const site = await newContext(browser);
  const s = await site.newPage();
  const checks: [string, string][] = [
    ["Carousel", ".lw-car .lw-track .lw-card"],
    ["Marquee", ".lw-row"],
    ["Single", ".lw-single"],
    ["Rating badge", ".lw-badge"],
    ["Wall", ".lw-wall"],
  ];
  for (const [label, selector] of checks) {
    await page.goto(`/app/${spaceId}/widgets/${widgetId}`);
    await page.getByRole("radio", { name: label, exact: true }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await s.goto(`${SITE}/site.html?id=${widgetId}`);
    const frame = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
    await expect(frame.locator(selector).first()).toBeVisible();
    if (label === "Rating badge") {
      await expect(frame.getByText(/1 review/)).toBeVisible();
      await expect.poll(async () => (await s.locator(`iframe[src$="/embed/${widgetId}"]`).boundingBox())?.width ?? 999).toBeLessThan(400);
    }
  }
  await site.close();
});

test("the public wall page and its share image", async ({ request }) => {
  const res = await page.goto(`/w/${widgetId}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Acme Rockets" })).toBeVisible();
  await expect(page.getByText(QUOTE)).toBeVisible();
  await expect(page.getByRole("link", { name: "Add yours" })).toHaveAttribute("href", `/${slug}`);
  expect(await axe(page)).toEqual([]);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toContain(`/w/${widgetId}/opengraph-image`);
  const img = await request.get(new URL(og!).pathname);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  const api = await request.get(`/api/v1/widgets/${widgetId}`);
  expect(api.status()).toBe(200);
  const json = await api.json();
  expect(json.testimonials[0].text).toContain(QUOTE);
  expect(json.testimonials[0]).not.toHaveProperty("email");
});

test("widgets refresh as soon as testimonials change", async ({ request }) => {
  expect(await (await request.get(`/embed/${widgetId}`)).text()).toContain("Ada Lovelace");
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /Approved/ }).click();
  const item = page.locator("[data-id]").filter({ hasText: QUOTE });
  await item.click();
  await page.keyboard.press("h");
  await expect(item).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/embed/${widgetId}`)).text()).includes("Ada Lovelace")).toBe(false);
  await expect.poll(async () => (await (await request.get(`/w/${widgetId}`)).text()).includes("Ada Lovelace")).toBe(false);
  await page.getByRole("radio", { name: /Hidden/ }).click();
  await page.locator("[data-id]").filter({ hasText: QUOTE }).click();
  await page.keyboard.press("a");
  await expect.poll(async () => (await (await request.get(`/embed/${widgetId}`)).text()).includes("Ada Lovelace")).toBe(true);
});

test("import a post from X", async () => {
  const mock = process.env.E2E_MOCK_X === "1";
  const link = mock ? "https://x.com/lovewalltest/status/1850000000000000001" : "https://x.com/jack/status/20";
  const importLink = async (url: string) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("menuitem", { name: "Import" }).click();
    await page.getByLabel("Link", { exact: true }).fill(url);
    await page.getByRole("button", { name: "Continue" }).click();
  };
  await page.goto(`/app/${spaceId}`);
  await importLink(link);
  await page.getByRole("button", { name: "Import 1" }).click({ timeout: 20_000 });
  const expected = mock ? "Lovewall replaced our paid testimonial tool in ten minutes & it's free." : "just setting up my twttr";
  await expect(page.locator("[data-id]").filter({ hasText: expected })).toBeVisible({ timeout: 20_000 });
  // The same post twice: shown as already imported.
  await importLink(link);
  await expect(page.getByText("1 review · 1 imported")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  // Not a post link.
  await importLink("https://x.com/lovewalltest");
  await expect(page.getByText("That isn't a link to a post on X")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("import a CSV and add one by hand", async () => {
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Import" }).click();
  await page.getByRole("button", { name: "CSV file" }).click();
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(path.join(__dirname, "fixtures", "import.csv"));
  await expect(page.getByText("3 rows")).toBeVisible();
  await page.getByRole("button", { name: /^Import 3$/ }).click();
  await expect(page.getByText("Imported 2 · skipped 1")).toBeVisible();
  await expect(page.locator("[data-id]").filter({ hasText: "It compiles, ship it." })).toBeVisible();

  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Add manually" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Linus Example");
  await page.getByLabel("Testimonial", { exact: true }).fill("Added from a LinkedIn recommendation.");
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  await expect(page.locator("[data-id]").filter({ hasText: "Added from a LinkedIn recommendation." })).toBeVisible();
});

test("video recording with the browser camera", async ({ browser }) => {
  const visitor = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const v = await visitor.newPage();
  await v.goto(`/${slug}`);
  await v.getByRole("radio", { name: "Video" }).click();
  await v.getByRole("button", { name: "Turn on camera" }).click();
  await v.getByRole("button", { name: "Start recording" }).click();
  await v.waitForTimeout(2500);
  await v.getByRole("button", { name: "Stop recording" }).click();
  await expect(v.getByLabel("Your recording")).toBeVisible();
  await expect(v.getByRole("button", { name: "Retake" })).toBeVisible();
  await v.getByLabel("Your name").fill("Grace Camera");
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(1500);
  // A slow connection: the button shows upload progress until it's done.
  const cdp = await visitor.newCDPSession(v);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 200,
    downloadThroughput: 200_000,
    uploadThroughput: 120_000,
  });
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("button", { name: /Uploading/ })).toBeVisible();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible({ timeout: 45_000 });
  await visitor.close();

  await page.goto(`/app/${spaceId}`);
  const item = page.locator("[data-id]").filter({ hasText: "Grace Camera" });
  await expect(item.getByRole("button", { name: "Play video from Grace Camera" })).toBeVisible();
  const poster = await item.locator("img").last().getAttribute("src");
  expect(poster).toMatch(/\/api\/files\/spaces\/.+\/poster\//);
});

test("another user can't see or change this space", async ({ browser }) => {
  const other = await newContext(browser);
  const o = await other.newPage();
  await signIn(o, uniqueEmail("other"));
  for (const p of [`/app/${spaceId}`, `/app/${spaceId}/widgets`, `/app/${spaceId}/widgets/${widgetId}`, `/app/${spaceId}/settings`]) {
    const res = await o.goto(p);
    expect(res?.status(), p).toBe(404);
    await expect(o.getByText("Space not found").or(o.getByText("Page not found"))).toBeVisible();
  }
  await other.close();
});

test("public endpoints reject bad input, bots and floods", async ({ request }) => {
  const api = `/api/collect/${spaceId}`;
  const headers = { "x-real-ip": `10.99.${Math.floor(Math.random() * 200)}.9` };
  expect((await request.post(api, { headers, data: "not json" })).status()).toBe(400);
  expect((await request.post(api, { headers, data: { name: "", text: "x", consent: true, token: "1.a" } })).status()).toBe(400);
  expect((await request.post(api, { headers, data: { name: "Bot", text: "x", consent: false, token: "1.a" } })).status()).toBe(400);
  const big = await request.post(api, { headers, data: { name: "Big", text: "x".repeat(70_000), consent: true, token: "1.a" } });
  expect(big.status()).toBe(413);
  // A forged form stamp is refused.
  const forged = await request.post(api, {
    headers,
    data: { name: "Bot", text: "hello", consent: true, token: `${Date.now() - 10_000}.forged` },
  });
  expect(forged.status()).toBe(400);
  // A real form stamp, then a flood from one visitor: the fifth submission in ten minutes is refused.
  const html = await (await request.get(`/${slug}`)).text();
  const token = html.match(/\\"token\\":\\"(\d+\.[A-Za-z0-9_-]+)\\"/)?.[1] ?? html.match(/"token":"(\d+\.[A-Za-z0-9_-]+)"/)?.[1];
  expect(token).toBeTruthy();
  await new Promise((r) => setTimeout(r, 2700));
  const flood = { "x-real-ip": `10.97.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await request.post(api, { headers: flood, data: { name: `Flood ${i}`, text: "Great product", consent: true, token } });
    statuses.push(r.status());
  }
  expect(statuses).toEqual([200, 200, 200, 200, 429]);
  // Bots that fill the honeypot get a fake success and nothing is stored.
  const bot = await request.post(api, {
    headers: { "x-real-ip": "10.97.3.4" },
    data: { name: "Bot", text: "spam", consent: true, token, website: "http://spam" },
  });
  expect(bot.status()).toBe(200);
  // Uploads: wrong type and oversize files are refused before anything is stored.
  const up = `/api/collect/${spaceId}/upload`;
  expect((await request.post(up, { headers, data: { kind: "avatar", type: "image/svg+xml", size: 100 } })).status()).toBe(400);
  expect((await request.post(up, { headers, data: { kind: "video", type: "video/mp4", size: 900 * 1024 * 1024 } })).status()).toBe(400);
  expect(
    (await request.post(`/api/collect/nope1234/upload`, { headers, data: { kind: "avatar", type: "image/png", size: 100 } })).status(),
  ).toBe(404);
  // Presign requests are rate limited per visitor.
  const presignIp = `10.98.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await request.post(up, { headers: { "x-real-ip": presignIp }, data: { kind: "avatar", type: "image/png", size: 100 } });
    if (r.status() === 429) limited = true;
  }
  expect(limited).toBe(true);
  // Unclaimed uploads are never served.
  expect((await request.get(`/api/files/spaces/${spaceId}/avatar/AAAAAAAAAAAAAAAA.jpg`, { maxRedirects: 0 })).status()).toBe(404);
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /All/ }).click();
  await expect(page.locator("[data-id]").filter({ hasText: "Flood 3" })).toBeVisible();
  await expect(page.locator("[data-id]").filter({ hasText: "Flood 4" })).toHaveCount(0);
  await expect(page.locator("[data-id]").filter({ hasText: "spam" })).toHaveCount(0);
  // The maintenance cron needs its secret.
  expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
});

test("delete the account and everything in it", async ({ request }) => {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get(`/${slug}`)).status()).toBe(404);
  expect((await request.get(`/embed/${widgetId}`)).status()).toBe(404);
  expect((await request.get(`/api/v1/widgets/${widgetId}`)).status()).toBe(404);
});
