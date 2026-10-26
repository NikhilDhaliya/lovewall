import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

// The browser extension's pure parts (no server): parse.js turns what collect.js reads near a selection into a
// draft; api.js maps settings and errors. Both are classic scripts, loaded here the way the popup loads them.
const EXT = join(__dirname, "..", "extension");

// The few extension APIs the tests call from extension pages.
declare const chrome: {
  storage: {
    local: { clear(): Promise<void>; get(key: string): Promise<Record<string, unknown>> };
    session: { set(items: object): Promise<void>; get(key: string): Promise<object> };
  };
};

type Draft = { name: string; title: string; handle: string; source: string; source_url: string; text: string };
type ParseApi = { parse(raw: unknown): Draft; draftKey(raw: unknown): string; httpsUrl(url: unknown): string };
type Result = { ok: boolean; status: number; data: unknown; error: { code?: string; message?: string } | null; network: boolean };
type Api = {
  normalizeAppUrl(input: string): string;
  originPattern(appUrl: string): string;
  messageFor(result: Result, appUrl: string): string;
  safeLink(url: unknown): string;
};

function load<T>(file: string, name: string, extra: Record<string, unknown> = {}): T {
  const sandbox: Record<string, unknown> = { URL, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(EXT, file), "utf8"), sandbox, { filename: file });
  return sandbox[name] as T;
}

const P = load<ParseApi>("parse.js", "LovewallParse");
const A = load<Api>("api.js", "LovewallApi");

