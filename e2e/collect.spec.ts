import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { request as httpRequest } from "node:http";
import path from "node:path";
import pg from "pg";
import { createSpace, mailTo, newContext, signIn, SITE, uniqueEmail } from "./helpers";

// Collecting, end to end: forms with steps and custom questions, NPS, case studies, rewards, languages, invites,
// replies, custom domains and form views. Runs in order; later steps use earlier state.
test.describe.configure({ mode: "serial" });

const PORT = Number(process.env.E2E_PORT) || 3111;
const MAILPIT = "http://127.0.0.1:8025";
const ownerEmail = uniqueEmail("collect");
const stamp = Date.now();
let owner: BrowserContext;
let page: Page;
let spaceId = "";
let slug = "";
const forms: Record<string, string> = {};

// The test database (to move time forward for reminders).
function db() {
  process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}

let ip = 0;
async function visitor(browser: Browser, opts: { locale?: string; scheme?: "light" | "dark"; reducedMotion?: "reduce" } = {}) {
  ip++;
  return browser.newContext({
    extraHTTPHeaders: { "x-real-ip": `10.66.${(stamp % 200) + 1}.${ip}` },
    viewport: { width: 390, height: 844 },
    locale: opts.locale ?? "en-US",
    colorScheme: opts.scheme ?? "light",
    reducedMotion: opts.reducedMotion,
  });
}

async function axe(p: Page) {
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

async function pick(p: Page, combobox: string, option: string) {
  await p.getByRole("combobox", { name: combobox, exact: true }).click();
  await p.getByRole("option", { name: option, exact: true }).click();
}

async function saved(p: Page) {
  await expect(p.getByText("Saved", { exact: true })).toBeVisible();
}

async function newForm(kind: "Testimonial" | "NPS survey" | "Case study"): Promise<string> {
  await page.goto(`/app/${spaceId}/collect`);
  await page.getByRole("button", { name: "New form" }).click();
  await page.getByRole("button", { name: new RegExp(`^${kind}`) }).click();
  await page.waitForURL(/\/collect\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
  await expect(page.getByLabel("Form name")).toBeVisible();
  return page.url().split("/").pop()!;
}

async function rename(name: string, formSlug: string) {
  await page.getByLabel("Form name").fill(name);
  await page.getByLabel("Form name").press("Enter");
  await expect(page.getByText("Renamed")).toBeVisible();
  await page.getByLabel("Path").fill(formSlug);
  await page.getByLabel("Path").press("Enter");
  await expect(page.getByText("Link updated")).toBeVisible();
}

function hostGet(host: string, p: string): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path: p, headers: { Host: host, "x-real-ip": "10.66.250.1" } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, cookies: (res.headers["set-cookie"] as string[]) ?? [] }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function mailCount(to: string, subject: RegExp) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=50`);
  const data = (await res.json()) as { messages: { Subject: string }[] };
  return (data.messages ?? []).filter((m) => subject.test(m.Subject)).length;
}

async function mailFull(to: string, subject: RegExp) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=20`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const msg = data.messages?.find((m) => subject.test(m.Subject));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        HTML: string;
        Text: string;
        ReplyTo: { Address: string }[];
        From: { Name: string; Address: string };
      };
      const headers = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}/headers`)).json()) as Record<string, string[]>;
      return { ...full, headers };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail "${subject}" for ${to}`);
}

