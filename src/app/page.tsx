import type { Metadata } from "next";
import { ArrowRight, Check, Minus } from "lucide-react";
import Link from "next/link";
import { BrowserFrame, LayoutDemo, MiniForm, MiniInbox } from "@/components/landing/demos";
import { buttonClass } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { CodeBlock } from "@/components/widgets/code-block";
import { cn } from "@/lib/cn";
import { defaultConfig } from "@/lib/widget/config";
import { widgetBody, widgetCss } from "@/lib/widget/render";
import { SAMPLES } from "@/lib/widget/samples";

const GITHUB = "https://github.com/NikhilDhaliya/lovewall";
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  title: { absolute: "Lovewall: open-source testimonials" },
  description:
    "Collect testimonials with one link and show a wall of love on your site. Open source: free to self-host, or $9/mo hosted with a 14-day trial.",
  alternates: { canonical: "/" },
};

const GH_PATH =
  "M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.8 18.3 5.1 18.3 5.1c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={GH_PATH} />
    </svg>
  );
}

const COMPARE: { row: string; us: string | boolean; senja: string | boolean; tto: string | boolean }[] = [
  { row: "Price", us: "Free self-hosted · $9/mo hosted", senja: "$0–59 / mo", tto: "$0–95 / mo" },
  { row: "Testimonials on the free plan", us: "Unlimited", senja: "15", tto: "10 text, 2 video" },
  { row: "Unlimited video", us: "Included", senja: "From $29 / mo", tto: "From $50 / mo" },
  { row: "Remove their branding", us: "Included", senja: "From $29 / mo", tto: "Not checked" },
  { row: "Custom domain", us: "Included", senja: "From $29 / mo", tto: "Not checked" },
  { row: "API and webhooks", us: "Included", senja: "Not checked", tto: "From $50 / mo" },
  { row: "Team members", us: "Included", senja: "From $59 / mo", tto: "Not checked" },
  { row: "Self-host", us: true, senja: false, tto: false },
  { row: "Open source", us: "AGPL-3.0", senja: false, tto: false },
];

// The rest of the product, in plain rows: what it does, in one line each.
const MORE: { title: string; text: string }[] = [
  {
    title: "Forms",
    text: "Testimonials, NPS surveys and case studies, with your own questions, on one page or step by step. 22 languages, or the visitor’s own.",
  },
  {
    title: "Invites",
    text: "Paste a list or upload a CSV. Each person gets their own link and one reminder; you see who opened and answered.",
  },
  { title: "Rewards", text: "Say thanks with a coupon code, a link, or a spin of the wheel." },
  { title: "Your domain", text: "Forms and wall pages on love.yourcompany.com." },
  {
    title: "Import",
    text: "Google, Trustpilot, G2, Capterra, Product Hunt, App Store, Google Play, Shopify, WordPress.org, Chrome Web Store, Yelp, X, Reddit, Hacker News, YouTube, TikTok, LinkedIn, Facebook, Instagram, screenshots and CSV.",
  },
  { title: "Move in", text: "Upload the CSV export from Senja or Testimonial.to. Photos and videos come too." },
  { title: "Mentions", text: "Watch Hacker News and Reddit for your product’s name, with a daily email." },
  { title: "Wall of love page", text: "Tag filters, your call to action, four styles, and a share image for social posts." },
  { title: "Video", text: "Recorded in the browser or uploaded, trimmed in the editor, with captions." },
  { title: "Analytics", text: "Views, clicks and plays per widget, without cookies. Google review stars with JSON-LD. Custom CSS." },
  {
    title: "Connect",
    text: "REST API and signed webhooks, Slack and Discord alerts, Zapier and Make, an MCP server for Claude, ChatGPT and Cursor, a Chrome extension, a WordPress plugin, and guides for 13 site builders.",
  },
  { title: "Team", text: "Invite people by email. Owners manage members and billing, editors do the rest." },
  {
    title: "AI, optional",
    text: "Spam filter, sentiment tags, best-line highlights, summaries, spelling help for visitors, video transcripts and captions, translated widgets, case studies from answers. Hosted, it’s included; self-hosted, bring your own keys.",
  },
  {
    title: "Privacy",
    text: "Givers get a private link to edit or delete their testimonial. A report link on every wall. Export your whole account. No raw IPs stored. Essential cookies only.",
  },
];