test.describe("extension: parse.js", () => {
  test("X: name and @handle from User-Name, the post link without tracking", () => {
    const d = P.parse({
      url: "https://x.com/home",
      selection: "  Lovewall is   great.\n\n\n\nReally. ",
      context: { name: "Ada Lovelace\n\n@ada\n·\nOct 26", permalink: "https://x.com/ada/status/1849?s=20&t=abc" },
    });
    expect(d).toEqual({
      name: "Ada Lovelace",
      title: "",
      handle: "ada",
      source: "X",
      source_url: "https://x.com/ada/status/1849",
      text: "Lovewall is great.\n\nReally.",
    });
    const oneLine = P.parse({
      url: "https://twitter.com/home",
      context: { name: "Grace H.@grace_h·2h", permalink: "https://twitter.com/grace_h/status/77/analytics" },
    });
    expect([oneLine.name, oneLine.handle, oneLine.source_url]).toEqual(["Grace H.", "grace_h", "https://twitter.com/grace_h/status/77"]);
    // No post found on the page: the address and the title still name the author.
    const fromTitle = P.parse({
      url: "https://x.com/linus/status/5?s=46",
      title: 'Linus T on X: "Ship it" / X',
      context: { text: "Ship it" },
    });
    expect([fromTitle.name, fromTitle.handle, fromTitle.source_url, fromTitle.text]).toEqual([
      "Linus T",
      "linus",
      "https://x.com/linus/status/5",
      "Ship it",
    ]);
  });

  test("LinkedIn: actor name without the repeat and degree, headline as title, post link from the urn", () => {
    const d = P.parse({
      url: "https://www.linkedin.com/feed/?trk=nav",
      selection: "Best tool we bought this year.",
      context: {
        name: "Jane Doe\nJane Doe\n • 2nd",
        title: "Founder at Acme | Building calm software\nFounder at Acme | Building calm software",
        urn: "urn:li:activity:7250000000000000000",
      },
    });
    expect(d.name).toBe("Jane Doe");
    expect(d.title).toBe("Founder at Acme | Building calm software");
    expect(d.source).toBe("LinkedIn");
    expect(d.source_url).toBe("https://www.linkedin.com/feed/update/urn:li:activity:7250000000000000000/");
    expect(P.parse({ url: "https://www.linkedin.com/in/x", context: { name: "Jane DoeJane Doe" } }).name).toBe("Jane Doe");
    expect(
      P.parse({ url: "https://www.linkedin.com/feed/", context: { name: "Sam Lee Sam Lee", urn: "urn:li:comment:(activity:725,999)" } }),
    ).toMatchObject({
      name: "Sam Lee",
      source_url: "https://www.linkedin.com/feed/update/urn:li:activity:725/?commentUrn=urn%3Ali%3Acomment%3A(activity%3A725%2C999)",
    });
    expect(P.parse({ url: "https://www.linkedin.com/posts/jane_abc?utm_source=share&trk=x&rcm=y", context: {} }).source_url).toBe(
      "https://www.linkedin.com/posts/jane_abc",
    );
  });

  test("G2: reviewer and title; anonymous reviews keep the industry", () => {
    const d = P.parse({
      url: "https://www.g2.com/products/lovewall/reviews?utm_source=google",
      context: {
        name: "Ada L.\nProduct Manager",
        title: "Product Manager",
        permalink: "https://www.g2.com/products/lovewall/reviews/lovewall-review-123",
      },
    });
    expect(d).toMatchObject({
      name: "Ada L.",
      title: "Product Manager",
      source: "G2",
      source_url: "https://www.g2.com/products/lovewall/reviews/lovewall-review-123",
    });
    const anon = P.parse({ url: "https://www.g2.com/products/lovewall/reviews", context: { name: "Verified User in Computer Software" } });
    expect(anon).toMatchObject({
      name: "Verified User",
      title: "Computer Software",
      source_url: "https://www.g2.com/products/lovewall/reviews",
    });
  });

  test("Product Hunt: author and @handle from the profile link", () => {
    const d = P.parse({
      url: "https://www.producthunt.com/products/lovewall/reviews",
      context: { name: "Sam Rivers", handle: "/@samrivers", title: "Maker of small tools" },
    });
    expect(d).toMatchObject({ name: "Sam Rivers", handle: "samrivers", title: "Maker of small tools", source: "Product Hunt" });
    expect(d.source_url).toBe("https://www.producthunt.com/products/lovewall/reviews");
  });

  test("Reddit: u/username and the comment permalink", () => {
    const d = P.parse({
      url: "https://www.reddit.com/r/SaaS/comments/abc/best_tools/?share_id=1",
      context: { author: "throwaway_42", permalink: "/r/SaaS/comments/abc/best_tools/def/" },
    });
    expect(d).toMatchObject({
      name: "u/throwaway_42",
      handle: "",
      source: "Reddit",
      source_url: "https://www.reddit.com/r/SaaS/comments/abc/best_tools/def/",
    });
    expect(P.parse({ url: "https://old.reddit.com/r/x/", context: { author: "[deleted]" } }).name).toBe("");
  });

  test("any site: og:site_name as source, author meta as name, the canonical link", () => {
    const d = P.parse({
      url: "https://blog.example.com/post?utm_campaign=x#comments",
      canonical: "https://blog.example.com/post",
      selection: "They answered in minutes.",
      meta: { siteName: "Example Blog", author: "Grace Hopper" },
    });
    expect(d).toEqual({
      name: "Grace Hopper",
      title: "",
      handle: "",
      source: "Example Blog",
      source_url: "https://blog.example.com/post",
      text: "They answered in minutes.",
    });
    // Author metas that are links or the site itself are not people; a canonical on another host is ignored.
    expect(
      P.parse({ url: "https://news.example.com/a", meta: { author: "https://example.com/grace", articleAuthor: "news.example.com" } }).name,
    ).toBe("");
    expect(P.parse({ url: "https://a.example.com/x", meta: { siteName: "Acme", author: "Acme" } }).name).toBe("");
    expect(P.parse({ url: "https://a.example.com/x", canonical: "https://evil.example.net/x" }).source_url).toBe("https://a.example.com/x");
  });

  test("a bare page: the hostname is the source", () => {
    expect(P.parse({ url: "https://www.example.org/thanks" })).toEqual({
      name: "",
      title: "",
      handle: "",
      source: "example.org",
      source_url: "https://www.example.org/thanks",
      text: "",
    });
  });

  test("junk, whitespace and overlong input never throw and stay within the API limits", () => {
    const empty = { name: "", title: "", handle: "", source: "", source_url: "", text: "" };
    for (const raw of [null, undefined, "x", 42, [], { url: 5, selection: {}, meta: "x", context: [] }, { url: "not a url" }]) {
      expect(P.parse(raw)).toEqual(empty);
    }
    const messy = P.parse({
      url: "https://example.com/",
      selection: "\u200b \n\t\u202e evil\u0000 \r\n\r\n\r\n\r\nline two\u2028three \u00a0 ",
      meta: { siteName: " \n\u200bExample\u202e  Site\t", author: "  Ada\u0007   Lovelace  " },
    });
    expect(messy.text).toBe("evil\n\nline two\nthree");
    expect(messy.source).toBe("Example Site");
    expect(messy.name).toBe("Ada Lovelace");

    const long = P.parse({
      url: "https://x.com/home",
      selection: "word ".repeat(1200),
      context: { name: `${"N".repeat(79)}😀\n@${"h".repeat(15)}` },
    });
    expect(long.text.length).toBeLessThanOrEqual(3000);
    expect(long.name.length).toBeLessThanOrEqual(80);
    expect(long.name).not.toMatch(/[\ud800-\udbff]$/);
    expect(P.parse({ url: "https://example.com/", meta: { siteName: "S".repeat(100) } }).source).toHaveLength(32);
    expect(P.parse({ url: `https://example.com/?q=${"a".repeat(600)}` }).source_url).toBe("");
  });

  test("javascript:, data:, http: and credentials never become source_url", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com/x",
      "https://u:p@example.com/x",
    ]) {
      expect(P.httpsUrl(bad), bad).toBe("");
      expect(P.parse({ url: bad }).source_url, bad).toBe("");
      expect(P.parse({ url: "https://x.com/home", context: { permalink: bad } }).source_url, bad).toBe("https://x.com/home");
      expect(P.parse({ url: "https://example.com/a", canonical: bad }).source_url, bad).toBe("https://example.com/a");
      expect(P.parse({ url: "https://www.reddit.com/r/x/", context: { author: "ada", permalink: bad } }).source_url, bad).toBe(
        "https://www.reddit.com/r/x/",
      );
      expect(P.parse({ url: "https://www.g2.com/p", context: { name: "A", permalink: bad } }).source_url, bad).toBe("https://www.g2.com/p");
    }
    expect(
      P.parse({ url: "https://www.linkedin.com/feed/", context: { urn: "urn:li:activity:1/../javascript:alert(1)" } }).source_url,
    ).toBe("https://www.linkedin.com/feed/");
    // Extension and browser pages are not sources.
    expect(P.parse({ url: "chrome-extension://abcdefghijklmnop/popup.html" })).toMatchObject({ source: "", source_url: "" });
  });

  test("the same page and selection give the same draft key", () => {
    expect(P.draftKey({ url: "https://a.com/", selection: " hi " })).toBe(P.draftKey({ url: "https://a.com/", selection: "hi" }));
    expect(P.draftKey({ url: "https://a.com/", selection: "hi" })).not.toBe(P.draftKey({ url: "https://a.com/", selection: "ho" }));
    expect(P.draftKey(null)).toBe("\n");
  });

  test("parse.js also works as a Node module", () => {
    const mod = { exports: {} as Partial<ParseApi> };
    load<ParseApi>("parse.js", "LovewallParse", { module: mod });
    expect(typeof mod.exports.parse).toBe("function");
  });
});

