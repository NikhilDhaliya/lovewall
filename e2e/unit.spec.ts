import { expect, test } from "@playwright/test";
import { csvToRows, parseCsv } from "../src/lib/csv";
import { esc } from "../src/lib/escape";
import { isPrivateAddress } from "../src/lib/net";
import { parseOembedHtml } from "../src/lib/oembed";
import { defaultConfig, parseConfig } from "../src/lib/widget/config";
import { widgetDocument } from "../src/lib/widget/render";
import { selectItems, summarize } from "../src/lib/widget/select";
import { SAMPLES } from "../src/lib/widget/samples";

// Pure functions: no server needed.

test("esc escapes everything that matters in HTML", () => {
  expect(esc(`<script>"x"&'y'\`</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&#96;&lt;/script&gt;");
});

test("widget HTML never contains user markup", () => {
  const evil = {
    ...SAMPLES[0],
    name: `<img src=x onerror=alert(1)>`,
    text: `</blockquote><script>alert(1)</script>`,
    title: `"><svg onload=alert(1)>`,
    sourceUrl: "javascript:alert(1)",
    source: "X",
  };
  for (const type of ["wall", "carousel", "marquee", "single", "badge"] as const) {
    const html = widgetDocument({
      widgetId: "abcdefgh1234",
      type,
      config: { ...defaultConfig(type), accent: "#000000" },
      items: [evil],
      summary: { average: 5, count: 1 },
      space: { name: "<b>Space</b>", slug: "s", logo: null, website: null },
      appUrl: "https://lovewall.tech",
      mode: "embed",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<b>Space</b>");
  }
});

test("config parsing falls back to safe defaults", () => {
  const c = parseConfig({ accent: "red;}</style><script>", radius: 999, max: -4, theme: "neon", sort: "evil" });
  expect(c.accent).toBe("#1d1d1f");
  expect(c.radius).toBe(12);
  expect(c.max).toBe(30);
  expect(c.theme).toBe("light");
  expect(c.sort).toBe("newest");
});

test("selection: featured first, filters, max", () => {
  const items = SAMPLES.map((t, i) => ({ ...t, featured: i === 3, tags: i % 2 ? ["pricing"] : [] }));
  const picked = selectItems(items, { ...defaultConfig("wall"), max: 3 });
  expect(picked).toHaveLength(3);
  expect(picked[0].featured).toBe(true);
  expect(selectItems(items, { ...defaultConfig("wall"), tag: "pricing" }).every((t) => t.tags.includes("pricing"))).toBe(true);
  expect(selectItems(items, { ...defaultConfig("wall"), minRating: 5 }).every((t) => t.rating === 5)).toBe(true);
  expect(summarize(items, defaultConfig("badge")).count).toBe(SAMPLES.length);
});

test("CSV: quotes, commas, newlines and header aliases", () => {
  expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([
    ["a", "b"],
    ["x, y", "line1\nline2"],
  ]);
  expect(parseCsv('a;b\n1;"2;3"')).toEqual([
    ["a", "b"],
    ["1", "2;3"],
  ]);
  const { rows, missing } = csvToRows('\uFEFFFull name,Review,Stars\nAda,"Great, really",5\n');
  expect(missing).toEqual([]);
  expect(rows[0]).toEqual({ name: "Ada", text: "Great, really", rating: "5" });
  expect(csvToRows("foo,bar\n1,2").missing).toEqual(["name", "text"]);
});

test("X oEmbed HTML becomes plain text and a date", () => {
  const html =
    '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello &amp; welcome<br>to <a href="https://t.co/x">@lovewall</a> <a href="https://t.co/y">pic.twitter.com/abc</a></p>&mdash; Ada (@ada) <a href="https://twitter.com/ada/status/1">October 26, 2026</a></blockquote>';
  const { text, date } = parseOembedHtml(html);
  expect(text).toBe("Hello & welcome\nto @lovewall");
  expect(date?.startsWith("2026-10-26")).toBe(true);
});

test("SSRF guard blocks private, loopback and link-local addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ]) {
    expect(isPrivateAddress(ip), ip).toBe(true);
  }
  for (const ip of ["1.1.1.1", "104.244.42.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
});