const FAQ = [
  {
    q: "Is it free?",
    a: "Self-hosting is free, with every feature. Hosted at lovewall.tech it’s $9 a month or $90 a year after a 14-day trial, no card needed. Same features either way. The code is AGPL-3.0.",
  },
  { q: "Can I host it myself?", a: "Yes. One docker compose command, or Vercel with a Supabase database. Your data stays yours." },
  {
    q: "Will the widget slow my site down?",
    a: "The loader is about 2 KB gzipped, lazy-loads, and the widget is cached and sizes itself.",
  },
  {
    q: "Can I move from another tool?",
    a: "Upload the CSV export from Senja or Testimonial.to; photos and videos come along. Or import from Google, Trustpilot, G2, X and the other sources above.",
  },
  {
    q: "Does it use AI?",
    a: "Only if you want. The AI features run on Claude and Deepgram: on lovewall.tech they’re included; self-hosted, add your own keys, and without them they stay hidden. Every switch is per space.",
  },
  {
    q: "Does it track my visitors?",
    a: "No. Widgets and public pages set no cookies. The app uses one session cookie. Analytics count views without identifying anyone.",
  },
  { q: "How do I get support?", a: "Open an issue on GitHub. Pull requests are welcome." },
];

const H2 = "font-display text-[28px] leading-[1.15] font-medium tracking-[-0.022em] text-balance sm:text-[36px]";
const LEAD = "mt-3 max-w-[440px] text-[16px] leading-relaxed text-muted sm:text-[17px]";
const WRAP = "mx-auto max-w-[1080px] px-5";

function Cell({ value, strong }: { value: string | boolean; strong?: boolean }) {
  if (value === true)
    return <Check className={cn("mx-auto size-4", strong ? "text-ink" : "text-muted")} strokeWidth={2.5} aria-label="Yes" />;
  if (value === false) return <Minus className="mx-auto size-4 text-faint" aria-label="No" />;
  return <span className={cn(strong ? "font-medium text-ink" : "text-muted")}>{value}</span>;
}

