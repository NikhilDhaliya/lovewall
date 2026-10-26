import { expect, test } from "@playwright/test";
import { createSpace, newContext, signIn, uniqueEmail } from "./helpers";

// A click right after a page loads, while Next would be prefetching the target, once left the main area blank
// (vercel/next.js#99829). App links don't prefetch; this keeps it that way. It failed about 1 in 10 clicks before.
test("quick clicks after a page loads always show the next page", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signIn(page, uniqueEmail("nav"));
  const space = await createSpace(page, "Nav");
  for (let i = 0; i < 30; i++) {
    await page.goto(`/app/${space}/widgets`);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 5000 });
  }
  await ctx.close();
});
