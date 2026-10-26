import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSpace, newContext, signIn, SITE, uniqueEmail } from "./helpers";
import { parseConfig, defaultConfig, WIDGET_TYPES } from "../src/lib/widget/config";
import { customCss, jsonLd, widgetDocument } from "../src/lib/widget/render";
import { pageBody } from "../src/lib/widget/page";
import { SAMPLES } from "../src/lib/widget/samples";

// Showing testimonials: every widget layout on another website, the popup, the wall page, custom CSS, Google star
// snippets, analytics, share images, video trimming and export. Runs in order; later steps use earlier state.
test.describe.configure({ mode: "serial" });

const XSS = `</script><script>window.__pwn=1</script><img src=x onerror="window.__pwn=2">`;
// A real browser's user agent: headless Chrome is filtered out of the analytics as a bot.
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const LONG = `${"Northwind runs our whole week now. ".repeat(9)}The end.`;
let owner: BrowserContext;
let page: Page;
let spaceId = "";
let slug = "";
let widgetId = "";

const ip = () => `10.${60 + Math.floor(Math.random() * 30)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function axe(p: Page) {
  await p.waitForTimeout(500);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

// Visitors send testimonials through the public form API (each from its own address, under the per-IP limits).
async function submit(
  request: APIRequestContext,
  people: { name: string; text: string; rating?: number; company?: string; title?: string }[],
) {
  const html = await (await request.get(`/${slug}`)).text();
  const token = html.match(/\\"token\\":\\"(\d+\.[A-Za-z0-9_-]+)\\"/)?.[1] ?? html.match(/"token":"(\d+\.[A-Za-z0-9_-]+)"/)?.[1];
  expect(token).toBeTruthy();
  await new Promise((r) => setTimeout(r, 2700));
  for (const p of people) {
    const res = await request.post(`/api/collect/${spaceId}`, { headers: { "x-real-ip": ip() }, data: { ...p, consent: true, token } });
    expect(res.status(), p.name).toBe(200);
  }
}

// Picks a layout in the configurator and waits until the embed serves it.
async function setLayout(label: string, type: string) {
  await page.goto(`/app/${spaceId}/widgets/${widgetId}`);
  await page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: label, exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes(`class="lw lw-t-${type}"`), {
      timeout: 15_000,
    })
    .toBe(true);
}

async function openEdit(name: string) {
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /^All/ }).click();
  const item = page.locator("[data-id]").filter({ hasText: name }).first();
  await item.hover();
  await item.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit testimonial" })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  owner = await newContext(browser);
  page = await owner.newPage();
});

test.afterAll(async () => {
  await owner?.close();
});

test("set up a space with testimonials", async ({ request }) => {
  await signIn(page, uniqueEmail("show"));
  spaceId = await createSpace(page, "Show Rockets");
  slug = new URL((await page.getByTestId("collect-url").getAttribute("href"))!).pathname.slice(1);
  await submit(request, [
    { name: "Ada Lovelace", text: "Rockets that actually launch on time.", rating: 5, company: "Analytical Engines", title: "Founder" },
    { name: "Grace Hopper", text: LONG, rating: 4, company: "Navy Labs" },
    { name: "Evil Eve", text: `Great product ${XSS}`, rating: 5 },
    { name: "=1+2", text: "Formula in the name", rating: 3 },
  ]);
  // Approve them all, tag two, give Ada's company a logo.
  await page.goto(`/app/${spaceId}`);
  const first = page.locator("[data-id]").first();
  await first.hover();
  await first.getByRole("checkbox").last().click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("toolbar").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved · 4/)).toBeVisible();
  await page.getByRole("radio", { name: /^Approved/ }).click();
  for (const [name, tag] of [
    ["Ada Lovelace", "pricing"],
    ["Grace Hopper", "support"],
  ]) {
    await page.locator("[data-id]").filter({ hasText: name }).click();
    await page.keyboard.press("t");
    await page.getByLabel("New tag").fill(tag);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Tags updated").first()).toBeVisible();
  }
  await openEdit("Ada Lovelace");
  await page.getByLabel("Company logo file").setInputFiles(path.join(__dirname, "fixtures", "photo.png"));
  await expect(page.getByRole("button", { name: "Change company logo" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  // An image testimonial (a screenshot), added by hand.
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Add manually" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Screenshot Sam");
  await page.getByLabel("Screenshot", { exact: true }).setInputFiles(path.join(__dirname, "fixtures", "photo.png"));
  await expect(page.getByAltText("Screenshot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  await expect(
    page.locator("[data-id]").filter({ hasText: "Screenshot Sam" }).getByAltText("Screenshot from Screenshot Sam"),
  ).toBeVisible();
});

test("a video testimonial, trimmed, plays only its range", async ({ browser }) => {
  const visitor = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const v = await visitor.newPage();
  await v.goto(`/${slug}`);
  await v.getByRole("radio", { name: "Video" }).click();
  await v.getByRole("button", { name: "Turn on camera" }).click();
  await v.getByRole("button", { name: "Start recording" }).click();
  await v.waitForTimeout(3000);
  await v.getByRole("button", { name: "Stop recording" }).click();
  await v.getByLabel("Your name").fill("Vera Video");
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(1500);
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible({ timeout: 45_000 });
  await visitor.close();

  await page.goto(`/app/${spaceId}`);
  await page.locator("[data-id]").filter({ hasText: "Vera Video" }).click();
  await page.keyboard.press("a");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

  // Trim with the keyboard: start at 0.5 s, end a second later; and make the start frame the poster.
  await openEdit("Vera Video");
  const start = page.getByRole("slider", { name: "Start" });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(start).toHaveAttribute("aria-valuetext", "0:00.5");
  const end = page.getByRole("slider", { name: "End" });
  await end.focus();
  await page.keyboard.press("Home"); // the end can't come before start + 0.5 s
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(end).toHaveAttribute("aria-valuetext", "0:01.5");
  await page.getByRole("button", { name: "Use as poster" }).click();
  await expect(page.getByText("Poster set")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  // The inbox player and every widget player get the range.
  const thumb = page.locator("[data-id]").filter({ hasText: "Vera Video" });
  await thumb.getByRole("button", { name: "Play video from Vera Video" }).click();
  await expect(thumb.locator("video")).toHaveAttribute("src", /#t=0\.50,1\.50$/);

  await page.goto(`/app/${spaceId}/widgets`);
  widgetId = await page
    .locator('a[href*="/widgets/"]')
    .first()
    .getAttribute("href")
    .then((h) => h!.split("/").pop()!);
  await setLayout("Video", "video");
  const html = await (await page.request.get(`/embed/${widgetId}`)).text();
  expect(html).toMatch(/data-start="0\.50" data-end="1\.50"/);
  const site = await newContext(browser);
  const s = await site.newPage();
  await s.goto(`${SITE}/site.html?id=${widgetId}`);
  const frame = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
  await frame.getByRole("button", { name: "Play video from Vera Video" }).click();
  const video = frame.locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.5);
  // It stops at the end of the range and rewinds to its start.
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused), { timeout: 10_000 }).toBe(true);
  const t = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  expect(t).toBeGreaterThanOrEqual(0.45);
  expect(t).toBeLessThanOrEqual(1.6);
  await site.close();
});

test("every layout renders on another website", async ({ browser }) => {
  const site = await newContext(browser);
  const s = await site.newPage();
  const checks: [string, string, string][] = [
    ["Wall", "wall", ".lw-wall .lw-card"],
    ["Grid", "grid", ".lw-grid .lw-card"],
    ["List", "list", ".lw-list .lw-li"],
    ["Carousel", "carousel", ".lw-car .lw-track .lw-card"],
    ["Marquee", "marquee", ".lw-row"],
    ["Gallery", "gallery", ".lw-tile img"],
    ["Single", "single", ".lw-single"],
    ["Hero quote", "hero", ".lw-hq .lw-text"],
    ["Video", "video", ".lw-vid video"],
    ["Rating badge", "badge", ".lw-badge"],
    ["Avatars", "avatars", ".lw-avs"],
    ["Logos", "logos", ".lw-logo-row li"],
  ];
  for (const [label, cls, selector] of checks) {
    await setLayout(label, cls);
    await s.goto(`${SITE}/site.html?id=${widgetId}`);
    const frame = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
    await expect(frame.locator(selector).first(), label).toBeVisible();
    await expect
      .poll(async () => (await s.locator(`iframe[src$="/embed/${widgetId}"]`).boundingBox())?.height ?? 0, { message: label })
      .toBeGreaterThan(30);
    if (label === "Avatars") await expect(frame.getByText(/Loved by \d+ customers/)).toBeVisible();
    if (label === "Logos") {
      await expect(frame.getByRole("img", { name: "Analytical Engines" })).toBeVisible();
      await expect(frame.getByText("Navy Labs")).toBeVisible(); // no logo: set in type
    }
    if (label === "Gallery") {
      // The image opens in a lightbox that covers the screen, and closes with Escape.
      await frame.getByRole("button", { name: "Open image from Screenshot Sam" }).click();
      await expect(frame.getByRole("dialog", { name: "Image" })).toBeVisible();
      const box = await s.locator(`iframe[src$="/embed/${widgetId}"]`).boundingBox();
      expect(box?.width).toBeGreaterThan(1000);
      await s.keyboard.press("Escape");
      await expect(frame.getByRole("dialog", { name: "Image" })).toHaveCount(0);
    }
  }
  await site.close();
});

test("the popup floats in a corner without covering the page", async ({ browser }) => {
  await setLayout("Popup", "popup");
  await page.getByRole("combobox", { name: "First after" }).click();
  await page.getByRole("option", { name: "At once" }).click();
  await expect.poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes('data-delay="0"')).toBe(true);
  await page.getByRole("button", { name: "Embed" }).click();
  await expect(page.getByText(`data-lovewall="${widgetId}" data-lovewall-float`)).toBeVisible();
  await page.keyboard.press("Escape");

  const site = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const s = await site.newPage();
  await s.goto(`${SITE}/show/site.html?id=${widgetId}&float=1`);
  const iframe = s.locator(`iframe[src$="/embed/${widgetId}"]`);
  const frame = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
  await expect(frame.locator(".lw-pc.lw-on")).toBeVisible();
  await expect.poll(() => iframe.evaluate((f) => getComputedStyle(f).position)).toBe("fixed");
  const box = (await iframe.boundingBox())!;
  expect(box.x).toBeLessThan(20);
  expect(box.y + box.height).toBeGreaterThan(780);
  expect(box.width).toBeLessThan(420);
  // The div it was placed in takes no room in the page.
  expect((await s.locator("[data-lovewall]").boundingBox())!.height).toBeLessThan(4);
  // Closing it leaves the page clickable underneath.
  await frame.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => iframe.evaluate((f) => getComputedStyle(f).visibility)).toBe("hidden");
  await s.locator("#corner").click({ timeout: 3000 });
  await site.close();

  // Hidden on phones unless switched on.
  const phone = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const p = await phone.newPage();
  await p.goto(`${SITE}/show/site.html?id=${widgetId}&float=1`);
  await expect.poll(() => p.locator(`iframe[src$="/embed/${widgetId}"]`).evaluate((f) => getComputedStyle(f).display)).toBe("none");
  await phone.close();
});

test("custom CSS applies but can't break out of its style tag", async ({ browser }) => {
  await setLayout("Grid", "grid");
  const css = `.lw-card{outline:3px solid rgb(255, 0, 0)}\n</style><script>window.__pwn=1</script><style>\n</STYLE ><img src=x onerror="window.__pwn=2">`;
  await page.getByLabel("Custom CSS").fill(css);
  await expect.poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes("outline:3px solid")).toBe(true);
  const html = await (await page.request.get(`/embed/${widgetId}`)).text();
  expect(html).not.toMatch(/<script>window\.__pwn/);
  expect(html).not.toMatch(/<img src=x/i);
  expect((html.match(/<\/style>/gi) ?? []).length).toBe(2); // ours and the owner's, nothing else
  const site = await newContext(browser);
  const s = await site.newPage();
  await s.goto(`${SITE}/site.html?id=${widgetId}`);
  const card = s.frameLocator(`iframe[src$="/embed/${widgetId}"]`).locator(".lw-card").first();
  await expect(card).toHaveCSS("outline-color", "rgb(255, 0, 0)");
  expect(await s.frames()[1].evaluate(() => (window as unknown as { __pwn?: number }).__pwn ?? 0)).toBe(0);
  await s.goto(`/w/${widgetId}`);
  await expect(s.locator(".lw-card").first()).toHaveCSS("outline-color", "rgb(255, 0, 0)");
  expect(await s.evaluate(() => (window as unknown as { __pwn?: number }).__pwn ?? 0)).toBe(0);
  await site.close();
  await page.getByLabel("Custom CSS").fill("");
  await expect.poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes("outline:3px solid")).toBe(false);
});

test("Google review stars land in the host page's head and on the wall page", async ({ browser }) => {
  await page.goto(`/app/${spaceId}/widgets/${widgetId}`);
  await page.getByRole("switch", { name: "Review stars" }).click();
  await expect(page.getByText("Google decides if stars show.")).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/embed/${widgetId}`)).text()).includes("application/ld+json")).toBe(true);
  const html = await (await page.request.get(`/embed/${widgetId}`)).text();
  const raw = html.match(/<script type="application\/ld\+json" id="lw-ld">([^<]*)<\/script>/)?.[1];
  expect(raw).toBeTruthy();
  expect(raw).not.toContain("</script");

  const site = await newContext(browser);
  const s = await site.newPage();
  await s.addInitScript(() => ((window as unknown as { __pwn?: number }).__pwn = 0));
  await s.goto(`${SITE}/site.html?id=${widgetId}`);
  const ld = s.locator('head script[type="application/ld+json"][data-lovewall-ld]');
  await expect(ld).toHaveCount(1);
  const data = JSON.parse((await ld.textContent())!);
  expect(data["@type"]).toBe("Product");
  expect(data.name).toBe("Show Rockets");
  expect(data.aggregateRating.ratingValue).toBeGreaterThan(3);
  expect(data.review.some((r: { reviewBody: string }) => r.reviewBody.includes("</script><script>"))).toBe(true);
  expect(await s.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBe(0);
  await s.goto(`/w/${widgetId}`);
  const wallLd = JSON.parse((await s.locator('script[type="application/ld+json"]').textContent())!);
  expect(wallLd.aggregateRating.reviewCount).toBeGreaterThan(0);
  expect(await s.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBe(0);
  await site.close();
});