test.describe("extension: api.js", () => {
  test("app URLs: https origins, plain http only on this computer", () => {
    expect(A.normalizeAppUrl("love.example.org")).toBe("https://love.example.org");
    expect(A.normalizeAppUrl(" https://love.example.org/ ")).toBe("https://love.example.org");
    expect(A.normalizeAppUrl("https://wall.example.com/app/settings")).toBe("https://wall.example.com");
    expect(A.normalizeAppUrl("localhost:3000")).toBe("http://localhost:3000");
    for (const bad of [
      "",
      "http://love.example.org",
      "javascript:alert(1)",
      "https://u:p@love.example.org",
      "ftp://love.example.org",
      "https://intranet",
    ]) {
      expect(A.normalizeAppUrl(bad), bad).toBe("");
    }
    expect(A.originPattern("http://localhost:3000")).toBe("http://localhost/*");
    expect(A.originPattern("https://love.example.org")).toBe("https://love.example.org/*");
  });

  test("errors read as short lines", () => {
    const r = (status: number, message?: string): Result => ({
      ok: false,
      status,
      data: null,
      error: message ? { message } : null,
      network: false,
    });
    expect(A.messageFor({ ...r(0), network: true }, "https://love.example.org")).toBe("Can't reach love.example.org");
    expect(A.messageFor(r(401), "https://love.example.org")).toBe("Check your API key");
    expect(A.messageFor(r(403), "https://love.example.org")).toBe("This key is read-only");
    expect(A.messageFor(r(409, "A testimonial with this source_url already exists"), "https://love.example.org")).toBe("Already saved");
    expect(A.messageFor(r(422, "Add a name"), "https://love.example.org")).toBe("Add a name");
    expect(A.messageFor(r(500), "https://love.example.org")).toBe("Something went wrong (500)");
    expect(A.safeLink("javascript:alert(1)")).toBe("");
    expect(A.safeLink("https://love.example.org/app/s1")).toBe("https://love.example.org/app/s1");
  });
});

