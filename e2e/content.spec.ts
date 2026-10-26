import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { createSpace, newContext, signIn, uniqueEmail } from "./helpers";
import { REWARDED_TEXT } from "../src/lib/widget/render";

// A testimonial whose giver claimed a reward says so wherever it is shown: in the widget, on the wall page and in the
// public API. The space can't switch it off (there is no setting), and testimonials without a reward stay clean.
test.describe.configure({ mode: "serial" });

let owner: BrowserContext;
let page: Page;
let spaceId = "";
let slug = "";
let widgetId = "";

const ip = () => `10.${90 + Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

// A visitor sends a testimonial through the public form API, as the collect page does.
async function submit(request: APIRequestContext, name: string, text: string) {
  const html = await (await request.get(`/${slug}`)).text();
  const token = html.match(/\\"token\\":\\"(\d+\.[A-Za-z0-9_-]+)\\"/)?.[1] ?? html.match(/"token":"(\d+\.[A-Za-z0-9_-]+)"/)?.[1];
  expect(token).toBeTruthy();
  await new Promise((r) => setTimeout(r, 2700));
  const res = await request.post(`/api/collect/${spaceId}`, {
    headers: { "x-real-ip": ip() },
    data: { name, text, rating: 5, consent: true, token },
  });
  expect(res.status(), name).toBe(200);
  return (await res.json()) as { reward?: { type: string; code?: string } };
}

async function approve(text: string) {
  await page.goto(`/app/${spaceId}`);
  const item = page.locator("[data-id]").filter({ hasText: text });
  await expect(item).toBeVisible();
  await item.hover();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  owner = await newContext(browser);
  page = await owner.newPage();
  await signIn(page, uniqueEmail("content"));
  spaceId = await createSpace(page, "Reward Co");
  await page.goto(`/app/${spaceId}/collect`);
  slug = (await page.getByTestId("collect-link").textContent())!.split("/").pop()!;
  await page.goto(`/app/${spaceId}/widgets`);
  await page.getByRole("link", { name: "Wall of love" }).click();
  await page.waitForURL(/\/widgets\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
  widgetId = page.url().split("/").pop()!;
});

test.afterAll(async () => {
  await owner?.close();
});

test("a testimonial given before the form had a reward is not marked", async ({ request }) => {
  const r = await submit(request, "Plain Giver", "Honest words, nothing in return.");
  expect(r.reward ?? null).toBeNull();
  await approve("Honest words, nothing in return.");
  await expect.poll(async () => (await (await request.get(`/embed/${widgetId}`)).text()).includes("Honest words")).toBe(true);
  const html = await (await request.get(`/embed/${widgetId}`)).text();
  expect(html).not.toContain(REWARDED_TEXT);
  expect(html).not.toContain('class="lw-rew"');
});

test("the form offers a coupon, and the rewarded testimonial discloses it everywhere", async ({ request }) => {
  await page.goto(`/app/${spaceId}/collect`);
  await page.getByRole("link", { name: "Testimonials" }).click();
  await page.waitForURL(/\/collect\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
  await page.getByRole("combobox", { name: "Reward", exact: true }).click();
  await page.getByRole("option", { name: "Coupon code", exact: true }).click();
  await page.locator("#reward-code").fill("THANKS-10");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const r = await submit(request, "Thanked Giver", "Got a code, still my own words.");
  expect(r.reward).toMatchObject({ type: "code", code: "THANKS-10" });
  await approve("Got a code, still my own words.");

  // The widget: the line sits with the testimonial, and only with that one.
  await expect.poll(async () => (await (await request.get(`/embed/${widgetId}`)).text()).includes("still my own words")).toBe(true);
  const html = await (await request.get(`/embed/${widgetId}`)).text();
  const cards = html.split('<figure class="lw-card"').slice(1);
  expect(cards).toHaveLength(2);
  const rewarded = cards.find((c) => c.includes("still my own words"))!;
  const plain = cards.find((c) => c.includes("Honest words"))!;
  expect(rewarded).toContain(`<div class="lw-rew">${REWARDED_TEXT}</div>`);
  expect(plain).not.toContain('class="lw-rew"');

  // The wall page.
  await expect.poll(async () => (await (await request.get(`/w/${widgetId}`)).text()).includes("still my own words")).toBe(true);
  const wall = await (await request.get(`/w/${widgetId}`)).text();
  expect(wall.split('class="lw-rew"').length - 1).toBe(1);

  // The public API.
  const api = (await (await request.get(`/api/v1/widgets/${widgetId}`)).json()) as {
    testimonials: { text: string; rewarded: boolean }[];
  };
  expect(api.testimonials.find((t) => t.text.includes("still my own words"))?.rewarded).toBe(true);
  expect(api.testimonials.find((t) => t.text.includes("Honest words"))?.rewarded).toBe(false);

  // Nothing in the configurator can hide it: the preview shows it and the design panel has no such switch.
  await page.goto(`/app/${spaceId}/widgets/${widgetId}`);
  const preview = page.frameLocator('iframe[title="Widget preview"]');
  await expect(preview.getByText(REWARDED_TEXT)).toBeVisible();
  await expect(page.getByRole("switch", { name: /reward/i })).toHaveCount(0);
});

// Plan and trial copy belongs to an instance that bills; this build has no POLAR_ACCESS_TOKEN.
test("the landing page sells nothing when billing is off", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toMatch(/\$9(?!\d)|\$90|14-day trial|Start free trial|lovewall\.tech/);
  expect(html).toContain("Free to self-host, every feature");
});

test("other layouts carry the line too", async ({ request }) => {
  for (const [label, type] of [
    ["List", "list"],
    ["Carousel", "carousel"],
    ["Single", "single"],
  ] as const) {
    await page.goto(`/app/${spaceId}/widgets/${widgetId}`);
    await page.getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: label, exact: true }).click();
    await expect
      .poll(async () => (await (await request.get(`/embed/${widgetId}`)).text()).includes(`class="lw lw-t-${type}"`), { timeout: 15_000 })
      .toBe(true);
    const html = await (await request.get(`/embed/${widgetId}`)).text();
    expect(html, type).toContain(REWARDED_TEXT);
  }
});
