import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { csvToRows, decodeText, detectPreset, fileToRows } from "../src/lib/csv";
import { htmlText, sniff, stars } from "../src/lib/import/parse";
import { detectSource, sourceLabel, sourceOf, SOURCES } from "../src/lib/sources";
import { createSpace, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// Imports end to end: every official feed and API is the mock in e2e/mocks/import.mjs (IMPORT_TEST_ENDPOINT).

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

// A Google Business Profile reviews.json from Google Takeout, and a Google Play Console reviews CSV (UTF-16).
const TAKEOUT = JSON.stringify({
  reviews: [
    {
      name: "accounts/1/locations/2/reviews/a",
      reviewer: { displayName: "Lena Vogel", profilePhotoUrl: "https://lh3.googleusercontent.com/a/x" },
      starRating: "FIVE",
      comment: "Best flat white in Kreuzberg.",
      createTime: "2026-09-05T13:22:37.087133Z",
      updateTime: "2026-09-05T13:22:37.087133Z",
    },
    {
      name: "accounts/1/locations/2/reviews/b",
      reviewer: { displayName: "Marco Rossi" },
      starRating: "FOUR",
      comment: "(Translated by Google) Cozy and quiet.\n\n(Original)\nGemütlich und ruhig.",
      createTime: "2026-09-01T08:00:00Z",
    },
    {
      name: "accounts/1/locations/2/reviews/c",
      reviewer: { displayName: "Rating only" },
      starRating: "THREE",
      createTime: "2026-08-01T08:00:00Z",
    },
  ],
});
const PLAY_CSV =
  "Package Name,App Version Code,App Version Name,Reviewer Language,Device,Review Submit Date and Time,Review Submit Millis Since Epoch,Review Last Update Date and Time,Review Last Update Millis Since Epoch,Star Rating,Review Title,Review Text,Developer Reply Date and Time,Developer Reply Millis Since Epoch,Developer Reply Text,Review Link\n" +
  "com.northwind.notes,12,1.2.0,en,pixel,2026-10-01T10:00:00Z,1790000000000,2026-10-01T10:00:00Z,1790000000000,5,,Syncs before I put the phone down.,,,,https://play.google.com/apps/publish/?dev_acc=1#ReviewPlace:id=1\n" +
  "com.northwind.notes,12,1.2.0,en,pixel,2026-10-02T10:00:00Z,1790000000000,2026-10-02T10:00:00Z,1790000000000,4,,,,,,\n";
const utf16 = (text: string) => Buffer.from(`\uFEFF${text}`, "utf16le");

test("sources: links are detected, stored values map back", () => {
  expect(detectSource("https://apps.apple.com/us/app/notes/id111111111")).toMatchObject({ id: "appstore", how: "fetch", sync: true });
  expect(detectSource("https://wordpress.org/plugins/acme/")).toMatchObject({ id: "wordpress", how: "fetch", sync: true });
  expect(detectSource("https://news.ycombinator.com/item?id=1")?.how).toBe("fetch");
  expect(detectSource("https://youtu.be/dQw4w9WgXcQ")?.how).toBe("fetch");
  expect(detectSource("https://x.com/ada_example/status/1")?.how).toBe("fetch");
  // Sites without an official feed, API or oEmbed endpoint come in by hand.
  expect(detectSource("play.google.com/store/apps/details?id=com.acme")).toMatchObject({ id: "googleplay", how: "hand" });
  expect(detectSource("https://www.google.com/maps/place/Northwind+Cafe")).toMatchObject({ id: "google", how: "hand" });
  for (const link of ["trustpilot.com/review/acme.com", "g2.com/products/acme", "reddit.com/r/x/comments/abc", "linkedin.com/posts/x"]) {
    expect(detectSource(link)?.how, link).toBe("hand");
  }
  expect(SOURCES.filter((s) => s.sync).map((s) => s.id)).toEqual(["appstore", "wordpress"]);
  expect(detectSource("just some words")).toBeNull();
  expect(sourceLabel("twitter")).toBe("X");
  expect(sourceLabel("Play Store")).toBe("Google Play");
  expect(sourceLabel("Discord")).toBe("Discord");
  expect(sourceOf("Product Hunt")?.icon).toBeTruthy();
});

test("parsers: HTML to text, ratings, file types", () => {
  expect(htmlText("<p>One &amp; two</p><p>Three<br>four</p><script>x()</script>")).toBe("One & two\n\nThree\nfour");
  expect(stars(8, 10)).toBe(4);
  expect(stars(0)).toBeNull();
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

test("export presets: Google Takeout, Google Play, Yotpo and Judge.me", () => {
  const google = fileToRows(TAKEOUT);
  expect(google.preset).toBe("google");
  expect(google.rows[0]).toEqual({
    name: "Lena Vogel",
    text: "Best flat white in Kreuzberg.",
    rating: "5",
    date: "2026-09-05T13:22:37.087133Z",
    source: "Google",
  });
  // Google's translation is dropped: the author's own words stay. No photos are taken from the export.
  expect(google.rows[1]).toMatchObject({ name: "Marco Rossi", text: "Gemütlich und ruhig.", rating: "4" });
  expect(google.rows[2]).toMatchObject({ name: "Rating only", rating: "3" });
  expect(google.rows[2].text).toBeUndefined();
  expect(fileToRows('{"other": []}').missing).toEqual(["name", "text"]);

  const play = fileToRows(decodeText(utf16(PLAY_CSV)));
  expect(play.preset).toBe("googleplay");
  expect(play.missing).toEqual([]);
  expect(play.rows[0]).toEqual({
    name: "Google Play user",
    text: "Syncs before I put the phone down.",
    rating: "5",
    date: "2026-10-01T10:00:00Z",
    source: "Google Play",
  });
  expect(play.rows).toHaveLength(2);

  const yotpo = csvToRows(
    "app_key,Review ID,Review Creation Date,Review Type,Review Status,Status Details,Review Source,Review Score,Review Title,Review Content,Reviewer Display Name,Reviewer Email\n" +
      "k,1,2026-09-01,Site review,Published,,Email,5,Love it,Arrived in two days.,Ada L.,ada@example.com\n" +
      "k,2,2026-09-02,Site review,Rejected,,Email,1,Spam,Buy followers,Bot,bot@example.com\n",
  );
  expect(yotpo.preset).toBe("yotpo");
  expect(yotpo.rows).toEqual([{ name: "Ada L.", text: "Arrived in two days.", rating: "5", date: "2026-09-01", source: "Form" }]);

  const judgeme = csvToRows(
    "title,body,rating,review_date,source,curated,reviewer_name,reviewer_email,product_id,product_handle,reply,reply_date,picture_urls,ip_address,location\n" +
      "Great mug,Keeps coffee hot for hours.,5,2026-09-03 10:00:00 UTC,web,ok,Grace H.,g@example.com,1,mug,,,,,\n" +
      "x,spam text,1,2026-09-03 10:00:00 UTC,web,spam,Spammer,s@example.com,1,mug,,,,,\n",
  );
  expect(judgeme.preset).toBe("judgeme");
  expect(judgeme.rows).toHaveLength(1);
  expect(judgeme.rows[0]).toMatchObject({ name: "Grace H.", text: "Keeps coffee hot for hours.", rating: "5", source: "Form" });

  // Tab-separated files work like comma-separated ones.
  expect(csvToRows("name\ttext\nAda\tLovely, really\n").rows[0]).toEqual({ name: "Ada", text: "Lovely, really" });
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

  test("a Hacker News reply", async () => {
    await pasteLink("https://news.ycombinator.com/item?id=4242");
    await expect(page.getByRole("heading", { name: "Show HN: Northwind, notes that sync" })).toBeVisible();
    // A thread starts with nothing ticked.
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
    await page.getByLabel("Import review from pg_fan").check();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(row("Been using Northwind for a month. It's quick.")).toBeVisible();
  });

  test("a YouTube video keeps its title, channel and link, and follows the video", async ({ request }) => {
    await pasteLink("https://youtu.be/mockvideo01");
    await expect(page.getByRole("heading", { name: "Northwind in 60 seconds" })).toBeVisible();
    await expect(page.getByText("Removed here if the video is deleted")).toBeVisible();
    await page.getByRole("button", { name: "Import 1" }).click();
    const video = row("Northwind in 60 seconds");
    await expect(video.getByRole("link", { name: "YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=mockvideo01");
    // No copy of YouTube's thumbnail.
    await expect(video.locator('img[src*="/api/files/"]')).toHaveCount(0);

    // A week later the cron looks again: the new title comes along while the owner hasn't edited it...
    const cron = () => request.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    const age = () =>
      sql("update testimonials set checked_at = now() - interval '8 days' where space_id = $1 and source = 'YouTube'", [spaceId]);
    await fetch(`${SITE}/import/__stage?video=mockvideo01&state=renamed`);
    await age();
    expect((await cron()).status()).toBe(200);
    await page.reload();
    await expect(row("Northwind in 59 seconds")).toBeVisible();
    // ...and once the video is deleted, the testimonial goes too.
    await fetch(`${SITE}/import/__stage?video=mockvideo01&state=gone`);
    await age();
    expect((await (await cron()).json()).imports).toHaveProperty("recheck.removed");
    await page.reload();
    await page.getByRole("radio", { name: /^All/ }).click();
    await expect(row("Northwind in 59 seconds")).toHaveCount(0);
    expect(await sql("select 1 from testimonials where space_id = $1 and source = 'YouTube'", [spaceId])).toHaveLength(0);
  });

  test("an owner's edit is kept when the post changes", async ({ request }) => {
    await fetch(`${SITE}/import/__stage?video=mockvideo01&state=`);
    await pasteLink("https://youtu.be/mockvideo01");
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(row("Northwind in 60 seconds")).toBeVisible();
    await sql("update testimonials set text = 'Watch our 60 second tour.' where space_id = $1 and source = 'YouTube'", [spaceId]);
    await fetch(`${SITE}/import/__stage?video=mockvideo01&state=renamed`);
    await sql("update testimonials set checked_at = now() - interval '8 days' where space_id = $1 and source = 'YouTube'", [spaceId]);
    const res = await request.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect(res.status()).toBe(200);
    expect(
      await sql(
        "select text, checked_at > now() - interval '1 hour' as checked from testimonials where space_id = $1 and source = 'YouTube'",
        [spaceId],
      ),
    ).toEqual([{ text: "Watch our 60 second tour.", checked: true }]);
    await sql("delete from testimonials where space_id = $1 and source = 'YouTube'", [spaceId]);
  });

  test("Google reviews from Takeout and Google Play reviews from Play Console", async () => {
    await openImport();
    await page.getByRole("button", { name: "Google", exact: true }).click();
    await expect(page.getByText("Add Google reviews yourself.")).toBeVisible();
    expect(await axe()).toEqual([]);
    await page.getByRole("button", { name: "Export file" }).click();
    await expect(page.getByRole("dialog", { name: "Google export" })).toBeVisible();
    await expect(page.getByText("Each location's folder has a reviews.json.")).toBeVisible();
    await page
      .locator('input[type="file"][aria-label="Choose a JSON file"]')
      .setInputFiles({ name: "reviews.json", mimeType: "application/json", buffer: Buffer.from(TAKEOUT) });
    await expect(page.getByText("Google export · 3 rows")).toBeVisible();
    expect(await axe()).toEqual([]);
    await page.getByRole("button", { name: "Import 3" }).click();
    // The rating-only review has no words to show.
    await expect(page.getByText("Imported 2 · skipped 1")).toBeVisible();
    await expect(row("Best flat white in Kreuzberg.").getByRole("img", { name: "Google" })).toBeVisible();
    await expect(row("Gemütlich und ruhig.")).toBeVisible();

    await pasteLink("https://play.google.com/store/apps/details?id=com.northwind.notes");
    await page.getByRole("button", { name: "Export file" }).click();
    await expect(page.getByText("Download reports › Reviews")).toBeVisible();
    await page
      .locator('input[type="file"][aria-label="Choose a CSV file"]')
      .setInputFiles({ name: "reviews_com.northwind.notes_202610.csv", mimeType: "text/csv", buffer: utf16(PLAY_CSV) });
    await expect(page.getByText("Google Play export · 2 rows")).toBeVisible();
    await page.getByRole("button", { name: "Import 2" }).click();
    await expect(page.getByText("Imported 1 · skipped 1")).toBeVisible();
    await expect(row("Syncs before I put the phone down.").getByText("Google Play user")).toBeVisible();
  });

  test("a link to a site Lovewall doesn't read shows the ways to add it by hand", async () => {
    await pasteLink("https://www.g2.com/products/northwind/reviews");
    const sheet = page.getByRole("dialog", { name: "G2" });
    await expect(sheet.getByText("Add G2 reviews yourself.")).toBeVisible();
    // No export file G2 documents, so no preset.
    await expect(sheet.getByRole("button", { name: "Export file" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Browser extension" })).toHaveAttribute("href", /\/extension$/);
    expect(await axe()).toEqual([]);
    await sheet.getByRole("button", { name: "Paste" }).click();
    const add = page.getByRole("dialog", { name: "Add from G2" });
    await expect(add).toBeVisible();
    await expect(add.getByLabel("Link")).toHaveValue("https://www.g2.com/products/northwind/reviews");
    await add.getByLabel("Name", { exact: true }).fill("Rosa Diaz");
    await add.getByLabel("Testimonial", { exact: true }).fill("Pasted from G2 by hand.");
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await expect(row("Pasted from G2 by hand.")).toBeVisible();
    await expect(row("Pasted from G2 by hand.").getByRole("link", { name: "G2" })).toBeVisible();

    // Reddit too: a screenshot keeps the source.
    await pasteLink("https://www.reddit.com/r/productivity/comments/abc123/anyone_using_northwind/c0ment1/");
    await expect(page.getByText("Add Reddit posts yourself.")).toBeVisible();
    await page.getByRole("button", { name: "Screenshots" }).click();
    await page.locator('input[type="file"][aria-label="Choose screenshots"]').setInputFiles(path.join(__dirname, "fixtures", "photo.png"));
    await expect(page.getByRole("combobox", { name: "Source" })).toHaveText(/Reddit/);
    await page.getByLabel("Name for screenshot 1").fill("Kim Novak");
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.locator("[data-id]").filter({ hasText: "Kim Novak" }).getByRole("img", { name: "Reddit" })).toBeVisible();
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
    await expect(hana.getByRole("link", { name: "X" })).toHaveAttribute("href", /x\.com\/hana_example/);
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
    const show = page.locator("[data-mention]").filter({ hasText: "the only notes app that stuck" });
    await expect(hn).toBeVisible({ timeout: 20_000 });
    await expect(show).toBeVisible();
    await expect(page.locator("[data-mention]").filter({ hasText: "Unrelated" })).toHaveCount(0);
    expect(await axe()).toEqual([]);

    const cron = await request.get("/api/cron/maintenance", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect(cron.status()).toBe(200);
    const digest = await mailTo(ownerEmail, /2 new mentions of Northwind/);
    expect(digest.Text).toContain("the only notes app that stuck");

    await hn.getByRole("button", { name: "Save as testimonial" }).click();
    await expect(page.getByText("Saved as testimonial")).toBeVisible();
    await expect(hn).toHaveCount(0);
    await show.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("No new mentions")).toBeVisible();
    await page.getByRole("radio", { name: /^Dismissed/ }).click();
    await expect(show).toBeVisible();

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
