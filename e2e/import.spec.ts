import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { csvToRows, detectPreset } from "../src/lib/csv";
import { htmlText, jsonLdReviews, sniff, stars } from "../src/lib/import/parse";
import { detectSource, sourceLabel, sourceOf } from "../src/lib/sources";
import { createSpace, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// Imports end to end: every third party is the mock in e2e/mocks/import.mjs (IMPORT_TEST_ENDPOINT).

test("sources: links are detected, stored values map back", () => {
  expect(detectSource("https://apps.apple.com/us/app/notes/id111111111")?.id).toBe("appstore");
  expect(detectSource("play.google.com/store/apps/details?id=com.acme")?.id).toBe("googleplay");
  expect(detectSource("https://www.google.com/maps/place/Northwind+Cafe")?.id).toBe("google");
  expect(detectSource("https://news.ycombinator.com/item?id=1")?.id).toBe("hackernews");
  expect(detectSource("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("youtube");
  expect(detectSource("https://www.linkedin.com/posts/x")?.how).toBe("paste");
  expect(detectSource("just some words")).toBeNull();
  expect(sourceLabel("twitter")).toBe("X");
  expect(sourceLabel("Play Store")).toBe("Google Play");
  expect(sourceLabel("Discord")).toBe("Discord");
  expect(sourceOf("Product Hunt")?.icon).toBeTruthy();
});

test("parsers: HTML to text, JSON-LD reviews, ratings, file types", () => {
  expect(htmlText("<p>One &amp; two</p><p>Three<br>four</p><script>x()</script>")).toBe("One & two\n\nThree\nfour");
  expect(stars(8, 10)).toBe(4);
  expect(stars(0)).toBeNull();
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Acme",
    aggregateRating: { ratingValue: 4.8 },
    review: [
      {
        "@type": "Review",
        "@id": "https://example.com/r/1",
        reviewBody: "<p>Great</p>",
        reviewRating: { ratingValue: 5 },
        author: { name: "Ada" },
      },
    ],
  })}</script>`;
  const found = jsonLdReviews(html, "https://example.com/p");
  expect(found.label).toBe("Acme");
  expect(found.items[0]).toMatchObject({ url: "https://example.com/r/1", name: "Ada", text: "Great", rating: 5 });
  expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image/png");
  expect(sniff(Buffer.from("000000186674797069736f6d", "hex"))).toBe("video/mp4");
  expect(sniff(Buffer.from("<html>"))).toBeNull();
});

test("CSV presets: Senja and Testimonial.to exports", () => {
  const senja = csvToRows(
    "type,integration,title,text,rating,attachments,url,date,video_mp4_url,tags,customer_name,customer_avatar,customer_tagline,customer_company\n" +
      'text,Play Store,,"Great app",0,"https://s3.example/a.jpg,https://stream.mux.com/x/high.mp4",,2026-10-09 10:05:07.905+00,,"a,b",Ada,https://img.example/ada.png,CEO,Acme\n',
  );
  expect(senja.preset).toBe("senja");
  expect(senja.rows[0]).toMatchObject({
    name: "Ada",
    text: "Great app",
    title: "CEO",
    company: "Acme",
    source: "Google Play",
    image: "https://s3.example/a.jpg",
    avatar: "https://img.example/ada.png",
  });
  expect(senja.rows[0].rating).toBeUndefined();
  expect(new Date(senja.rows[0].date!).toISOString()).toBe("2026-10-09T10:05:07.905Z");

  const tto = csvToRows(
    '"id","type","createdAt","submitterName","submitterEmail","submitterAvatar","message","attachedImages","tags","title","videoURL","imageThumbnail"\n' +
      '"-Oz1","text","Jan 2, 2023","Grace "G" Hopper","g@example.com","https://cdn.testimonial.to/a","Ship it","https://cdn.testimonial.to/1|https://cdn.testimonial.to/2","x","Admiral at Navy","",""\n' +
      '"-Oz2","video","Jan 3, 2023","Alan","","","","","","","https://stream.mux.com/p.m3u8","https://image.mux.com/p/thumbnail.jpg"\n',
  );
  expect(detectPreset(["id", "type", "submitterName"])).toBe("testimonialto");
  expect(tto.rows[0]).toMatchObject({
    name: 'Grace "G" Hopper',
    title: "Admiral",
    company: "Navy",
    source: "Form",
    image: "https://cdn.testimonial.to/1",
  });
  // HLS links can't be copied: that row keeps no video (and no text), so the import skips it.
  expect(tto.rows[1]?.video).toBeUndefined();
});

test.describe.serial("import flow", () => {
  const ownerEmail = uniqueEmail("import");
  let owner: BrowserContext;
  let page: Page;
  let spaceId = "";

  const row = (text: string) => page.locator("[data-id]").filter({ hasText: text });
  // An <img> that actually loaded (a broken one is still "visible").
  const loaded = (img: ReturnType<Page["locator"]>) =>
    expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);

  async function openImport() {
    await page.goto(`/app/${spaceId}`);
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("menuitem", { name: "Import" }).click();
    await expect(page.getByRole("dialog", { name: "Import" })).toBeVisible();
  }

  async function pasteLink(link: string) {
    await openImport();
    await page.getByLabel("Link", { exact: true }).fill(link);
    await page.getByRole("button", { name: "Continue" }).click();
  }

  async function axe() {
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
    return r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  }

  test.beforeAll(async ({ browser }) => {
    owner = await newContext(browser);
    page = await owner.newPage();
    await signIn(page, ownerEmail);
    spaceId = await createSpace(page, "Northwind");
  });

  test.afterAll(async () => {
    await owner?.close();
  });

  test("paste an App Store link: preview, pick, import", async () => {
    await openImport();
    expect(await axe()).toEqual([]);
    await page.getByLabel("Link", { exact: true }).fill("https://apps.apple.com/us/app/northwind-notes/id111111111");
    await expect(page.getByRole("dialog").locator("label").getByText("App Store", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Northwind Notes" })).toBeVisible();
    await expect(page.getByText("3 reviews")).toBeVisible();
    expect(await axe()).toEqual([]);
    await page.getByLabel("Import review from Ana Lima").uncheck();
    await page.getByRole("button", { name: "Import 2" }).click();
    await expect(page.getByText("Imported 2")).toBeVisible();
    await expect(row("Northwind Notes keeps my whole week in one place.")).toBeVisible();
    await expect(row("Fast sync between my phone and laptop.")).toBeVisible();
    await expect(row("Wish it had a dark icon.")).toHaveCount(0);
  });

  test("importing the same link again skips what's already in", async () => {
    await pasteLink("https://apps.apple.com/us/app/northwind-notes/id111111111");
    await expect(page.getByText("3 reviews · 2 imported")).toBeVisible();
    await expect(page.getByLabel("Import review from Priya Raman")).toBeDisabled();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.getByText("Imported 1")).toBeVisible();
    await expect(row("Wish it had a dark icon.")).toBeVisible();
    await expect(page.locator("[data-id]")).toHaveCount(3);
  });

  test("Trustpilot from the source list", async () => {
    await openImport();
    await page.getByRole("button", { name: "Trustpilot" }).click();
    await page.getByLabel("Trustpilot link").fill("northwind.example");
    await page.getByRole("button", { name: "Find" }).click();
    await expect(page.getByRole("heading", { name: "Northwind" })).toBeVisible();
    await page.getByRole("button", { name: "Import 2" }).click();
    await expect(page.getByText("Imported 2")).toBeVisible();
    await expect(row("Northwind support answered in minutes & fixed it.")).toBeVisible();
    // The reviewer's photo was copied into storage.
    await loaded(row("answered in minutes").locator('img[src*="/api/files/"]'));
    await expect(row("answered in minutes").getByRole("link", { name: "Trustpilot" })).toHaveAttribute(
      "href",
      "https://www.trustpilot.com/reviews/tp-0001",
    );
  });

  test("a Reddit comment and a Hacker News reply", async () => {
    await pasteLink("https://www.reddit.com/r/productivity/comments/abc123/anyone_using_northwind/c0ment1/");
    await expect(page.getByLabel("Import review from quiet_river")).toBeChecked();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(row("Switched to Northwind last year, never looked back.")).toBeVisible();

    await pasteLink("https://news.ycombinator.com/item?id=4242");
    await expect(page.getByRole("heading", { name: "Show HN: Northwind, notes that sync" })).toBeVisible();
    // A thread starts with nothing ticked.
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
    await page.getByLabel("Import review from pg_fan").check();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(row("Been using Northwind for a month. It's quick.")).toBeVisible();
  });

  test("a YouTube video keeps its thumbnail and link", async () => {
    await pasteLink("https://youtu.be/mockvideo01");
    await expect(page.getByRole("heading", { name: "Northwind in 60 seconds" })).toBeVisible();
    await page.getByRole("button", { name: "Import 1" }).click();
    const video = row("Northwind in 60 seconds");
    await loaded(video.getByRole("img", { name: "Screenshot from Desk Setups" }));
    await expect(video.getByRole("link", { name: "YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=mockvideo01");
  });

  test("Google reviews by business name", async () => {
    await openImport();
    await page.getByRole("button", { name: "Google", exact: true }).click();
    await page.getByLabel("Maps link or business name").fill("Northwind Cafe Berlin");
    await page.getByRole("button", { name: "Find" }).click();
    await expect(page.getByRole("heading", { name: "Northwind Cafe" })).toBeVisible();
    await expect(page.getByText("Google shares 5 reviews at most")).toBeVisible();
    await page.getByRole("button", { name: "Import 2" }).click();
    await expect(row("Best flat white in Kreuzberg.")).toBeVisible();
    await loaded(row("Best flat white in Kreuzberg.").locator('img[src*="/api/files/"]'));
  });

  test("a site that blocks servers offers paste instead", async () => {
    await pasteLink("https://www.g2.com/products/northwind/reviews");
    await expect(page.getByText("G2 blocks our server")).toBeVisible();
    await page.getByRole("button", { name: "Paste" }).click();
    const sheet = page.getByRole("dialog", { name: "Add from G2" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Link")).toHaveValue("https://www.g2.com/products/northwind/reviews");
    await sheet.getByLabel("Name", { exact: true }).fill("Rosa Diaz");
    await sheet.getByLabel("Testimonial", { exact: true }).fill("Pasted from G2 by hand.");
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await expect(row("Pasted from G2 by hand.")).toBeVisible();
    await expect(row("Pasted from G2 by hand.").getByRole("link", { name: "G2" })).toBeVisible();
  });

  test("screenshots become image testimonials", async () => {
    await openImport();
    await page.getByRole("button", { name: "Screenshots" }).click();
    const photo = path.join(__dirname, "fixtures", "photo.png");
    await page.locator('input[type="file"][aria-label="Choose screenshots"]').setInputFiles([photo, photo]);
    await page.getByLabel("Name for screenshot 1").fill("Wen Li");
    await page.getByRole("combobox", { name: "Source" }).click();
    await page.getByRole("option", { name: "WhatsApp" }).click();
    expect(await axe()).toEqual([]);
    await page.getByRole("button", { name: "Import 2" }).click();
    await expect(page.getByText("Imported 2")).toBeVisible();
    await loaded(page.getByRole("img", { name: "Screenshot from Wen Li" }));
    await expect(page.locator("[data-id]").filter({ hasText: "No name" })).toHaveCount(1);
    await expect(page.locator("[data-id]").filter({ hasText: "Wen Li" }).getByRole("img", { name: "WhatsApp" })).toBeVisible();
  });

  test("move from Senja: the CSV preset copies photos, screenshots and videos", async () => {
    await openImport();
    await page.getByRole("button", { name: "Move from Senja" }).click();
    await expect(page.getByText("Export all to CSV")).toBeVisible();
    await page.locator('input[type="file"][aria-label="Choose a CSV file"]').setInputFiles(path.join(__dirname, "fixtures", "senja.csv"));
    await expect(page.getByText("Senja export · 3 rows")).toBeVisible();
    await page.getByRole("button", { name: "Import 3" }).click();
    await expect(page.getByText("Imported 3 · 3 files copied · 1 failed")).toBeVisible({ timeout: 30_000 });
    const hana = row("the calmest notes app");
    await loaded(hana.locator('img[src*="/api/files/"]'));
    await expect(hana.getByRole("link", { name: "X" })).toHaveAttribute("href", /x\.com\/hana_s/);
    await expect(page.getByRole("button", { name: "Play video from Diego Torres" })).toBeVisible();
    await loaded(page.getByRole("img", { name: "Screenshot from Aisha Bello" }));
    // The same export again: nothing new.
    await openImport();
    await page.getByRole("button", { name: "Move from Senja" }).click();
    await page.locator('input[type="file"][aria-label="Choose a CSV file"]').setInputFiles(path.join(__dirname, "fixtures", "senja.csv"));
    await page.getByRole("button", { name: "Import 3" }).click();
    await expect(page.getByText("Imported 0 · skipped 3")).toBeVisible();
  });

  test("keep a source in sync: only new reviews, auto-approved by rating, owner emailed", async ({ request }) => {
    await fetch(`${SITE}/import/__stage?app=222222222&n=1`);
    await pasteLink("https://apps.apple.com/us/app/northwind-calendar/id222222222");
    await expect(page.getByRole("heading", { name: "Northwind Calendar" })).toBeVisible();
    await page.getByLabel("Import review from Lea Park").uncheck();
    await page.getByRole("switch", { name: "Keep in sync" }).click();
    await page.getByRole("combobox", { name: "Auto-approve" }).click();
    await page.getByRole("option", { name: "4 stars and up" }).click();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.getByText("Imported 1 · in sync")).toBeVisible();

    // Two new reviews appear on the App Store; the cron (or Sync now) picks up only those.
    await fetch(`${SITE}/import/__stage?app=222222222&n=2`);
    const cron = await request.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect(cron.status()).toBe(200);
    expect(await cron.json()).toHaveProperty("imports.sync");
    await openImport();
    await expect(page.getByText("In sync")).toBeVisible();
    await page.getByRole("button", { name: "Northwind Calendar options" }).click();
    await page.getByRole("menuitem", { name: "Sync now" }).click();
    await expect(page.getByText("2 new", { exact: true })).toBeVisible();
    await expect(page.getByText(/Checked just now · 2 new/)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto(`/app/${spaceId}`);
    await page.getByRole("radio", { name: /^New/ }).click();
    await expect(row("Fresh two-star review that waits in the inbox.")).toBeVisible();
    await expect(row("Fresh five-star review after connecting.")).toHaveCount(0);
    await page.getByRole("radio", { name: /^Approved/ }).click();
    await expect(row("Fresh five-star review after connecting.")).toBeVisible();
    await page.getByRole("radio", { name: /^All/ }).click();
    await expect(row("the one the owner skipped")).toHaveCount(0);
    await mailTo(ownerEmail, /New testimonial from Omar Haddad/);
  });

  test("mentions: keywords, digest email, save as testimonial, dismiss", async ({ request }) => {
    await page.goto(`/app/${spaceId}`);
    // A link clicked while the page is still loading can leave it blank (app-wide router race, reported).
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Mentions" }).click();
    await expect(page.getByRole("heading", { name: "Mentions" })).toBeVisible();
    await expect(page.getByText("No keywords yet")).toBeVisible();
    expect(await axe()).toEqual([]);
    await page.getByLabel("Keywords").fill("Northwind");
    await page.getByLabel("Keywords").press("Enter");
    const hn = page.locator("[data-mention]").filter({ hasText: "the first notes app my whole team actually uses" });
    const rd = page.locator("[data-mention]").filter({ hasText: "the only notes app that stuck" });
    await expect(hn).toBeVisible({ timeout: 20_000 });
    await expect(rd).toBeVisible();
    await expect(page.locator("[data-mention]").filter({ hasText: "Unrelated" })).toHaveCount(0);
    expect(await axe()).toEqual([]);

    const cron = await request.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect(cron.status()).toBe(200);
    const digest = await mailTo(ownerEmail, /2 new mentions of Northwind/);
    expect(digest.Text).toContain("the only notes app that stuck");

    await hn.getByRole("button", { name: "Save as testimonial" }).click();
    await expect(page.getByText("Saved as testimonial")).toBeVisible();
    await expect(hn).toHaveCount(0);
    await rd.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("No new mentions")).toBeVisible();
    await page.getByRole("radio", { name: /^Dismissed/ }).click();
    await expect(rd).toBeVisible();

    await page.goto(`/app/${spaceId}`);
    await page.getByRole("radio", { name: /^All/ }).click();
    await expect(row("Northwind is the first notes app my whole team actually uses.")).toBeVisible();
    await expect(row("the first notes app").getByRole("link", { name: "Hacker News" })).toHaveAttribute(
      "href",
      "https://news.ycombinator.com/item?id=5151",
    );
  });

  test("mentions page passes axe in dark mode at phone width", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: await owner.storageState(),
      colorScheme: "dark",
      viewport: { width: 390, height: 844 },
    });
    const p = await ctx.newPage();
    await p.goto(`/app/${spaceId}/mentions`);
    await p.waitForTimeout(500);
    const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await ctx.close();
  });
});
