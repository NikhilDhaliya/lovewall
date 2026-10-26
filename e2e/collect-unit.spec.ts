import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { caseStudyDraft, caseStudyMarkdown } from "../src/lib/case-study";
import { customDomainRewrite, customDomainRoute, isPlatformHost, normalizeDomain } from "../src/lib/domains";
import { checkAnswers, liveQuestions, npsGroup, npsScore, pickPrize, type Question } from "../src/lib/forms";
import { en } from "../src/lib/i18n/collect/en";
import { LANGUAGES, pickLanguage, t } from "../src/lib/i18n/collect/languages";
import { csvRecipients, parseRecipients } from "../src/lib/recipients";

// Collect's pure functions: no server needed.

test("custom domains map only forms, wall pages and the form's own API", () => {
  expect(customDomainRoute("/")).toEqual({ kind: "form", slug: null });
  expect(customDomainRoute("/feedback")).toEqual({ kind: "form", slug: "feedback" });
  expect(customDomainRoute("/feedback/")).toEqual({ kind: "form", slug: "feedback" });
  expect(customDomainRoute("/w/AbCdEfGh1234")).toEqual({ kind: "wall", id: "AbCdEfGh1234" });
  expect(customDomainRoute("/w/AbCdEfGh1234/opengraph-image")).toEqual({ kind: "wall", id: "AbCdEfGh1234" });
  expect(customDomainRoute("/api/collect/AbCdEfGh1234")).toEqual({ kind: "collect-api", spaceId: "AbCdEfGh1234" });
  expect(customDomainRoute("/api/collect/AbCdEfGh1234/spin")).toEqual({ kind: "collect-api", spaceId: "AbCdEfGh1234" });
  expect(customDomainRoute("/_next/static/chunks/a.js")).toEqual({ kind: "asset" });
  for (const p of [
    "/app",
    "/app/x",
    "/login",
    "/api/auth/session",
    "/api/files/x",
    "/embed/AbCdEfGh1234",
    "/embed.js",
    "/Feedback",
    "/a/b",
    "/i/token",
    "/w/x",
  ]) {
    expect(customDomainRoute(p), p).toBeNull();
  }
  expect(customDomainRewrite({ kind: "form", slug: null }, "/", "acme")).toBe("/acme");
  expect(customDomainRewrite({ kind: "form", slug: "nps" }, "/nps", "acme")).toBe("/acme/nps");
  // Wall pages link to "/<space-slug>": on the custom domain that is the default form.
  expect(customDomainRewrite({ kind: "form", slug: "acme" }, "/acme", "acme")).toBe("/acme");
});

test("domain input is normalized and platform hosts are never custom", () => {
  expect(normalizeDomain("https://Love.Acme.com/path?x=1")).toBe("love.acme.com");
  expect(normalizeDomain("love.acme.com.")).toBe("love.acme.com");
  for (const bad of ["localhost", "10.0.0.1", "acme", "-x.acme.com", "love.acme.com:8080", "*.acme.com", "a..b.com"])
    expect(normalizeDomain(bad), bad).toBeNull();
  expect(isPlatformHost("lovewall.tech", "lovewall.tech")).toBe(true);
  expect(isPlatformHost("localhost:3122", "localhost:3122")).toBe(true);
  expect(isPlatformHost("127.0.0.1:3000", "lovewall.tech")).toBe(true);
  expect(isPlatformHost("lovewall-git-main.vercel.app", "lovewall.tech")).toBe(true);
  expect(isPlatformHost("love.acme.com", "lovewall.tech")).toBe(false);
});

test("answers are checked against their questions", () => {
  const questions: Question[] = [
    { id: "plan", type: "single", label: "Plan", required: true, options: ["Starter", "Pro"] },
    { id: "tools", type: "multiple", label: "Tools", required: false, options: ["A", "B", "C"] },
    { id: "mail", type: "email", label: "Email", required: false, options: [] },
    { id: "site", type: "url", label: "Site", required: false, options: [] },
    { id: "ok", type: "yesno", label: "OK?", required: false, options: [] },
  ];
  expect(checkAnswers(questions, {})).toEqual({ ok: false, id: "plan", error: "required" });
  expect(checkAnswers(questions, { plan: "Enterprise" })).toEqual({ ok: false, id: "plan", error: "invalid" });
  expect(checkAnswers(questions, { plan: "Pro", mail: "nope" })).toEqual({ ok: false, id: "mail", error: "email" });
  expect(checkAnswers(questions, { plan: "Pro", site: "javascript:alert(1)" })).toMatchObject({ ok: false, id: "site" });
  expect(checkAnswers(questions, { plan: "Pro", tools: ["C", "A"], site: "acme.com", ok: false, extra: "dropped" })).toEqual({
    ok: true,
    answers: { plan: "Pro", tools: ["A", "C"], site: "https://acme.com", ok: false },
  });
  expect(liveQuestions([{ id: "x", type: "single", label: "Pick", required: false, options: ["", ""] }])).toEqual([]);
});