test("wall page: header text, tag filters, a call to action and Add yours", async ({ browser }) => {
  await page.goto(`/app/${spaceId}/widgets/${widgetId}?tab=page`);
  await page.getByLabel("Heading").fill("Rocket reviews");
  await page.getByLabel("Text", { exact: true }).fill("What launch teams say.");
  await page.getByLabel("Label").fill("Start free");
  await page.getByLabel("Link").fill("javascript:alert(1)");
  await expect(page.getByText("Not a valid link")).toBeVisible();
  await page.getByLabel("Link").fill("example.com/start");
  await expect(page.getByText("Not a valid link")).toHaveCount(0);
  await page.getByRole("radio", { name: "Split" }).click();
  const preview = page.frameLocator('iframe[title="Page preview"]');
  await expect(preview.getByRole("heading", { name: "Rocket reviews" })).toBeVisible();
  await expect
    .poll(async () => (await (await page.request.get(`/w/${widgetId}`)).text()).includes("Rocket reviews"), { timeout: 15_000 })
    .toBe(true);
  expect(await axe(page)).toEqual([]);

  const visitor = await newContext(browser, { viewport: { width: 1440, height: 900 } });
  const v = await visitor.newPage();
  await v.goto(`/w/${widgetId}`);
  await expect(v.getByRole("heading", { name: "Rocket reviews" })).toBeVisible();
  await expect(v.getByText("What launch teams say.")).toBeVisible();
  await expect(v.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "https://example.com/start");
  await expect(v.getByRole("link", { name: "Add yours" })).toHaveAttribute("href", `/${slug}`);
  await expect(v.locator(".lw-page")).toHaveClass(/lw-ps-split/);
  const filters = v.getByRole("group", { name: "Filter by tag" });
  await filters.getByRole("button", { name: "pricing" }).click();
  await expect(filters.getByRole("button", { name: "pricing" })).toHaveAttribute("aria-pressed", "true");
  await expect(v.locator(".lw-card:visible")).toHaveCount(1);
  await expect(v.locator(".lw-card:visible")).toContainText("Ada Lovelace");
  await filters.getByRole("button", { name: "All" }).click();
  await expect.poll(() => v.locator(".lw-card:visible").count()).toBeGreaterThan(3);
  expect(await axe(v)).toEqual([]);
  await visitor.close();

  // "Add yours" can be switched off.
  await page.getByRole("switch", { name: "Add yours" }).click();
  await expect.poll(async () => (await (await page.request.get(`/w/${widgetId}`)).text()).includes(">Add yours<")).toBe(false);
});