test.beforeAll(async ({ browser }) => {
  owner = await newContext(browser);
  await owner.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` });
  page = await owner.newPage();
});

test.afterAll(async () => {
  await owner?.close();
});

test("the space starts with a default form", async () => {
  await signIn(page, ownerEmail);
  spaceId = await createSpace(page, "Acme Collect");
  await page.goto(`/app/${spaceId}/collect`);
  await expect(page.getByRole("link", { name: "Testimonials" })).toBeVisible();
  slug = (await page.getByTestId("collect-link").textContent())!.split("/").pop()!;
  expect(slug).toMatch(/^acme-collect/);
  expect(await axe(page)).toEqual([]);
});

test("build a multi-step form with custom questions and a coupon list", async () => {
  forms.feedback = await newForm("Testimonial");
  await rename("Product feedback", "feedback");
  await page.getByRole("radio", { name: "Steps" }).click();
  await pick(page, "Email", "Optional");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Which plan are you on?");
  await pick(page, "Type of question 1", "One choice");
  await page.getByLabel("Choice 1 of question 1").fill("Starter");
  await page.getByLabel("Choice 2 of question 1").fill("Pro");
  await page.getByRole("switch", { name: "Question 1 required" }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question 2", { exact: true }).fill("Would you recommend us?");
  await pick(page, "Type of question 2", "Yes or no");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question 3", { exact: true }).fill("What should we build next?");
  await pick(page, "Type of question 3", "Long text");
  await pick(page, "Reward", "Coupon code");
  await page.getByRole("radio", { name: "List" }).click();
  await page.getByLabel("Codes to add").fill("CODE-AAA\nCODE-BBB\nCODE-AAA");
  await page.getByRole("button", { name: "Add codes" }).click();
  await expect(page.getByText("2 codes added")).toBeVisible();
  await expect(page.getByTestId("codes-left")).toHaveText("2");
  await page.getByLabel("Note").fill("20% off your next order");
  await saved(page);
  // The preview walks through the steps and the thank-you screen.
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText("2 of 5")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

async function fillFeedback(v: Page, opts: { name: string; email: string; plan: "Starter" | "Pro" }) {
  await v.goto(`/${slug}/feedback`);
  await expect(v.getByRole("progressbar", { name: "Step 1 of 5" })).toBeVisible();
  await v.getByRole("radio", { name: "5 stars" }).click();
  await v.getByLabel("Your testimonial").fill(`Acme Collect made feedback easy (${opts.name})`);
  await v.keyboard.press("Control+Enter");
  // A required choice: refused until answered, then picked with the arrow keys.
  await expect(v.getByRole("heading", { name: "Which plan are you on?" })).toBeVisible();
  await v.keyboard.press("Control+Enter");
  await expect(v.locator("p[role=alert]")).toHaveText("Answer this question.");
  await v.keyboard.press("ArrowDown");
  if (opts.plan === "Pro") await v.keyboard.press("ArrowDown");
  await expect(v.getByRole("radio", { name: opts.plan })).toHaveAttribute("aria-checked", "true");
  await v.keyboard.press("Control+Enter");
  await expect(v.getByRole("heading", { name: "Would you recommend us?" })).toBeVisible();
  await v.keyboard.press("Space");
  await expect(v.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
  await v.keyboard.press("Control+Enter");
  await expect(v.getByRole("heading", { name: /What should we build next\?/ })).toBeVisible();
  await v.keyboard.type("A Zapier step");
  await v.keyboard.press("Control+Enter");
  await expect(v.getByLabel("Your name")).toBeFocused();
  await v.keyboard.type(opts.name);
  await v.getByLabel("Email").fill(opts.email);
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600); // the form refuses inhumanly fast submissions
  await v.getByLabel("Email").press("Enter");
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
}

test("a visitor fills the multi-step form by keyboard and gets a coupon", async ({ browser }) => {
  const ctx = await visitor(browser);
  const v = await ctx.newPage();
  const email = uniqueEmail("visitor");
  await fillFeedback(v, { name: "Ada Visitor", email, plan: "Pro" });
  await expect(v.getByTestId("reward-code")).toHaveText("CODE-AAA");
  await expect(v.getByText("20% off your next order")).toBeVisible();
  await expect(v.getByRole("link", { name: "Share on X" })).toHaveAttribute("href", /^https:\/\/x\.com\/intent\/post\?text=/);
  await expect(v.getByRole("link", { name: "Share on LinkedIn" })).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/,
  );
  expect(await axe(v)).toEqual([]);
  await ctx.close();
  const mail = await mailTo(email, /Your reward from Acme Collect/);
  expect(mail.Text).toContain("CODE-AAA");
});

test("each coupon from a list is handed out once", async ({ browser }) => {
  const second = await visitor(browser);
  const v2 = await second.newPage();
  await fillFeedback(v2, { name: "Bob Second", email: uniqueEmail("second"), plan: "Starter" });
  await expect(v2.getByTestId("reward-code")).toHaveText("CODE-BBB");
  await second.close();
  const third = await visitor(browser);
  const v3 = await third.newPage();
  await fillFeedback(v3, { name: "Cy Third", email: uniqueEmail("third"), plan: "Starter" });
  await expect(v3.getByTestId("reward-code")).toHaveCount(0); // the list ran out
  await third.close();
  await page.goto(`/app/${spaceId}/collect/${forms.feedback}`);
  await expect(page.getByTestId("codes-left")).toHaveText("0");
  await expect(page.getByText("left · 2 used")).toBeVisible();
});

test("answers show in the inbox, which filters by form", async () => {
  await page.goto(`/app/${spaceId}`);
  const item = page.locator("[data-id]").filter({ hasText: "Ada Visitor" });
  await expect(item.getByText("Which plan are you on?")).toBeVisible();
  await expect(item.getByText("Pro", { exact: true })).toBeVisible();
  await expect(item.getByText("Would you recommend us?")).toBeVisible();
  await expect(item.getByText("Product feedback")).toBeVisible();
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Product feedback" }).click();
  await expect(page.locator("[data-id]")).toHaveCount(3);
  await item.hover();
  await item.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByTestId("edit-answers").getByText("A Zapier step")).toBeVisible();
  await expect(page.getByTestId("edit-answers").getByText(/@lovewall\.test/)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("reply by email from the inbox", async () => {
  await page.goto(`/app/${spaceId}`);
  const item = page.locator("[data-id]").filter({ hasText: "Ada Visitor" });
  await item.hover();
  await item.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await page.getByLabel("Message").fill("Thank you, Ada! Your note made our week.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Reply sent")).toBeVisible();
  await expect(item.getByTestId("replied")).toHaveText("Replied just now");
  await page.reload();
  await expect(page.locator("[data-id]").filter({ hasText: "Ada Visitor" }).getByTestId("replied")).toBeVisible();
});

test("the reply arrives with Reply-To set to the owner", async () => {
  const client = db();
  await client.connect();
  const { rows } = await client.query("select email from testimonials where space_id = $1 and name = 'Ada Visitor'", [spaceId]);
  await client.end();
  const mail = await mailFull(rows[0].email, /Re: your testimonial for Acme Collect/);
  expect(mail.Text).toContain("Your note made our week.");
  expect(mail.ReplyTo[0]?.Address).toBe(ownerEmail);
});

test("an NPS detractor leaves feedback only; a promoter writes a testimonial", async ({ browser }) => {
  forms.nps = await newForm("NPS survey");
  const detractor = await visitor(browser);
  const d = await detractor.newPage();
  await d.goto(`/${slug}/nps`);
  await d.getByRole("radio", { name: "3", exact: true }).click();
  await d.getByRole("button", { name: "Next" }).click();
  await d.getByRole("textbox").fill(`Too slow on Mondays ${stamp}`);
  await d.waitForTimeout(2600);
  await d.getByRole("button", { name: "Send" }).click();
  await expect(d.getByText("Thanks for your feedback.")).toBeVisible();
  await expect(d.getByRole("link", { name: "Share on X" })).toHaveCount(0);
  await detractor.close();

  const promoter = await visitor(browser);
  const p = await promoter.newPage();
  await p.goto(`/${slug}/nps`);
  await p.getByRole("radio", { name: "10", exact: true }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("textbox").fill("Fast and friendly");
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Write one" }).click();
  await p.getByLabel("Your testimonial").fill(`A promoter's testimonial ${stamp}`);
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByLabel("Your name").fill("Pat Promoter");
  await p.getByLabel("I agree to share this publicly").check();
  await p.waitForTimeout(2600);
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await expect(p.getByRole("link", { name: "Share on X" })).toBeVisible();
  await promoter.close();

  await page.goto(`/app/${spaceId}`);
  await page.getByRole("radio", { name: /All/ }).click();
  await expect(page.locator("[data-id]").filter({ hasText: `A promoter's testimonial ${stamp}` })).toBeVisible();
  await expect(
    page
      .locator("[data-id]")
      .filter({ hasText: `A promoter's testimonial ${stamp}` })
      .getByText("10/10"),
  ).toBeVisible();
  await expect(page.locator("[data-id]").filter({ hasText: `Too slow on Mondays ${stamp}` })).toHaveCount(0);

  await page.goto(`/app/${spaceId}/collect/${forms.nps}/results`);
  await expect(page.getByTestId("nps-score")).toHaveText("0");
  await expect(page.getByTestId("nps-promoter")).toContainText("1");
  await expect(page.getByTestId("nps-detractor")).toContainText("1");
  await expect(page.getByTestId("nps-response").filter({ hasText: `Too slow on Mondays ${stamp}` })).toBeVisible();
  await page.getByRole("radio", { name: /Promoters/ }).click();
  await expect(page.getByTestId("nps-response").filter({ hasText: "Fast and friendly" }).getByText("Wrote a testimonial")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("a case study reads as a story and copies as Markdown", async ({ browser }) => {
  forms.case = await newForm("Case study");
  const ctx = await visitor(browser);
  const v = await ctx.newPage();
  await v.goto(`/${slug}/case-study`);
  await v.getByLabel("What challenge were you facing?").fill("Reviews were scattered across five tools.");
  await v.getByRole("button", { name: "Next" }).click();
  await v.getByRole("button", { name: "Next" }).click(); // "before" is optional
  await v.getByLabel("How did Acme Collect help?").fill("One link for every customer.");
  await v.getByRole("button", { name: "Next" }).click();
  await v.getByLabel("What results did you get?").fill("Twice the testimonials in a month.");
  await v.getByRole("button", { name: "Next" }).click();
  await v.getByLabel("One number that sums it up").fill("2x testimonials");
  await v.getByRole("button", { name: "Next" }).click();
  await v.getByLabel("A few words (optional)").fill("We should have done this years ago.");
  await v.getByRole("button", { name: "Next" }).click();
  await v.getByLabel("Your name").fill("Cass Study");
  await v.getByLabel("Title").fill("Head of Growth");
  await v.waitForTimeout(2600); // the form refuses inhumanly fast submissions
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.locator("p[role=alert]")).toHaveText("Answer this question."); // company is required here
  await v.getByLabel("Company").fill("Initech");
  await v.getByLabel("I agree to share this publicly").check();
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await ctx.close();

  await page.goto(`/app/${spaceId}/collect/${forms.case}/results`);
  const study = page.getByTestId("case-study").filter({ hasText: "Cass Study" });
  await expect(study.getByRole("heading", { name: "Initech and Acme Collect" })).toBeVisible();
  await expect(study.getByText("The challenge")).toBeVisible();
  await expect(study.getByText("2x testimonials")).toBeVisible();
  await study.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByText("Markdown copied")).toBeVisible();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toContain("# Initech and Acme Collect");
  expect(md).toContain("## The challenge\n\nReviews were scattered across five tools.");
  expect(md).toContain("> **2x testimonials**");
  expect(await axe(page)).toEqual([]);
});

test("spin the wheel: the server picks the prize, once", async ({ browser }) => {
  forms.wheel = await newForm("Testimonial");
  await rename("Wheel", "wheel");
  await pick(page, "Reward", "Spin the wheel");
  await page.getByLabel("Prize 1", { exact: true }).fill("Free month");
  await page.getByLabel("Prize 1 code").fill("WHEEL-WIN");
  await page.getByLabel("Prize 2 odds").fill("0");
  await saved(page);

  const ctx = await visitor(browser);
  const v = await ctx.newPage();
  await v.goto(`/${slug}/wheel`);
  await v.getByLabel("Your testimonial").fill("Spin me right round");
  await v.getByLabel("Your name").fill("Wendy Wheel");
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600);
  const submitted = v.waitForResponse((r) => r.url().endsWith(`/api/collect/${spaceId}`) && r.request().method() === "POST");
  await v.getByRole("button", { name: "Send" }).click();
  const claim = ((await (await submitted).json()) as { reward: { type: string; claim: string; prizes: string[] } }).reward;
  expect(claim.type).toBe("wheel");
  expect(claim.prizes).toEqual(["Free month", "Try again"]);
  // The page never knows the codes before the spin.
  expect(JSON.stringify(claim)).not.toContain("WHEEL-WIN");
  const spun = v.waitForResponse((r) => r.url().endsWith("/spin"));
  await v.getByRole("button", { name: "Spin", exact: true }).click();
  const result = (await (await spun).json()) as { index: number; prize: { value: string } };
  expect(result.index).toBe(0);
  expect(result.prize.value).toBe("WHEEL-WIN");
  await expect(v.getByTestId("spin-result")).toHaveText("You won: Free month", { timeout: 15_000 });
  await expect(v.getByTestId("reward-code")).toHaveText("WHEEL-WIN");
  // Once only: spinning again returns the same result; a made-up claim gets nothing.
  const again = await v.request.post(`/api/collect/${spaceId}/spin`, { data: { claim: claim.claim } });
  expect(((await again.json()) as { index: number }).index).toBe(0);
  const forged = await v.request.post(`/api/collect/${spaceId}/spin`, { data: { claim: "A".repeat(24) } });
  expect(forged.status()).toBe(404);
  await ctx.close();
});