test("NPS score, groups and prize odds", () => {
  expect(npsGroup(10)).toBe("promoter");
  expect(npsGroup(7)).toBe("passive");
  expect(npsGroup(6)).toBe("detractor");
  expect(npsScore({ promoters: 6, passives: 2, detractors: 2 })).toBe(40);
  expect(npsScore({ promoters: 0, passives: 0, detractors: 0 })).toBeNull();
  const prizes = [
    { label: "A", kind: "code" as const, value: "A", weight: 1 },
    { label: "B", kind: "none" as const, value: "", weight: 3 },
    { label: "C", kind: "none" as const, value: "", weight: 0 },
  ];
  expect(pickPrize(prizes, 0)).toBe(0);
  expect(pickPrize(prizes, 0.24)).toBe(0);
  expect(pickPrize(prizes, 0.26)).toBe(1);
  expect(pickPrize(prizes, 0.999)).toBe(1);
  const counts = [0, 0, 0];
  for (let i = 0; i < 4000; i++) counts[pickPrize(prizes, i / 4000)]++;
  expect(counts).toEqual([1000, 3000, 0]);
});

test("recipients from pasted lines and CSV files", () => {
  expect(parseRecipients("Ada Lovelace, ADA@example.com\nGrace <grace@example.com>\nlinus@example.com\nno email here\n\n")).toEqual([
    { name: "Ada Lovelace", email: "ada@example.com" },
    { name: "Grace", email: "grace@example.com" },
    { name: "", email: "linus@example.com" },
    { name: "no email here", email: "" },
  ]);
  expect(csvRecipients("First name,Last name,Email\nAda,Lovelace,ada@example.com\n")).toEqual([
    { name: "Ada Lovelace", email: "ada@example.com" },
  ]);
  expect(csvRecipients("grace@example.com,Grace\n")).toEqual([{ name: "", email: "grace@example.com" }]);
});

test("every language has every text, with the same placeholders", async () => {
  const dir = path.join(__dirname, "..", "src", "lib", "i18n", "collect");
  const files = readdirSync(dir).filter((f) => /^[a-z]{2}\.ts$/.test(f) && f !== "en.ts");
  expect(files.length).toBeGreaterThanOrEqual(21);
  expect(LANGUAGES.length).toBe(files.length + 1);
  const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const f of files) {
    const code = f.slice(0, 2);
    const dict = (await import(path.join(dir, f)))[code] as Record<string, string>;
    expect(Object.keys(dict).sort(), code).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) expect(holes(dict[k]), `${code}.${k}`).toBe(holes(v));
  }
  expect(pickLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  expect(pickLanguage("xx,de;q=0.5,ja;q=0.7")).toBe("ja");
  expect(pickLanguage("nn-NO")).toBe("nb");
  expect(pickLanguage("")).toBe("en");
  expect(t(en, "consentPhoto", { space: "Acme" })).toBe("Acme may share this publicly, with my name and photo.");
});

test("a case study exports as Markdown", () => {
  const draft = caseStudyDraft(
    {
      name: "Cass",
      title: "Head of Growth",
      company: "Initech",
      text: "Do it.",
      answers: { challenge: "Scattered reviews", solution: "One link", results: "2x", metric: "2x testimonials", extra: "x" },
    },
    [
      { id: "challenge", type: "long", label: "What challenge?", required: true, options: [] },
      { id: "solution", type: "long", label: "How did it help?", required: true, options: [] },
      { id: "results", type: "long", label: "Results?", required: true, options: [] },
      { id: "metric", type: "short", label: "Number", required: false, options: [] },
    ],
    "Acme",
  );
  expect(caseStudyMarkdown(draft)).toBe(
    "# Initech and Acme\n\n**Cass**, Head of Growth, Initech\n\n> **2x testimonials**\n\n## The challenge\n\nScattered reviews\n\n## The solution\n\nOne link\n\n## The results\n\n2x\n\n> “Do it.”\n> — Cass\n",
  );
});
