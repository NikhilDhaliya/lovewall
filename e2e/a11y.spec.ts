import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createSpace, newContext, signIn, uniqueEmail } from "./helpers";

// Automated accessibility checks (WCAG 2 A/AA) on the main screens, light and dark.
async function audit(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`public pages pass axe (${scheme})`, async ({ browser }) => {
    const ctx = await newContext(browser, { colorScheme: scheme });
    const page = await ctx.newPage();
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await page.waitForTimeout(400);
      await audit(page, path);
    }
    await ctx.close();
  });

  test(`app pages pass axe (${scheme})`, async ({ browser }) => {
    const ctx = await newContext(browser, { colorScheme: scheme });
    const page = await ctx.newPage();
    await signIn(page, uniqueEmail(`a11y-${scheme}`));
    const space = await createSpace(page, `Axe ${scheme}`);
    for (const path of [`/app/${space}`, `/app/${space}/widgets`, `/app/${space}/collect`, `/app/${space}/settings`, "/app/settings"]) {
      await page.goto(path);
      await page.waitForTimeout(500);
      await audit(page, path);
    }
    const slug = (await page.goto(`/app/${space}/collect`)) && (await page.getByTestId("collect-link").textContent())!.split("/").pop()!;
    await page.goto(`/${slug}`);
    await page.waitForTimeout(400);
    await audit(page, "collect");
    await page.goto(`/app/settings`);
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
    await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
    await ctx.close();
  });
}
