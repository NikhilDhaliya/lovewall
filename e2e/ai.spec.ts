import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import pg from "pg";
import { cleanHighlight, pageColors, readPage } from "../src/lib/ai/text";
import { cuesFromWords, toVtt, vttTime } from "../src/lib/ai/vtt";
import { textHtml } from "../src/lib/widget/render";
import { createSpace, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// AI end to end. A third server runs with AI keys pointed at e2e/mocks/ai.mjs (Claude and Deepgram never get called
// for real); the main server has no keys, which covers "no AI anywhere".

const PORT = Number(process.env.E2E_PORT) || 3111;
const AI = `http://localhost:${Number(process.env.E2E_AI_PORT) || PORT + 2}`;
const PLAIN = `http://localhost:${PORT}`;
const MAILPIT = "http://127.0.0.1:8025";

test.describe.configure({ mode: "serial" });

const LONG =
  "The setup took five minutes and our team now collects reviews every single day without chasing anyone. I really recommend it to every founder who sells online.";
const TYPOS = LONG.replace("The setup", "Teh setup").replace("really", "realy");
const BEST = "The setup took five minutes and our team now collects reviews every single day without chasing anyone.";
const SPOKEN = "Honestly, this product saved my team hours every week. I would recommend it to anyone.";

test("unit: captions, best lines, reading a page, marked text", () => {
  const cues = cuesFromWords([
    { word: "Honestly,", start: 0.2, end: 0.7 },
    { word: "it", start: 0.7, end: 0.9 },
    { word: "works.", start: 0.9, end: 1.3 },
    { word: "<b>Really</b>", start: 7, end: 7.5 },
  ]);
  expect(cues.map((c) => c.text)).toEqual(["Honestly, it works.", "<b>Really</b>"]);
  expect(vttTime(3725.5)).toBe("01:02:05.500");
  const vtt = toVtt(cues);
  expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.200 --> 00:00:01.300\nHonestly, it works.")).toBe(true);
  expect(vtt).toContain("&lt;b&gt;Really&lt;/b&gt;");

  expect(cleanHighlight(LONG, BEST)).toBe(BEST);
  expect(cleanHighlight(LONG, `“${BEST}”`)).toBe(BEST);
  expect(cleanHighlight(LONG, "a line the writer never wrote at all")).toBeNull();
  expect(cleanHighlight("Short and sweet.", "Short and sweet.")).toBeNull();

  const page = readPage(
    `<html><head><title>Acme — Tea</title><meta name="description" content="Fresh tea."><meta name="theme-color" content="#0f766e"><style>a{color:#0f766e}b{color:#fff}i{color:#333333}</style></head><body><h1>Tea</h1><script>evil()</script></body></html>`,
  );
  expect(page).toMatchObject({ title: "Acme — Tea", description: "Fresh tea.", themeColor: "#0f766e" });
  expect(page.text).not.toContain("evil");
  expect(pageColors("#fff #000 #0f766e #0F766E #abc")).toEqual(["#0f766e", "#aabbcc"]);

  expect(textHtml({ text: "<i>Fast</i> and kind. Truly great support.", highlight: "Truly great support." })).toBe(
    '&lt;i&gt;Fast&lt;/i&gt; and kind. <mark class="lw-hl">Truly great support.</mark>',
  );
  expect(textHtml({ text: "Hello", highlight: "not in it" })).toBe("Hello");
});

let owner: BrowserContext;
let page: Page;
let spaceId = "";
let slug = "";
let wallId = "";
const email = uniqueEmail("ai");

let ip = 0;
async function visitor(browser: Browser) {
  ip++;
  return browser.newContext({
    baseURL: AI,
    extraHTTPHeaders: { "x-real-ip": `10.88.${Math.floor(Math.random() * 200) + 1}.${ip}` },
    viewport: { width: 390, height: 844 },
  });
}

async function axe(p: Page) {
  await p.waitForTimeout(500);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

// Background work (after() and jobs) lands a moment later: reload until it shows.
async function eventually(p: Page, url: string, check: () => Promise<void>, timeout = 30_000) {
  await expect(async () => {
    await p.goto(url);
    await check();
  }).toPass({ timeout, intervals: [500, 1000, 1500] });
}

const row = (p: Page, text: string): Locator => p.locator("[data-id]").filter({ hasText: text });

async function mailCount(to: string, subject: RegExp) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=50`);
  const data = (await res.json()) as { messages: { Subject: string }[] };
  return (data.messages ?? []).filter((m) => subject.test(m.Subject)).length;
}

async function submit(browser: Browser, text: string, name: string) {
  const ctx = await visitor(browser);
  const v = await ctx.newPage();
  await v.goto(`/${slug}`);
  await v.getByLabel("Your testimonial").fill(text);
  await v.getByLabel("Your name").fill(name);
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600);
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await ctx.close();
}

test.describe("AI on", () => {
  test.use({ baseURL: AI });

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newContext({
      baseURL: AI,
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: { "x-real-ip": "10.88.250.1" },
    });
    await owner.grantPermissions(["clipboard-read", "clipboard-write"]);
    page = await owner.newPage();
    await signIn(page, email);
    spaceId = await createSpace(page, "Northwind Coffee");
    await page.goto(`/app/${spaceId}/collect`);
    slug = new URL((await page.getByTestId("collect-link").textContent())!.trim(), "https://x").pathname.split("/").pop()!;
    await page.goto(`/app/${spaceId}/widgets`);
    const href = await page
      .getByRole("link", { name: /Wall of love/ })
      .first()
      .getAttribute("href");
    wallId = href!.split("/").pop()!;
  });

  test.afterAll(async () => {
    await owner?.close();
  });

  test("settings: AI switches and today's usage", async () => {
    await page.goto(`/app/${spaceId}/settings`);
    await expect(page.getByRole("heading", { name: "AI", exact: true })).toBeVisible();
    for (const name of ["Spam filter", "Sentiment tags", "Best line", "Spelling help on forms", "Video captions"]) {
      await expect(page.getByRole("switch", { name })).toHaveAttribute("aria-checked", "true");
    }
    await expect(page.getByTestId("ai-usage")).toHaveText("0 of 60 calls");
    await page.getByRole("switch", { name: "Sentiment tags" }).click();
    await expect(page.getByRole("switch", { name: "Sentiment tags" })).toHaveAttribute("aria-checked", "false");
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole("switch", { name: "Sentiment tags" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("switch", { name: "Sentiment tags" }).click();
    await expect(page.getByRole("switch", { name: "Sentiment tags" })).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(400);
    expect(await axe(page)).toEqual([]);
  });

  test("spelling help: a suggestion the visitor takes or leaves", async ({ browser }) => {
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/${slug}`);
    const box = v.getByLabel("Your testimonial");
    await box.fill("Too short");
    await expect(v.getByRole("button", { name: "Fix spelling" })).toHaveCount(0);
    await box.fill(TYPOS);
    await v.getByRole("button", { name: "Fix spelling" }).click();
    const suggestion = v.getByTestId("polish");
    await expect(suggestion).toContainText(LONG);
    expect(await axe(v)).toEqual([]);
    await suggestion.getByRole("button", { name: "Keep mine" }).click();
    await expect(box).toHaveValue(TYPOS);
    await expect(box).toBeFocused();
    await v.getByRole("button", { name: "Fix spelling" }).click();
    await v.getByTestId("polish").getByRole("button", { name: "Use this" }).click();
    await expect(box).toHaveValue(LONG);
    // Nothing left to fix.
    await v.getByRole("button", { name: "Fix spelling" }).click();
    await expect(v.getByText("Looks good")).toBeVisible();
    await v.getByLabel("Your name").fill("Vera Visitor");
    await v.getByLabel("I agree to share this publicly").check();
    await v.waitForTimeout(2000);
    await v.getByRole("button", { name: "Send" }).click();
    await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
    await ctx.close();

    // The owner gets the mail, and the inbox shows the sentiment tag and the best line.
    await mailTo(email, /New testimonial from Vera Visitor/);
    await eventually(page, `/app/${spaceId}`, async () => {
      const item = row(page, "Vera Visitor");
      await expect(item.getByText("positive", { exact: true })).toBeVisible({ timeout: 1000 });
      await expect(item.getByTestId("best-line")).toHaveText(BEST, { timeout: 1000 });
    });
  });

  test("spam is hidden and flagged, never deleted or mailed; negative feedback is not spam", async ({ browser }) => {
    await submit(browser, "Buy cheap followers now at http://spam.example and win at our casino today!!!", "Spam Bot");
    await submit(browser, "The app was broken for a week and support was terrible about it.", "Nora Negative");
    await eventually(page, `/app/${spaceId}`, async () => {
      await expect(row(page, "Nora Negative").getByText("negative", { exact: true })).toBeVisible({ timeout: 1000 });
    });
    await expect(row(page, "Spam Bot")).toHaveCount(0);
    await page.getByRole("radio", { name: /Hidden/ }).click();
    const spam = row(page, "Spam Bot");
    await expect(spam.getByTestId("spam")).toHaveText("Spam");
    await mailTo(email, /New testimonial from Nora Negative/);
    expect(await mailCount(email, /New testimonial from Spam Bot/)).toBe(0);
    await spam.hover();
    await spam.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Not spam" }).click();
    await expect(page.getByText("Moved to new")).toBeVisible();
    await page.getByRole("radio", { name: /^New/ }).click();
    await expect(row(page, "Spam Bot")).toBeVisible();
    await expect(row(page, "Spam Bot").getByTestId("spam")).toHaveCount(0);
  });

  test("video: a transcript becomes the text, captions play in widgets", async ({ browser }) => {
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/${slug}`);
    await v.getByRole("radio", { name: "Video" }).click();
    await v.getByRole("button", { name: "Turn on camera" }).click();
    await v.getByRole("button", { name: "Start recording" }).click();
    await v.waitForTimeout(2200);
    await v.getByRole("button", { name: "Stop recording" }).click();
    await expect(v.getByLabel("Your recording")).toBeVisible();
    await v.getByLabel("Your name").fill("Vic Video");
    await v.getByLabel("I agree to share this publicly").check();
    await v.waitForTimeout(1500);
    await v.getByRole("button", { name: "Send" }).click();
    await expect(v.getByRole("heading", { name: "Thank you" }).first()).toBeVisible({ timeout: 45_000 });
    await ctx.close();

    let id = "";
    await eventually(
      page,
      `/app/${spaceId}`,
      async () => {
        await expect(row(page, "Vic Video").getByText(SPOKEN)).toBeVisible({ timeout: 1000 });
      },
      45_000,
    );
    id = (await row(page, "Vic Video").getAttribute("data-id"))!;
    const captions = await page.request.get(`/api/captions/${id}`);
    expect(captions.status()).toBe(200);
    expect(captions.headers()["content-type"]).toContain("text/vtt");
    const vtt = await captions.text();
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("00:00:00.200 --> 00:00:03.100\nHonestly, this product saved my team hours every week.");
    // Approve it: the wall widget plays it with captions on.
    await row(page, "Vic Video").hover();
    await row(page, "Vic Video").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(async () => {
      const html = await (await page.request.get(`/embed/${wallId}`)).text();
      expect(html).toContain(`<track kind="captions" src="${AI}/api/captions/${id}" label="Captions" default>`);
    }).toPass({ timeout: 15_000 });
    expect((await page.request.get("/api/captions/nope1234nope")).status()).toBe(404);
  });

  test("captions off: no transcript until the owner asks for one", async ({ browser }) => {
    await page.goto(`/app/${spaceId}/settings`);
    await page.getByRole("switch", { name: "Video captions" }).click();
    await expect(page.getByRole("switch", { name: "Video captions" })).toHaveAttribute("aria-checked", "false");
    await page.waitForTimeout(400);
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/${slug}`);
    await v.getByRole("radio", { name: "Video" }).click();
    await v.getByRole("button", { name: "Turn on camera" }).click();
    await v.getByRole("button", { name: "Start recording" }).click();
    await v.waitForTimeout(2200);
    await v.getByRole("button", { name: "Stop recording" }).click();
    await v.getByLabel("Your name").fill("Quiet Video");
    await v.getByLabel("I agree to share this publicly").check();
    await v.waitForTimeout(1500);
    await v.getByRole("button", { name: "Send" }).click();
    await expect(v.getByRole("heading", { name: "Thank you" }).first()).toBeVisible({ timeout: 45_000 });
    await ctx.close();
    await page.goto(`/app/${spaceId}`);
    const item = row(page, "Quiet Video");
    await expect(item.getByRole("button", { name: "Play video from Quiet Video" })).toBeVisible();
    await expect(item.getByText(SPOKEN)).toHaveCount(0);
    await item.hover();
    await item.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Transcribe" }).click();
    await expect(page.getByText("Captions added")).toBeVisible();
    await expect(item.getByText(SPOKEN)).toBeVisible();
    await page.goto(`/app/${spaceId}/settings`);
    await page.getByRole("switch", { name: "Video captions" }).click();
    await expect(page.getByRole("switch", { name: "Video captions" })).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(400);
  });

  test("translations: in the inbox, and widgets in another language with best lines", async () => {
    await page.goto(`/app/${spaceId}`);
    await page.getByRole("radio", { name: /^New/ }).click();
    const item = row(page, "Vera Visitor");
    await item.hover();
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await page.getByRole("radio", { name: /Approved/ }).click();
    await row(page, "Vera Visitor").hover();
    await row(page, "Vera Visitor").getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Translate" }).click();
    const sheet = page.getByRole("dialog", { name: "Translate" });
    await expect(sheet.getByText("No translations yet")).toBeVisible();
    await sheet.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "Deutsch" }).click();
    await sheet.getByRole("button", { name: "Translate" }).click();
    await expect(sheet.getByTestId("translations")).toContainText(`[de] ${LONG}`);
    // Machine-made: it waits for a member's approval before anything public shows it.
    await expect(sheet.getByRole("button", { name: "Approve Deutsch" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto(`/app/${spaceId}/widgets/${wallId}`);
    await expect(page.getByRole("heading", { name: "AI", exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "Best line" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    const preview = page.frameLocator('iframe[title="Widget preview"]');
    await expect(preview.locator("mark.lw-hl")).toHaveText(BEST);
    // The configurator autosaves after a moment: wait for that save before leaving the page.
    const saved = page.waitForRequest(
      (r) => r.method() === "POST" && Boolean(r.headers()["next-action"]) && (r.postData() ?? "").includes('"language":"es"'),
    );
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "Español" }).click();
    await expect(page.getByText("Translations show once approved.")).toBeVisible();
    await (await saved).response();

    // The background job translates the widget's testimonials; they wait in the testimonial's edit sheet.
    const edit = page.getByRole("dialog", { name: "Edit testimonial" });
    await eventually(page, `/app/${spaceId}`, async () => {
      await page.getByRole("radio", { name: /Approved/ }).click();
      await row(page, "Vera Visitor").hover();
      await row(page, "Vera Visitor").getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Edit" }).click();
      await expect(edit.locator('[data-lang="es"]')).toContainText(`[es] ${LONG}`, { timeout: 2000 });
    });
    // Until then the widget and the public API keep the testimonial's own words.
    const embed = async () => (await page.request.get(`/embed/${wallId}`)).text();
    const api = async () => (await page.request.get(`/api/v1/widgets/${wallId}`)).text();
    expect(await embed()).not.toContain("[es] ");
    expect(await api()).not.toContain("[es] ");
    expect(await embed()).not.toContain("[de] ");

    await edit.getByRole("button", { name: "Discard Deutsch" }).click();
    await expect(edit.locator('[data-lang="de"]')).toHaveCount(0);
    await edit.getByRole("button", { name: "Approve Español" }).click();
    await expect(edit.locator('[data-lang="es"]').getByText("Approved")).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(async () => {
      const html = await embed();
      expect(html).toContain(`<mark class="lw-hl">${BEST}</mark>`);
      expect(html).toContain("[es] ");
    }).toPass({ timeout: 30_000 });
    expect(await api()).toContain("[es] ");
    // A discarded translation stays gone (also from the Translate sheet).
    await row(page, "Vera Visitor").hover();
    await row(page, "Vera Visitor").getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Translate" }).click();
    await expect(sheet.locator('[data-lang="es"]')).toContainText("Approved");
    await expect(sheet.locator('[data-lang="de"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("summary of the testimonials, with real quotes only", async () => {
    await page.goto(`/app/${spaceId}`);
    await page.getByRole("button", { name: "Summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Summary" });
    await expect(sheet.getByText("No summary yet")).toBeVisible();
    await sheet.getByRole("button", { name: "Summarize" }).click();
    await expect(sheet.getByTestId("summary")).toContainText("Customers value how quickly it pays off.");
    await expect(sheet.getByText("Saves time")).toBeVisible();
    await expect(sheet.locator("blockquote")).toHaveCount(1); // the made-up quote is dropped
    await expect(sheet.getByText("To work on")).toBeVisible();
    // Writing goes to the stronger model (with the refusal fallback), classification to the fast one.
    const log = (await (await fetch(`${SITE}/anthropic/_log`)).json()) as { feature: string; model: string; fallbacks: unknown }[];
    expect(log.findLast((l) => l.feature === "summary")).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default" });
    expect(log.findLast((l) => l.feature === "analyze")).toMatchObject({ model: "claude-haiku-5-5", fallbacks: null });
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Summary" }).click();
    await expect(
      page.getByRole("dialog", { name: "Summary" }).getByText("Customers value how quickly it pays off.", { exact: false }),
    ).toBeVisible();
  });

  test("case study writer: a readable draft, editable, from the answers only", async ({ browser }) => {
    await page.goto(`/app/${spaceId}/collect`);
    await page.getByRole("button", { name: "New form" }).click();
    await page.getByRole("button", { name: /^Case study/ }).click();
    await page.waitForURL(/\/collect\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
    const formId = page.url().split("/").pop()!;
    const ctx = await visitor(browser);
    const v = await ctx.newPage();
    await v.goto(`/${slug}/case-study`);
    await v.getByLabel("What challenge were you facing?").fill("Reviews were scattered across five tools.");
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByLabel("How did Northwind Coffee help?").fill("One link for every customer.");
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByLabel("What results did you get?").fill("Twice the testimonials in a month.");
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByLabel("One number that sums it up").fill("2x testimonials");
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByRole("button", { name: "Next" }).click();
    await v.getByLabel("Your name").fill("Cass Study");
    await v.getByLabel("Title").fill("Head of Growth");
    await v.getByLabel("Company").fill("Initech");
    await v.getByLabel("I agree to share this publicly").check();
    await v.waitForTimeout(2600);
    await v.getByRole("button", { name: "Send" }).click();
    await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
    await ctx.close();

    await page.goto(`/app/${spaceId}/collect/${formId}/results`);
    const study = page.getByTestId("case-study").filter({ hasText: "Cass Study" });
    await study.getByRole("button", { name: "Write" }).click();
    await expect(study.getByRole("heading", { name: "How Initech got its evenings back" })).toBeVisible();
    await expect(study.getByText("Written: Reviews were scattered across five tools.")).toBeVisible();
    await expect(study.getByText("Invented")).toHaveCount(0); // sections it made up are dropped
    await study.getByRole("radio", { name: "Their words" }).click();
    await expect(study.getByRole("heading", { name: "Initech and Northwind Coffee" })).toBeVisible();
    await study.getByRole("radio", { name: "Written" }).click();
    await study.getByRole("button", { name: "Draft options" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await study.getByLabel("Key result").fill("Twice the testimonials");
    await study.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.reload();
    await expect(study.getByText("Twice the testimonials", { exact: true })).toBeVisible();
    await study.getByRole("button", { name: "Copy as Markdown" }).click();
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).toContain("# How Initech got its evenings back");
    expect(md).toContain("> **Twice the testimonials**");
  });

  test("a new form from a website: proposed, reviewed, then created", async () => {
    await page.goto(`/app/${spaceId}/collect`);
    await page.getByRole("button", { name: "New form" }).click();
    await page.getByRole("button", { name: /^From your website/ }).click();
    const sheet = page.getByRole("dialog", { name: "From your website" });
    await sheet.getByLabel("Website").fill("northwind-coffee.test");
    await sheet.getByRole("button", { name: "Read site" }).click();
    await expect(sheet.getByLabel("Headline")).toHaveValue("How has Northwind Coffee changed your mornings?");
    await expect(sheet.getByText("#b45309")).toBeVisible();
    await expect(sheet.getByLabel("Question 3", { exact: true })).toHaveValue("What would you tell a friend?");
    await sheet.getByRole("button", { name: "Remove question 3" }).click();
    await sheet.getByLabel("Intro").fill("Two lines about your coffee.");
    expect(await axe(page)).toEqual([]);
    await sheet.getByRole("button", { name: "Create form" }).click();
    await page.waitForURL(/\/collect\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
    await page.goto(`/app/${spaceId}/settings`);
    await expect(page.getByText("#b45309")).toBeVisible();
    await page.goto(`/app/${spaceId}/collect`);
    const link = await page.locator("a[href*='/testimonials-2']").first().getAttribute("href");
    const v = await page.context().newPage();
    await v.goto(link!);
    await expect(v.getByRole("heading", { name: "How has Northwind Coffee changed your mornings?" })).toBeVisible();
    await expect(v.getByText("Two lines about your coffee.")).toBeVisible();
    await v.close();
  });

  test("screenshots are read: name, text and stars", async () => {
    await page.goto(`/app/${spaceId}`);
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("menuitem", { name: "Import" }).click();
    await page.getByRole("button", { name: "Screenshots" }).click();
    await page
      .locator('input[type="file"][aria-label="Choose screenshots"]')
      .setInputFiles([path.join(__dirname, "fixtures", "photo.png")]);
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.getByText("Imported 1")).toBeVisible();
    await page.keyboard.press("Escape");
    await eventually(page, `/app/${spaceId}`, async () => {
      await page.getByRole("radio", { name: /^All/ }).click();
      await expect(row(page, "Grace Hopper").getByText("Read from the screenshot: it just works.")).toBeVisible({ timeout: 1000 });
    });
    // In the edit sheet: read it again into an emptied text box.
    const item = row(page, "Grace Hopper");
    await item.hover();
    await item.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Testimonial", { exact: true }).fill("");
    await sheet.getByRole("button", { name: "Read text" }).click();
    await expect(sheet.getByLabel("Testimonial", { exact: true })).toHaveValue("Read from the screenshot: it just works.");
    await page.keyboard.press("Escape");
  });

  test("limits: spelling help per visitor, and the daily cap per space", async ({ request }) => {
    const html = await (await request.get(`/${slug}`)).text();
    const token = html.match(/\d{13}\.[A-Za-z0-9_-]{24}/)?.[0];
    expect(token).toBeTruthy();
    // A fresh visitor address each run (the counters live in the database).
    const net = `10.${120 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 250)}`;
    const headers = { "x-real-ip": `${net}.7`, "content-type": "application/json" };
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      const res = await request.post(`/api/collect/${spaceId}/polish`, {
        headers,
        data: { text: `Teh coffee is great, number ${i}.`, token },
      });
      statuses.push(res.status());
    }
    expect(statuses.slice(0, 8).every((s) => s === 200)).toBe(true);
    expect(statuses[8]).toBe(429);
    expect(
      (
        await request.post(`/api/collect/${spaceId}/polish`, {
          headers: { ...headers, "x-real-ip": `${net}.8` },
          data: { text: "Teh coffee is great today.", token: "1.bad" },
        })
      ).status(),
    ).toBe(400);

    // Out of today's calls: AI features stop (and say so) until tomorrow.
    process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query(
        `insert into ai_usage (space_id, day, feature, calls) values ($1, (now() at time zone 'utc')::date, 'summary', 60)
         on conflict (space_id, day, feature) do update set calls = 60`,
        [spaceId],
      );
      const res = await request.post(`/api/collect/${spaceId}/polish`, {
        headers: { ...headers, "x-real-ip": `${net}.9` },
        data: { text: "Teh coffee is great today.", token },
      });
      expect(res.status()).toBe(503);
      await page.goto(`/app/${spaceId}`);
      await page.getByRole("button", { name: "Summary" }).click();
      await page.getByRole("dialog", { name: "Summary" }).getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText("Daily AI limit reached. Try again tomorrow.")).toBeVisible();
    } finally {
      await db.query("delete from ai_usage where space_id = $1 and feature = 'summary'", [spaceId]);
      await db.end();
    }
  });
});

test("no keys: no AI anywhere", async ({ browser }) => {
  const ctx = await newContext(browser);
  const p = await ctx.newPage();
  await signIn(p, uniqueEmail("no-ai"));
  const id = await createSpace(p, "Plain Bakery");
  await p.getByRole("button", { name: "Add" }).click();
  await p.getByRole("menuitem", { name: "Add manually" }).click();
  await p.getByLabel("Name", { exact: true }).fill("Pat Plain");
  await p.getByLabel("Testimonial", { exact: true }).fill("Teh bread is realy good and the staff are kind every single morning.");
  await p.getByRole("button", { name: "Add", exact: true }).last().click();
  const item = p.locator("[data-id]").filter({ hasText: "Pat Plain" });
  await expect(item).toBeVisible();
  await expect(p.getByRole("button", { name: "Summary" })).toHaveCount(0);
  await item.hover();
  await item.getByRole("button", { name: "More" }).click();
  await expect(p.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(p.getByRole("menuitem", { name: "Translate" })).toHaveCount(0);
  await p.keyboard.press("Escape");
  await expect(item.getByTestId("best-line")).toHaveCount(0);

  await p.goto(`/app/${id}/settings`);
  await expect(
    p
      .getByRole("heading", { name: "Members" })
      .or(p.getByRole("heading", { name: "Webhooks" }))
      .first(),
  ).toBeVisible();
  await expect(p.getByRole("heading", { name: "AI", exact: true })).toHaveCount(0);

  await p.goto(`/app/${id}/collect`);
  const link = (await p.getByTestId("collect-link").textContent())!.trim();
  await p.getByRole("button", { name: "New form" }).click();
  await expect(p.getByRole("button", { name: /^Case study/ })).toBeVisible();
  await expect(p.getByRole("button", { name: /^From your website/ })).toHaveCount(0);
  await p.keyboard.press("Escape");

  await p.goto(`/app/${id}/widgets`);
  await p
    .getByRole("link", { name: /Wall of love/ })
    .first()
    .click();
  await expect(p.getByRole("heading", { name: "Style" })).toBeVisible();
  await expect(p.getByRole("switch", { name: "Best line" })).toHaveCount(0);

  const v = await ctx.newPage();
  await v.goto(`${PLAIN}/${link.split("/").pop()}`);
  await v.getByLabel("Your testimonial").fill("Teh bread is realy good and the staff are kind.");
  await expect(v.getByRole("button", { name: "Fix spelling" })).toHaveCount(0);
  const html = await v.content();
  const token = html.match(/\d{13}\.[A-Za-z0-9_-]{24}/)?.[0];
  expect((await v.request.post(`${PLAIN}/api/collect/${id}/polish`, { data: { text: "Teh bread is realy good.", token } })).status()).toBe(
    404,
  );
  await ctx.close();
});