test("the collect page speaks the visitor's language", async ({ browser }) => {
  await page.goto(`/app/${spaceId}/collect`);
  await page.getByRole("link", { name: "Testimonials" }).click();
  await pick(page, "Language", "Deutsch");
  await saved(page);
  const de = await visitor(browser);
  const g = await de.newPage();
  await g.goto(`/${slug}`);
  await expect(g.locator("main")).toHaveAttribute("lang", "de");
  await expect(g.getByRole("button", { name: "Senden" })).toBeVisible();
  await g.getByLabel("Dein Testimonial").fill("Sehr gut");
  await g.getByLabel("Dein Name").fill("Greta Deutsch");
  await g.getByRole("button", { name: "Senden" }).click();
  await expect(g.locator("p[role=alert]")).toHaveText("Setze das Häkchen, um zuzustimmen.");
  await g.getByRole("checkbox").check();
  await g.waitForTimeout(2600);
  await g.getByRole("button", { name: "Senden" }).click();
  await expect(g.getByRole("heading", { name: "Danke" })).toBeVisible();
  await de.close();
  // The consent is stored as shown: German, with its version.
  const client = db();
  await client.connect();
  const { rows } = await client.query(
    "select consent_text, consent_version, consent_lang from testimonials where space_id = $1 and name = 'Greta Deutsch'",
    [spaceId],
  );
  await client.end();
  expect(rows[0].consent_lang).toBe("de");
  expect(rows[0].consent_text).toContain("Acme Collect darf dies öffentlich teilen");
  expect(rows[0].consent_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await pick(page, "Language", "Visitor’s browser");
  await saved(page);
  const ja = await visitor(browser, { locale: "ja-JP" });
  const j = await ja.newPage();
  await j.goto(`/${slug}`);
  await expect(j.getByRole("button", { name: "送信" })).toBeVisible();
  await expect(j.getByLabel("お名前")).toBeVisible();
  await ja.close();
  const ar = await visitor(browser, { locale: "ar-EG" });
  const a = await ar.newPage();
  await a.goto(`/${slug}`);
  await expect(a.locator("main")).toHaveAttribute("dir", "rtl");
  await expect(a.getByRole("button", { name: "إرسال" })).toBeVisible();
  expect(await axe(a)).toEqual([]);
  await ar.close();
  await pick(page, "Language", "English");
  await saved(page);
});

test("invites: a prefilled link, open and click tracking, a reminder, and unsubscribe", async ({ browser, request }) => {
  const grace = `grace+${stamp}@lovewall.test`;
  const alan = `alan+${stamp}@lovewall.test`;
  await page.goto(`/app/${spaceId}/collect/invites`);
  await page.getByLabel("Postal address").fill("1 Main St, Springfield");
  await page.getByLabel("Subject").click();
  await expect(page.getByText("Address saved")).toBeVisible();
  await page.getByLabel("People").fill(`Grace Hopper, ${grace}\nAlan Turing <${alan}>\nnot-an-email`);
  await expect(page.getByText("2 people")).toBeVisible();
  await page.getByRole("button", { name: "Send to 2" }).click();
  await expect(page.getByText("Sent 2 invites")).toBeVisible();
  await expect(page.getByTestId("invite").filter({ hasText: grace }).getByTestId("invite-status")).toHaveText("Sent");

  const mail = await mailFull(grace, /A quick favour for Acme Collect\?/);
  expect(mail.Text).toContain("Hi Grace,");
  expect(mail.Text).toContain("Sent by Acme Collect via Lovewall");
  expect(mail.Text).toContain("1 Main St, Springfield");
  expect(mail.From.Name).toBe("Acme Collect");
  expect(mail.ReplyTo[0]?.Address).toBe(ownerEmail);
  expect(mail.headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");
  const link = mail.Text.match(/https?:\/\/\S+\?i=[\w.-]+/)![0];
  const pixel = mail.HTML.match(/src="([^"]+\/api\/invites\/open\/[^"]+)"/)![1];

  // Opened (the pixel), then clicked (the link prefills the form), then submitted.
  expect((await request.get(new URL(pixel).pathname)).headers()["content-type"]).toBe("image/gif");
  await expect
    .poll(
      async () => (
        await page.reload(),
        await page.getByTestId("invite").filter({ hasText: grace }).getByTestId("invite-status").textContent()
      ),
    )
    .toBe("Opened");
  const ctx = await visitor(browser);
  const v = await ctx.newPage();
  await v.goto(new URL(link).pathname + new URL(link).search);
  await expect(v.getByLabel("Your name")).toHaveValue("Grace Hopper");
  await v.getByLabel("Your testimonial").fill("Invited and delighted");
  await v.getByLabel("I agree to share this publicly").check();
  await v.waitForTimeout(2600);
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await ctx.close();
  await page.reload();
  await expect(page.getByTestId("invite").filter({ hasText: grace }).getByTestId("invite-status")).toHaveText("Submitted");

  // Alan unsubscribes: a button, not a link (scanners can't do it), and the next invite to him is skipped.
  const alanMail = await mailFull(alan, /A quick favour/);
  const unsub = alanMail.Text.match(/https?:\/\/\S+\/i\/[\w.-]+/)![0];
  const u = await (await visitor(browser)).newPage();
  await u.goto(new URL(unsub).pathname);
  await expect(u.getByRole("heading", { name: "Stop emails from Acme Collect?" })).toBeVisible();
  expect(await axe(u)).toEqual([]);
  await u.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(u.getByText("Done. Acme Collect won’t email you again.")).toBeVisible();
  await u.context().close();
  await page.reload();
  await page.getByLabel("People").fill(alan);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Nothing sent: 1 unsubscribed")).toBeVisible();
  expect(await mailCount(alan, /A quick favour/)).toBe(1);

  // A reminder goes out once the wait is over, but never to someone who unsubscribed or already answered.
  const ada = `ada+${stamp}@lovewall.test`;
  await page.getByLabel("People").fill(`Ada, ${ada}`);
  await pick(page, "Days before a reminder", "In 1 day");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sent 1 invite")).toBeVisible();
  const client = db();
  await client.connect();
  await client.query("update invites set sent_at = now() - interval '2 days' where space_id = $1", [spaceId]);
  await client.end();
  const cron = await request.get("/api/cron/maintenance", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(cron.status()).toBe(200);
  await mailTo(ada, /Reminder: A quick favour/);
  expect(await mailCount(alan, /Reminder/)).toBe(0);
  expect(await mailCount(grace, /Reminder/)).toBe(0);
  await page.reload();
  expect(await axe(page)).toEqual([]);
});

test("a custom domain serves only this space's forms and wall pages", async () => {
  const domain = `love-${stamp}.pointed.test`;
  await page.goto(`/app/${spaceId}/settings`);
  await page.getByLabel("Domain", { exact: true }).fill(`https://${domain}/`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("domain")).toHaveText(domain);
  await expect(page.getByText("CNAME")).toBeVisible();
  await expect(page.getByText(`love-${stamp}`, { exact: true })).toBeVisible();
  const calls = (await (await fetch(`${SITE}/vercel-calls`)).json()) as { method: string; path: string; body: string }[];
  expect(calls.some((c) => c.method === "POST" && c.path === "/vercel/v10/projects/prj_e2e/domains" && c.body.includes(domain))).toBe(true);
  // The CNAME alone doesn't prove ownership: the space's TXT record must be there too.
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("domain-status")).toHaveText("Not verified");
  const proof = await page.getByText(/^lovewall-verify=/).textContent();
  await fetch(`${SITE}/dns-txt?name=${encodeURIComponent(`_lovewall.${domain}`)}&value=${encodeURIComponent(proof!)}`, { method: "POST" });
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("domain-status")).toHaveText("Verified");
  expect(await axe(page)).toEqual([]);

  const home = await hostGet(domain, "/");
  expect(home.status).toBe(200);
  expect(home.body).toContain("What do you love about Acme Collect?");
  const other = await hostGet(domain, "/feedback");
  expect(other.status).toBe(200);
  expect(other.body).toContain("Which plan are you on?");
  await page.goto(`/app/${spaceId}/widgets`);
  const wallHref = await page.getByRole("link", { name: /Wall of love/ }).getAttribute("href");
  const wallId = wallHref!.split("/").pop()!;
  expect((await hostGet(domain, `/w/${wallId}`)).status).toBe(200);
  for (const p of ["/app", "/login", "/api/auth/get-session", "/w/AAAAAAAAAAAA", `/api/v1/widgets/${wallId}`, "/embed.js"]) {
    expect((await hostGet(domain, p)).status, p).toBe(404);
  }
  expect(home.cookies).toEqual([]);
  // The app's own host is unaffected.
  expect((await hostGet(`localhost:${PORT}`, "/login")).status).toBe(200);
});

test("the forms list shows views and responses", async () => {
  await page.goto(`/app/${spaceId}/collect`);
  const row = page.getByRole("listitem").filter({ hasText: "Product feedback" });
  await expect(row.getByTestId("form-responses")).toHaveText("3");
  expect(Number(await row.getByTestId("form-views").textContent())).toBeGreaterThanOrEqual(3);
  expect(await axe(page)).toEqual([]);
});

test("new collect screens pass axe in dark mode", async ({ browser }) => {
  const dark = await browser.newContext({
    storageState: await owner.storageState(),
    colorScheme: "dark",
    extraHTTPHeaders: { "x-real-ip": "10.66.251.1" },
  });
  const d = await dark.newPage();
  for (const p of [
    `/app/${spaceId}/collect`,
    `/app/${spaceId}/collect/${forms.feedback}`,
    `/app/${spaceId}/collect/invites`,
    `/app/${spaceId}/collect/${forms.nps}/results`,
    `/app/${spaceId}/collect/${forms.case}/results`,
    `/${slug}/feedback`,
    `/${slug}/nps`,
  ]) {
    await d.goto(p);
    expect(await axe(d), p).toEqual([]);
  }
  await dark.close();
});
