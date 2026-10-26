import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createSpace, newContext, signIn, uniqueEmail } from "./helpers";
import { legalEnabledFor } from "../src/lib/legal/config";

// The legal pages: every one renders and passes axe, the links are where they must be, and a self-hosted instance
// without LEGAL_PAGES shows none of it.

const PAGES = [
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/acceptable-use",
  "/legal/refunds",
  "/legal/dpa",
  "/legal/subprocessors",
  "/legal/security",
];

async function audit(page: Page, name: string) {
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test("legalEnabledFor: hosted domain or the flag", () => {
  expect(legalEnabledFor({ APP_URL: "https://lovewall.tech" })).toBe(true);
  expect(legalEnabledFor({ APP_URL: "https://app.lovewall.tech" })).toBe(true);
  expect(legalEnabledFor({ APP_URL: "https://testimonials.example.com" })).toBe(false);
  expect(legalEnabledFor({ APP_URL: "http://localhost:3000" })).toBe(false);
  expect(legalEnabledFor({ APP_URL: "http://localhost:3000", LEGAL_PAGES: "true" })).toBe(true);
  expect(legalEnabledFor({ APP_URL: "https://lovewall.tech", LEGAL_PAGES: "false" })).toBe(false);
  expect(legalEnabledFor({})).toBe(false);
});

for (const scheme of ["light", "dark"] as const) {
  test(`every legal page renders and passes axe (${scheme})`, async ({ browser }) => {
    const ctx = await newContext(browser, { colorScheme: scheme, viewport: scheme === "dark" ? { width: 390, height: 844 } : undefined });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Legal pages" })).toBeVisible();
      await audit(page, path);
    }
    await ctx.close();
  });
}

test("the policies say what they must", async ({ request }) => {
  // React separates adjacent text nodes with comments; strip them before matching sentences.
  const terms = (await (await request.get("/legal/terms")).text()).replace(/<!--.*?-->/g, "");
  expect(terms).toContain("Nikhil Dhaliya");
  expect(terms).toContain("legal@lovewall.tech");
  expect(terms).toContain("AGPL-3.0");
  expect(terms).toMatch(/US \$50, whichever is greater/);
  expect(terms).toContain("laws of India");
  expect(terms).not.toMatch(/@gmail|@getvik/);
  const privacy = await (await request.get("/legal/privacy")).text();
  for (const s of [
    "privacy@lovewall.tech",
    "GDPR",
    "CCPA",
    "Digital Personal Data Protection Act",
    "Standard Contractual Clauses",
    "never sell",
  ]) {
    expect(privacy, s).toContain(s);
  }
  const cookies = await (await request.get("/legal/cookies")).text();
  expect(cookies).toContain("lovewall.session_token");
  const subs = await (await request.get("/legal/subprocessors")).text();
  for (const s of ["Vercel", "Supabase", "ZeptoMail", "Polar", "Anthropic", "Deepgram"]) expect(subs, s).toContain(s);
});

test("the pages are linked from the site, the login page, collect pages and account settings", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/legal/terms");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/legal/privacy");
  await page.goto("/login");
  await expect(page.getByText("By continuing you confirm you are 16 or older")).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy");

  await signIn(page, uniqueEmail("legal"));
  const space = await createSpace(page, "Legal Co");
  await page.goto(`/app/${space}/collect`);
  const slug = (await page.getByTestId("collect-link").textContent())!.split("/").pop()!;
  await page.goto(`/${slug}`);
  // Next to the consent box and in the footer.
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Privacy" }).last()).toHaveAttribute("href", /\/legal\/privacy$/);
  await page.goto("/app/settings");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy");
  await expect(page.getByRole("link", { name: "Data Processing Agreement" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
  await ctx.close();
});

// Self-host mode: the same build, started without LEGAL_PAGES on this area's dev port, hides everything.
test.describe("self-host mode", () => {
  const PORT = Number(process.env.E2E_SELFHOST_PORT) || 3146;
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, APP_URL: `http://localhost:${PORT}`, PORT: String(PORT) };
    delete env.LEGAL_PAGES;
    server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], { env, stdio: "ignore" });
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("self-host server did not start");
  });

  test.afterAll(async () => {
    server?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  });

  test("legal pages and links are hidden without LEGAL_PAGES", async () => {
    for (const path of ["/legal", "/legal/terms", "/legal/privacy"]) {
      expect((await fetch(`http://localhost:${PORT}${path}`)).status, path).toBe(404);
    }
    const login = await (await fetch(`http://localhost:${PORT}/login`)).text();
    expect(login).not.toContain("/legal/");
  });
});