// collect() in a real page: pages are served by request interception, nothing leaves the machine.
test.describe("extension: collect.js in a page", () => {
  async function collectOn(page: Page, url: string, html: string, select?: string) {
    await page.route(url, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head>${html}</html>` }),
    );
    await page.goto(url);
    await page.addScriptTag({ path: join(EXT, "collect.js") });
    if (select) {
      await page.evaluate((selector) => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(selector)!);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
      }, select);
    }
    return P.parse(await page.evaluate(() => (globalThis as unknown as { LovewallCollect: () => unknown }).LovewallCollect()));
  }

  const tweet = (id: string, name: string, handle: string, text: string) =>
    `<article data-testid="tweet" id="t${id}"><div data-testid="User-Name"><span>${name}</span><div><span>@${handle}</span><span>·</span><a href="/${handle}/status/${id}"><time>Oct 26</time></a></div></div><div data-testid="tweetText" lang="en">${text}</div></article>`;

  test("X: the author of the post the selection is in", async ({ page }) => {
    const html = `<title>Home / X</title></head><body>${tweet("11", "Ada Lovelace", "ada", "First post")}${tweet("22", "Grace Hopper", "grace", "Lovewall made our page.")}</body>`;
    const d = await collectOn(page, "https://x.com/home", html, "#t22 [data-testid=tweetText]");
    expect(d).toMatchObject({
      name: "Grace Hopper",
      handle: "grace",
      source: "X",
      source_url: "https://x.com/grace/status/22",
      text: "Lovewall made our page.",
    });
    // Toolbar on a post page, nothing selected: the post in the address.
    const page2 = await collectOn(page, "https://x.com/ada/status/11", html);
    expect(page2).toMatchObject({ name: "Ada Lovelace", handle: "ada", source_url: "https://x.com/ada/status/11", text: "First post" });
  });

  test("LinkedIn, Reddit and a plain site", async ({ page }) => {
    const li = await collectOn(
      page,
      "https://www.linkedin.com/feed/",
      `</head><body><div data-urn="urn:li:activity:42"><div class="update-components-actor__title"><span dir="ltr"><span aria-hidden="true">Jane Doe</span><span class="visually-hidden">Jane Doe</span></span> • 2nd</div><div class="update-components-actor__description"><span aria-hidden="true">Founder at Acme</span><span class="visually-hidden">Founder at Acme</span></div><div class="update-components-text" id="post">Calm and fast.</div></div></body>`,
      "#post",
    );
    expect(li).toMatchObject({
      name: "Jane Doe",
      title: "Founder at Acme",
      source: "LinkedIn",
      source_url: "https://www.linkedin.com/feed/update/urn:li:activity:42/",
    });

    const reddit = await collectOn(
      page,
      "https://www.reddit.com/r/SaaS/comments/abc/tools/",
      `</head><body><shreddit-comment author="throwaway_42" permalink="/r/SaaS/comments/abc/tools/def/"><div slot="comment"><p id="c">Switched last month, no regrets.</p></div></shreddit-comment></body>`,
      "#c",
    );
    expect(reddit).toMatchObject({
      name: "u/throwaway_42",
      source: "Reddit",
      source_url: "https://www.reddit.com/r/SaaS/comments/abc/tools/def/",
    });

    const site = await collectOn(
      page,
      "https://blog.example.com/review?utm_source=x",
      `<meta property="og:site_name" content="Example Blog"><meta name="author" content="Grace Hopper"><link rel="canonical" href="https://blog.example.com/review"></head><body><p id="q">Worth every cent.</p></body>`,
      "#q",
    );
    expect(site).toEqual({
      name: "Grace Hopper",
      title: "",
      handle: "",
      source: "Example Blog",
      source_url: "https://blog.example.com/review",
      text: "Worth every cent.",
    });
  });
});

// The unpacked extension in headless Chrome. Branded Chrome ignores --load-extension since 137, so it is loaded
// over the DevTools protocol (Extensions.loadUnpacked). The Lovewall API is mocked by request interception.
test.describe("extension: pages in headless Chrome", () => {
  let ctx: BrowserContext;
  let cdp: CDPSession;
  let id: string;
  let profile: string;
  let copy: string;
  // The test's Lovewall address. Headless Chrome can't answer the access prompt, so the test loads a copy of the
  // extension that already holds this one host (as if the user had allowed it); the code still asks, and Chrome says yes.
  const APP = "https://wall.example.com";

  test("the manifest asks for no host up front", () => {
    const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toContain("https://*/*");
    expect(manifest.content_scripts).toBeUndefined();
  });

  test.beforeAll(async () => {
    copy = mkdtempSync(join(tmpdir(), "lovewall-ext-copy-"));
    cpSync(EXT, copy, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
    writeFileSync(join(copy, "manifest.json"), JSON.stringify({ ...manifest, host_permissions: [`${APP}/*`] }));
    profile = mkdtempSync(join(tmpdir(), "lovewall-ext-"));
    ctx = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
      args: ["--enable-unsafe-extension-debugging"],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    cdp = await ctx.browser()!.newBrowserCDPSession();
    // On install the extension opens its options page, which can take over a test's tab: wait for it and close it.
    const welcome = ctx.waitForEvent("page", { predicate: (p) => p.url().endsWith("/options.html"), timeout: 10_000 }).catch(() => null);
    id = ((await cdp.send("Extensions.loadUnpacked" as never, { path: copy } as never)) as { id: string }).id;
    expect(id).toMatch(/^[a-p]{32}$/);
    await (await welcome)?.close();
  });

  test.afterAll(async () => {
    await ctx?.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(copy, { recursive: true, force: true });
  });

  async function audit(page: Page, name: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }

  const SPACE = {
    id: "s1",
    name: "Acme",
    slug: "acme",
    website: null,
    counts: { new: 0, approved: 0, hidden: 0, total: 0 },
    rating: { average: 0, count: 0 },
  };

  for (const scheme of ["light", "dark"] as const) {
    test(`options and popup work and pass axe (${scheme})`, async () => {
      const page = await ctx.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      let status = 201;
      let posted: Record<string, unknown> | null = null;
      await page.route(`${APP}/api/v1/**`, async (route) => {
        const req = route.request();
        expect(req.headers()["authorization"]).toBe(`Bearer lw_${"a".repeat(40)}`);
        if (req.url().endsWith("/space")) return route.fulfill({ json: { data: SPACE } });
        if (status === 0) return route.abort();
        posted = req.postDataJSON();
        if (status !== 201) return route.fulfill({ status, json: { error: { code: "x", message: "Nope" } } });
        return route.fulfill({ status, json: { data: { id: "t1", inbox_url: `${APP}/app/s1` } } });
      });

      // Not set up yet.
      await page.goto(`chrome-extension://${id}/popup.html?window=1`);
      await expect(page.getByRole("heading", { name: "Connect your Lovewall" })).toBeVisible();
      await audit(page, "popup setup");

      // Options: no address by default; a wrong key is caught before any call, then a good one connects.
      await page.goto(`chrome-extension://${id}/options.html`);
      await expect(page.getByLabel("App URL")).toHaveValue("");
      await expect(page.getByRole("link", { name: "Get a key" })).toBeHidden();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Add your Lovewall address")).toBeVisible();
      await page.getByLabel("App URL").fill("wall.example.com");
      await expect(page.getByRole("link", { name: "Get a key" })).toHaveAttribute("href", `${APP}/app`);
      await page.getByLabel("API key").fill("nope");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Keys start with lw_")).toBeVisible();
      await audit(page, "options error");
      await page.getByLabel("API key").fill(`lw_${"a".repeat(40)}`);
      await page.getByLabel("API key").press("Enter");
      await expect(page.getByText("Connected to Acme")).toBeVisible();
      await audit(page, "options");

      // Popup with a draft from the context menu.
      await page.evaluate(() =>
        chrome.storage.session.set({
          draft: {
            tabId: -1,
            key: "",
            at: Date.now(),
            fields: {
              name: "Ada Lovelace",
              title: "",
              handle: "ada",
              source: "X",
              source_url: "https://x.com/ada/status/1",
              text: "Lovewall is great.",
              rating: 0,
            },
          },
        }),
      );
      await page.goto(`chrome-extension://${id}/popup.html?window=1`);
      await expect(page.getByLabel("Text")).toHaveValue("Lovewall is great.");
      await expect(page.getByText("x.com/ada/status/1")).toBeVisible();
      await page.locator("label[for=star-4]").click();
      await audit(page, "popup form");

      for (const [code, message] of [
        [401, "Check your API key"],
        [403, "This key is read-only"],
        [409, "Already saved"],
        [0, "Can't reach wall.example.com"],
      ] as const) {
        status = code;
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText(message)).toBeVisible();
      }
      await audit(page, "popup error");

      status = 201;
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open inbox" })).toHaveAttribute("href", `${APP}/app/s1`);
      // Saves wait in the inbox as new unless "Approve on save" is on.
      expect(posted).toEqual({
        name: "Ada Lovelace",
        text: "Lovewall is great.",
        status: "new",
        handle: "ada",
        source: "X",
        source_url: "https://x.com/ada/status/1",
        rating: 4,
      });
      await audit(page, "popup saved");

      await page.goto(`chrome-extension://${id}/options.html`);
      await expect(page.getByLabel("Approve on save")).not.toBeChecked();
      await page.getByLabel("Approve on save").check();
      await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get("autoApprove")).autoApprove)).toBe(true);
      await audit(page, "options approve on save");
      await page.evaluate(() =>
        chrome.storage.session.set({
          draft: {
            tabId: -1,
            key: "",
            at: Date.now(),
            fields: { name: "Grace", text: "Calm and fast.", source: "", source_url: "", rating: 0 },
          },
        }),
      );
      await page.goto(`chrome-extension://${id}/popup.html?window=1`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
      expect(posted).toEqual({ name: "Grace", text: "Calm and fast.", status: "approved" });
      await page.evaluate(() => chrome.storage.local.clear());
      await page.close();
    });
  }

  test("context menu: the selection becomes a draft and the popup opens", async () => {
    const sw =
      ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}/`)) ?? (await ctx.waitForEvent("serviceworker"));
    // A page the extension may not read (no tab): Chrome's selection text is used.
    const draft = await sw.evaluate(async () => {
      const g = globalThis as unknown as { saveSelection(info: object, tab: object): Promise<void> };
      await g.saveSelection(
        { menuItemId: "lovewall-save", selectionText: "Calm and fast.", pageUrl: "https://x.com/ada/status/9?s=20", frameId: 0 },
        { id: -1 },
      );
      return ((await chrome.storage.session.get("draft")) as { draft: { fields: Record<string, unknown> } }).draft.fields;
    });
    expect(draft).toMatchObject({
      text: "Calm and fast.",
      source: "X",
      handle: "ada",
      source_url: "https://x.com/ada/status/9",
      rating: 0,
    });
    // The toolbar popup is a browser target Playwright doesn't list as a page: ask the protocol.
    await expect
      .poll(async () => {
        const { targetInfos } = (await cdp.send("Target.getTargets" as never)) as { targetInfos: { url: string }[] };
        return targetInfos.some((t) => t.url.startsWith(`chrome-extension://${id}/popup.html`));
      })
      .toBe(true);
  });
});
