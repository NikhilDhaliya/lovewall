import { expect, type Browser, type Page } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:8025";
// "Another website" for embed tests and mocked third-party APIs (see playwright.config.ts).
export const SITE = `http://127.0.0.1:${Number(process.env.E2E_SITE_PORT) || 3101}`;

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@lovewall.test`;
}

// The newest sign-in code sent to this address (Mailpit is shared, so filter by recipient).
export async function mailCode(email: string, after = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string; Created: string }[] };
    const msg = data.messages?.find((m) => new Date(m.Created).getTime() >= after - 2000 && /^\d{6} is your Lovewall code/.test(m.Subject));
    if (msg) return msg.Subject.slice(0, 6);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No code for ${email}`);
}

export async function mailTo(email: string, subject: RegExp) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=10`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const msg = data.messages?.find((m) => subject.test(m.Subject));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      return full as { Subject: string; HTML: string; Text: string };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail "${subject}" for ${email}`);
}

let ipCounter = Math.floor(Math.random() * 200);
// Each test user looks like a different visitor, so the per-IP sign-in limits don't trip across tests.
export async function newContext(
  browser: Browser,
  opts: { colorScheme?: "light" | "dark"; viewport?: { width: number; height: number } } = {},
) {
  ipCounter = (ipCounter + 1) % 250;
  return browser.newContext({
    extraHTTPHeaders: { "x-real-ip": `10.77.${Math.floor(Math.random() * 250)}.${ipCounter + 1}` },
    colorScheme: opts.colorScheme ?? "light",
    viewport: opts.viewport ?? { width: 1440, height: 900 },
  });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  const started = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const code = await mailCode(email, started);
  await page.getByLabel("Code").fill(code);
  await page.waitForURL(/\/app(\/|$)/, { waitUntil: "commit" });
}

export async function createSpace(page: Page, name: string): Promise<string> {
  await page.goto("/app/new");
  await page.getByLabel("Space name").fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await page.waitForURL(/\/app\/[0-9A-Za-z]{12}$/, { waitUntil: "commit" });
  return page.url().split("/app/")[1];
}