// One plan in the pricing table: two plain columns split by a hairline.
function PricingColumn({
  title,
  price,
  per,
  note,
  points,
  className,
  children,
}: {
  title: string;
  price: string;
  per?: string;
  note: string;
  points: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col p-6 sm:p-8", className)}>
      <h3 className="text-[15px] font-medium">{title}</h3>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-[40px] leading-none font-medium tracking-[-0.03em]">{price}</span>
        {per && <span className="text-[15px] text-muted">{per}</span>}
      </p>
      <p className="mt-2 text-[14px] text-muted">{note}</p>
      <ul className="mt-6 mb-8 space-y-2.5 text-[15px]">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2.5">
            <Check className="size-4 shrink-0 text-muted" strokeWidth={2.25} aria-hidden />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

// One feature: words on one side, the real UI on the other, set on a quiet panel.
function Feature({
  id,
  title,
  text,
  flip,
  children,
}: {
  id: string;
  title: string;
  text: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid items-center gap-8 rounded-[16px] bg-grouped p-6 ring-1 ring-line sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14"
    >
      <div className={cn(flip && "lg:order-2")}>
        <h2 id={id} className={H2}>
          {title}
        </h2>
        <p className={LEAD}>{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function Landing() {
  const heroConfig = { ...defaultConfig("wall"), branding: false, showSource: true, max: 6 };
  const badgeConfig = { ...defaultConfig("badge"), showPhoto: false };
  const badge = widgetBody({
    widgetId: "demo",
    type: "badge",
    config: badgeConfig,
    items: SAMPLES,
    summary: { average: 4.9, count: 128 },
    space: { name: "Northwind", slug: "", logo: null, website: null },
    appUrl,
    mode: "page",
  });
  const hero = widgetBody({
    widgetId: "hero",
    type: "wall",
    config: heroConfig,
    items: SAMPLES,
    summary: { average: 4.8, count: 6 },
    space: { name: "Northwind", slug: "", logo: null, website: null },
    appUrl,
    mode: "page",
  });

  return (
    <div className="bg-canvas text-ink">
      <style dangerouslySetInnerHTML={{ __html: `${widgetCss(heroConfig, ".lw-hero")}\n${widgetCss(badgeConfig, ".lw-step")}` }} />
      <header className="sticky top-0 z-40 bar pt-safe hairline-b">
        <nav className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5" aria-label="Main">
          <Link href="/" aria-label="Lovewall home" className="rounded-lg">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={GITHUB}
              className="hidden h-9 items-center gap-1.5 rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink sm:flex"
            >
              <GitHubIcon className="size-4" /> GitHub
            </a>
            <Link
              href="/login"
              className="flex h-9 items-center rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link href="/login" className={buttonClass("primary", "sm", "px-3.5")}>
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-16 sm:pt-28">
          <div className="mx-auto max-w-[760px] px-5 text-center">
            <h1 className="font-display text-[42px] leading-[1.06] font-medium tracking-[-0.032em] text-balance sm:text-[64px]">
              Testimonials, open&nbsp;source.
            </h1>
            <p className="mx-auto mt-5 max-w-[460px] text-[17px] leading-relaxed text-balance text-muted sm:text-[19px]">
              Collect them with one link. Show them on your site with one line of code.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link href="/login" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
                Get started <ArrowRight className="size-4" />
              </Link>
              <a href={GITHUB} className={buttonClass("secondary", "lg", "w-full sm:w-auto")}>
                <GitHubIcon className="size-4" /> Star on GitHub
              </a>
            </div>
            <p className="mt-5 text-[13px] text-faint">Free to self-host · $9/mo hosted, 14-day trial</p>
          </div>

          <div className={cn(WRAP, "mt-14 sm:mt-20")}>
            <BrowserFrame url="northwind.com/love">
              <div className="relative max-h-[540px] overflow-hidden bg-grouped px-3 pt-6 sm:max-h-[600px] sm:px-8 sm:pt-10">
                <div className="mx-auto max-w-[920px]">
                  <p className="mb-5 text-center font-display text-[20px] font-medium tracking-[-0.02em] sm:mb-7 sm:text-[24px]">
                    Loved by teams who plan with Northwind
                  </p>
                  <div className="lw-hero" data-theme="auto" aria-label="Example widget" dangerouslySetInnerHTML={{ __html: hero }} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-grouped to-transparent" />
              </div>
            </BrowserFrame>
            <p className="mt-3 text-center text-[12px] text-faint">A Lovewall widget on a made-up product’s site.</p>
          </div>
        </section>

        {/* What it does */}
        <div className={cn(WRAP, "mt-24 space-y-4 sm:mt-32")}>
          <Feature
            id="collect"
            title="Collect with one link"
            text="Customers rate, write or record a short video right in the browser. No account, no app."
          >
            <MiniForm />
          </Feature>
          <Feature
            id="approve"
            flip
            title="Approve with your keyboard"
            text="Everything lands in one inbox. j and k to move, a to approve, h to hide."
          >
            <MiniInbox />
          </Feature>
          <Feature
            id="embed"
            title="Embed with one line"
            text="One script tag. The widget sizes itself, loads after your page and never shows a scrollbar."
          >
            <div className="mx-auto w-full max-w-[440px] space-y-3">
              <CodeBlock
                label="HTML"
                code={`<script src="${appUrl}/embed.js" defer></script>\n<div data-lovewall="your-id"></div>`}
                className="bg-surface ring-1 ring-line"
              />
              <BrowserFrame url="yoursite.com">
                <div className="lw-step flex justify-center px-4 py-7" data-theme="auto" dangerouslySetInnerHTML={{ __html: badge }} />
              </BrowserFrame>
            </div>
          </Feature>
        </div>

        {/* The rest */}
        <section className={cn(WRAP, "mt-28 sm:mt-36")} aria-labelledby="more">
          <h2 id="more" className={H2}>
            And the rest
          </h2>
          <p className={LEAD}>Everything Senja and Testimonial.to do, in both plans.</p>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {MORE.map((m) => (
              <div key={m.title} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-[15px] font-medium">{m.title}</dt>
                <dd className="text-[15px] leading-relaxed text-muted">{m.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Layouts */}
        <section className={cn(WRAP, "mt-28 sm:mt-36")} aria-labelledby="layouts">
          <h2 id="layouts" className={H2}>
            Thirteen layouts, your colours
          </h2>
          <p className={LEAD}>Try a few. This is the real widget; video, gallery, popup and logos need real media.</p>
          <div className="mt-8">
            <LayoutDemo appUrl={appUrl} />
          </div>
        </section>

        {/* Comparison */}
        <section className={cn(WRAP, "mt-28 sm:mt-36")} aria-labelledby="compare">
          <h2 id="compare" className={H2}>
            Compared with Senja and Testimonial.to
          </h2>
          <div className="mt-8 overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
            <table className="w-full border-collapse text-center text-[13px] sm:text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="hidden w-[34%] px-5 py-3.5 text-left font-normal text-muted sm:table-cell" scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th className="w-1/3 px-2 py-3.5 font-medium sm:w-auto sm:px-3" scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      <LogoMark size={16} className="max-sm:hidden" /> Lovewall
                    </span>
                  </th>
                  <th className="w-1/3 px-2 py-3.5 font-normal text-muted sm:w-auto sm:px-3" scope="col">
                    Senja
                  </th>
                  <th className="w-1/3 px-2 py-3.5 font-normal text-muted sm:w-auto sm:px-3" scope="col">
                    Testimonial.to
                  </th>
                </tr>
              </thead>
              {COMPARE.map((r) => (
                <tbody key={r.row} className="border-b border-line last:border-0">
                  <tr className="sm:hidden">
                    <th scope="colgroup" colSpan={3} className="px-4 pt-3.5 pb-0 text-left text-[12px] font-normal text-muted">
                      {r.row}
                    </th>
                  </tr>
                  <tr>
                    <th scope="row" className="hidden px-5 py-3.5 text-left font-normal sm:table-cell">
                      {r.row}
                    </th>
                    <td className="px-2 py-3 sm:bg-grouped sm:px-3 sm:py-3.5">
                      <Cell value={r.us} strong />
                    </td>
                    <td className="px-2 py-3 sm:px-3 sm:py-3.5">
                      <Cell value={r.senja} />
                    </td>
                    <td className="px-2 py-3 sm:px-3 sm:py-3.5">
                      <Cell value={r.tto} />
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-3 text-[12px] text-faint">
            From their public pricing pages, October 2026. “Not checked”: not on the page we read; it may be included or cost more.
          </p>
        </section>

        {/* Pricing */}
        <section className={cn(WRAP, "mt-28 sm:mt-36")} aria-labelledby="pricing">
          <h2 id="pricing" className={cn(H2, "scroll-mt-24")}>
            Pricing
          </h2>
          <p className={LEAD}>Every feature in both. You choose who runs the server.</p>
          <div className="mt-8 grid overflow-hidden rounded-[12px] bg-surface ring-1 ring-line sm:grid-cols-2">
            <PricingColumn
              title="Self-host"
              price="Free"
              note="On your own server"
              points={["Every feature, your limits", "Your data in your Postgres", "AGPL-3.0 source code"]}
            >
              <a href={`${GITHUB}#self-host`} className={buttonClass("secondary", "lg", "w-full sm:w-auto")}>
                Self-host guide
              </a>
            </PricingColumn>
            <PricingColumn
              title="Hosted"
              price="$9"
              per="/ month"
              note="or $90 / year"
              points={["Every feature, AI included", "14-day trial, no card", "We run it at lovewall.tech"]}
              className="border-t border-line sm:border-t-0 sm:border-l"
            >
              <Link href="/login" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
                Start free trial <ArrowRight className="size-4" />
              </Link>
            </PricingColumn>
          </div>
        </section>

        {/* Self-host */}
        <section className={cn(WRAP, "mt-28 grid items-center gap-8 sm:mt-36 lg:grid-cols-2 lg:gap-14")} aria-labelledby="selfhost">
          <div>
            <h2 id="selfhost" className={H2}>
              Run it yourself
            </h2>
            <p className={LEAD}>Docker, or Vercel with a Supabase database. Your data stays yours.</p>
            <a href={`${GITHUB}#self-host`} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium hover:underline">
              Self-host guide <ArrowRight className="size-4" />
            </a>
          </div>
          <CodeBlock
            label="Terminal"
            className="bg-surface ring-1 ring-line"
            code={`git clone ${GITHUB}\ncd lovewall && cp .env.example .env\ndocker compose up -d`}
          />
        </section>

        {/* FAQ */}
        <section className={cn(WRAP, "mt-28 grid gap-8 sm:mt-36 lg:grid-cols-[1fr_1.4fr] lg:gap-14")} aria-labelledby="faq">
          <h2 id="faq" className={H2}>
            Questions
          </h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4.5 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="-mt-1 pb-5 text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call */}
        <section className="mt-28 pb-28 text-center sm:mt-40 sm:pb-36">
          <div className="mx-auto max-w-[600px] px-5">
            <h2 className={H2}>Your first testimonial is one link away.</h2>
            <Link href="/login" className={buttonClass("primary", "lg", "mt-8")}>
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark size={18} />
            <span>AGPL-3.0 · Nikhil Dhaliya</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Footer">
            <a href={GITHUB} className="hover:text-ink">
              GitHub
            </a>
            <a href={`${GITHUB}/issues`} className="hover:text-ink">
              Support
            </a>
            <Link href="/guides" className="hover:text-ink">
              Guides
            </Link>
            <Link href="/docs/api" className="hover:text-ink">
              API
            </Link>
            <Link href="/docs/mcp" className="hover:text-ink">
              MCP
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
            <LegalLinks bare />
          </nav>
        </div>
      </footer>
    </div>
  );
}