test("views (once visible) and clicks are counted, without cookies", async ({ browser, request }) => {
  await setLayout("Grid", "grid");
  const visitor = await browser.newContext({
    userAgent: UA,
    extraHTTPHeaders: { "x-real-ip": ip() },
    viewport: { width: 1280, height: 600 },
  });
  const v = await visitor.newPage();
  const beacons: string[] = [];
  v.on("request", (r) => r.url().endsWith("/api/e") && beacons.push(r.postData() ?? ""));
  await v.goto(`${SITE}/show/site.html?id=${widgetId}`);
  await v.waitForTimeout(1500);
  expect(beacons.filter((b) => b.includes('"view"'))).toHaveLength(0); // still below the fold
  await v.locator(`iframe[src$="/embed/${widgetId}"]`).scrollIntoViewIfNeeded();
  await expect.poll(() => beacons.filter((b) => b.includes('"view"')).length).toBe(1);
  const frame = v.frameLocator(`iframe[src$="/embed/${widgetId}"]`);
  await frame.getByRole("button", { name: "Read more" }).click();
  await expect(frame.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect.poll(() => beacons.filter((b) => b.includes('"click"')).length).toBe(1);
  expect(JSON.parse(beacons[0]).h).toBe("127.0.0.1");
  expect(await visitor.cookies()).toEqual([]);
  // A reload in the same half hour is not a second view.
  await v.reload();
  await v.locator(`iframe[src$="/embed/${widgetId}"]`).scrollIntoViewIfNeeded();
  await v.waitForTimeout(1500);
  await visitor.close();

  await page.goto(`/app/${spaceId}/widgets/${widgetId}?tab=stats`);
  await expect(page.getByRole("radio", { name: /Views/ })).toContainText("1");
  await expect(page.getByRole("radio", { name: /Clicks/ })).toContainText("1");
  await expect(page.getByText("127.0.0.1")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.goto(`/app/${spaceId}/widgets`);
  await expect(page.locator(`a[href$="/widgets/${widgetId}"]`)).toContainText("1 view");

  // The beacon refuses other sites, junk, and floods; bots are ignored. (What counts as the widget's own page is in
  // the security suite.)
  const body = (t: string, w = widgetId) => JSON.stringify({ w, t, h: "example.com" });
  const embedOf = (w: string) => `http://localhost:${Number(process.env.E2E_PORT) || 3111}/embed/${w}`;
  const same = { "sec-fetch-site": "same-origin", referer: embedOf(widgetId), "user-agent": UA };
  expect(
    (await request.post("/api/e", { headers: { "sec-fetch-site": "cross-site", "user-agent": UA }, data: body("view") })).status(),
  ).toBe(403);
  expect((await request.post("/api/e", { headers: same, data: "nope" })).status()).toBe(400);
  expect((await request.post("/api/e", { headers: same, data: body("hug") })).status()).toBe(400);
  expect(
    (
      await request.post("/api/e", {
        headers: { ...same, referer: embedOf("Nope1234Nope"), "x-real-ip": ip() },
        data: body("click", "Nope1234Nope"),
      })
    ).status(),
  ).toBe(404);
  expect((await request.post("/api/e", { headers: { ...same, "user-agent": "Googlebot/2.1" }, data: body("view") })).status()).toBe(204);
  const flood = { ...same, "x-real-ip": ip() };
  const statuses: number[] = [];
  for (let i = 0; i < 32; i++) statuses.push((await request.post("/api/e", { headers: flood, data: body("click") })).status());
  expect(statuses.slice(0, 30).every((st) => st === 204)).toBe(true);
  expect(statuses.at(-1)).toBe(429);
});

test("share images are PNGs, for members only", async ({ browser, request }) => {
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /^All/ }).click();
  const item = page.locator("[data-id]").filter({ hasText: "Ada Lovelace" });
  await item.hover();
  await item.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Share image" }).click();
  const dialog = page.getByRole("dialog", { name: "Share image" });
  await expect(dialog.getByAltText("Preview")).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("radio", { name: "Story" }).click();
  await dialog.getByRole("radio", { name: "Dark" }).click();
  await expect(dialog.getByAltText("Preview")).toHaveAttribute("src", /size=story&style=dark/);
  await expect(dialog.getByAltText("Preview")).toBeVisible({ timeout: 15_000 });
  // The Download link is dimmed until the preview loads; check contrast once it's live.
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveAttribute("aria-disabled", "false", { timeout: 15_000 });
  expect(await axe(page)).toEqual([]);
  const url = (await dialog.getByRole("link", { name: "Download" }).getAttribute("href"))!;
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="ada-lovelace-story\.png"/);
  expect((await res.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.keyboard.press("Escape");
  // Signed out: refused. Another user: not found.
  expect((await request.get(url)).status()).toBe(401);
  const other = await newContext(browser);
  const o = await other.newPage();
  await signIn(o, uniqueEmail("show-other"));
  expect((await o.request.get(url)).status()).toBe(404);
  expect((await o.request.get(`/api/spaces/${spaceId}/export?format=csv`)).status()).toBe(404);
  await other.close();
});

test("export the inbox as CSV and JSON, and download a video", async ({ request }) => {
  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /^All/ }).click();
  await page.getByRole("button", { name: "Export" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^show-rockets.*-testimonials-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  const [header, ...rows] = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");
  expect(header.split(",")).toEqual(
    expect.arrayContaining([
      "id",
      "status",
      "name",
      "email",
      "rating",
      "text",
      "tags",
      "video_url",
      "video_start",
      "video_end",
      "company_logo_url",
    ]),
  );
  expect(rows.length).toBeGreaterThanOrEqual(6);
  expect(csv).toContain("Ada Lovelace");
  expect(csv).toMatch(/,'=1\+2,/); // spreadsheets won't run it as a formula
  expect(csv).toContain('"Great product </script><script>window.__pwn=1</script><img src=x onerror=""window.__pwn=2"">"');
  expect(csv).toMatch(/Vera Video.*,0\.5,1\.5,/);

  // JSON, filtered by tag.
  const json = await (await page.request.get(`/api/spaces/${spaceId}/export?format=json&status=all&tag=pricing`)).json();
  expect(json).toHaveLength(1);
  expect(json[0]).toMatchObject({ name: "Ada Lovelace", tags: ["pricing"], answers: {} });
  expect((await request.get(`/api/spaces/${spaceId}/export?format=json`)).status()).toBe(401);

  // A video downloads under a readable name.
  const item = page.locator("[data-id]").filter({ hasText: "Vera Video" });
  const id = await item.getAttribute("data-id");
  const res = await page.request.get(`/api/spaces/${spaceId}/testimonials/${id}/video`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(decodeURIComponent(res.headers().location)).toMatch(/attachment; filename="vera-video-\d{4}-\d{2}-\d{2}\.(webm|mp4)"/);
});

test("new screens pass axe in dark mode", async ({ browser }) => {
  const dark = await newContext(browser, { colorScheme: "dark" });
  const d = await dark.newPage();
  await d.goto(`/w/${widgetId}`);
  expect(await axe(d)).toEqual([]);
  await dark.close();
  await page.emulateMedia({ colorScheme: "dark" });
  for (const tab of ["design", "page", "stats"]) {
    await page.goto(`/app/${spaceId}/widgets/${widgetId}?tab=${tab}`);
    expect(await axe(page), tab).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
});

test("delete the account and its files", async ({ request }) => {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
  expect((await request.get(`/embed/${widgetId}`)).status()).toBe(404);
});

// Pure functions: no server needed.

test("custom CSS sanitiser: nothing can close the style element", () => {
  for (const evil of [
    "</style><script>alert(1)</script>",
    "</STYLE ><svg onload=alert(1)>",
    "<\u0000/style>",
    "<!--</style>-->",
    "@import url(https://evil.example/x.css);",
  ]) {
    const out = customCss(`.a{color:red}${evil}`);
    expect(out).not.toContain("<");
    expect(out).not.toMatch(/@import/i);
    expect(out).toContain(".a{color:red}");
  }
  expect(customCss("x".repeat(20_000)).length).toBe(8000);
});

test("JSON-LD is safe inside a script element", () => {
  const evil = { ...SAMPLES[0], name: "</script><script>alert(1)</script>", text: "a < b && c > d \u2028 </script>", rating: 5 };
  const ld = jsonLd({ space: { name: "<b>x</b>", slug: "x", logo: null, website: null }, items: [evil] });
  expect(ld).not.toMatch(/[<>&\u2028\u2029]/);
  expect(JSON.parse(ld).review[0].author.name).toBe("</script><script>alert(1)</script>");
  expect(jsonLd({ space: { name: "x", slug: "x", logo: null, website: null }, items: [] })).toBe("");
});

test("JSON-LD marks up only testimonials collected through Lovewall", () => {
  const space = { name: "x", slug: "x", logo: null, website: null };
  const own = { ...SAMPLES[0], source: "Form", rating: 4 };
  const imported = [
    { ...SAMPLES[1], source: "LinkedIn", rating: 5 },
    { ...SAMPLES[2], source: "X", rating: 5 },
    { ...SAMPLES[3], source: "Google", rating: 5 },
  ];
  // Imported reviews alone: no markup at all.
  expect(jsonLd({ space, items: imported })).toBe("");
  // Mixed: the aggregate and the reviews come from the form-collected ones only.
  const data = JSON.parse(jsonLd({ space, items: [...imported, own] }));
  expect(data.aggregateRating).toMatchObject({ ratingValue: 4, reviewCount: 1 });
  expect(data.review).toHaveLength(1);
  expect(data.review[0].author.name).toBe(own.name);
});

test("every new layout escapes user content", () => {
  const evil = {
    ...SAMPLES[0],
    name: `<img src=x onerror=alert(1)>`,
    text: `</blockquote><script>alert(1)</script>`,
    company: `"><svg onload=alert(1)>`,
    image: `https://x.test/a.png"><script>alert(1)</script>`,
    companyLogo: `https://x.test/l.png" onerror="alert(1)`,
    video: "https://x.test/v.mp4",
  };
  for (const type of WIDGET_TYPES) {
    const config = parseConfig({
      ...defaultConfig(type),
      avatarsText: `<b>{count}</b>`,
      logosCaption: `<i>x</i>`,
      ctaLabel: "<b>Go</b>",
      ctaUrl: "https://x.test",
    });
    const html = widgetDocument({
      widgetId: "abcdefgh1234",
      type,
      config,
      items: [evil],
      summary: { average: 5, count: 1, rated: 1 },
      space: { name: "<b>Space</b>", slug: "s", logo: null, website: null },
      appUrl: "https://testimonials.example.com",
      mode: "embed",
    });
    for (const bad of ["<script>alert", "<img src=x", "<svg onload", '" onerror="alert', "<b>", "<i>"])
      expect(html, `${type}: ${bad}`).not.toContain(bad);
  }
  const page = pageBody({
    widgetId: "abcdefgh1234",
    config: parseConfig({ pageTitle: "<h1>x</h1>", pageText: "<script>x</script>", ctaLabel: "<b>Go</b>", ctaUrl: "javascript:alert(1)" }),
    items: [{ ...evil, tags: ['x"><script>alert(1)</script>'] }],
    summary: { average: 5, count: 1 },
    space: { name: "S", slug: "s", logo: null, website: null },
    appUrl: "https://testimonials.example.com",
    mode: "page",
  });
  expect(page).not.toMatch(/<script>|<h1>x|<b>Go|javascript:/);
});
