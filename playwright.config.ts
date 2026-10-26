import { defineConfig } from "@playwright/test";
import { POLAR_TEST } from "./e2e/mocks/accounts.mjs";

// End-to-end tests against the production build (`next start` on 3111), headless Chrome only.
// A tiny helper server on 3101 plays "another website" (for the embed test) and, with E2E_MOCK_X=1, mocks X.
// E2E_PORT and E2E_SITE_PORT move both, so several checkouts can run their tests at once.
const PORT = Number(process.env.E2E_PORT) || 3111;
const SITE_PORT = Number(process.env.E2E_SITE_PORT) || 3101;
// A second server from the same build with hosted billing on (Polar mocked by the site server). The rest of the
// suite runs self-hosted (no billing). E2E_BILLING_PORT moves it.
const BILLING_PORT = Number(process.env.E2E_BILLING_PORT) || PORT + 1;
// A third server from the same build with AI on (Claude and Deepgram mocked by the site server: e2e/mocks/ai.mjs).
// The others have no AI keys, so they also cover "no AI anywhere". E2E_AI_PORT moves it.
const AI_PORT = Number(process.env.E2E_AI_PORT) || PORT + 2;
const mockX = process.env.E2E_MOCK_X === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "node e2e/site-server.mjs",
      port: SITE_PORT,
      reuseExistingServer: false,
      env: { E2E_SITE_PORT: String(SITE_PORT), E2E_APP_URL: `http://localhost:${PORT}` },
    },
    {
      command: `pnpm exec next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_URL: `http://localhost:${PORT}`,
        // Each test visitor sends its own X-Real-IP, as a reverse proxy that overwrites that header would.
        TRUST_PROXY: "1",
        TRUST_PROXY_HEADER: "x-real-ip",
        // The legal pages are part of the suite (they only show on the hosted service or with this flag).
        LEGAL_PAGES: "true",
        // Webhooks, Slack, Discord and Zapier hooks are delivered to the mock site on 127.0.0.1.
        WEBHOOKS_ALLOW_PRIVATE: "1",
        // Collect: custom-domain DNS checks and the Vercel API go to the mock site; the cron can be called.
        DNS_OVER_HTTPS_URL: `http://127.0.0.1:${SITE_PORT}/dns-query`,
        VERCEL_API_URL: `http://127.0.0.1:${SITE_PORT}/vercel`,
        VERCEL_TOKEN: "e2e-vercel-token",
        VERCEL_PROJECT_ID: "prj_e2e",
        // Imports, mentions and media copies always go to the mock (e2e/mocks/import.mjs), never the real sites.
        IMPORT_TEST_ENDPOINT: `http://127.0.0.1:${SITE_PORT}/import`,
        CRON_SECRET: "e2e-cron-secret",
        ...(mockX
          ? {
              X_OEMBED_ENDPOINT: `http://127.0.0.1:${SITE_PORT}/oembed`,
            }
          : {}),
      },
    },
    {
      command: `pnpm exec next start -p ${BILLING_PORT}`,
      port: BILLING_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_URL: `http://localhost:${BILLING_PORT}`,
        TRUST_PROXY: "1",
        TRUST_PROXY_HEADER: "x-real-ip",
        POLAR_ACCESS_TOKEN: POLAR_TEST.token,
        POLAR_WEBHOOK_SECRET: POLAR_TEST.webhookSecret,
        POLAR_SERVER: "sandbox",
        POLAR_PRODUCT_MONTHLY: POLAR_TEST.monthly,
        POLAR_PRODUCT_YEARLY: POLAR_TEST.yearly,
        POLAR_API_URL: `http://127.0.0.1:${SITE_PORT}/polar`,
      },
    },
    {
      command: `pnpm exec next start -p ${AI_PORT}`,
      port: AI_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_URL: `http://localhost:${AI_PORT}`,
        TRUST_PROXY: "1",
        TRUST_PROXY_HEADER: "x-real-ip",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${SITE_PORT}/anthropic`,
        DEEPGRAM_API_KEY: "test-deepgram-key",
        DEEPGRAM_API_URL: `http://127.0.0.1:${SITE_PORT}/deepgram`,
        // The website a form is drafted from is the mock too.
        IMPORT_TEST_ENDPOINT: `http://127.0.0.1:${SITE_PORT}/import`,
        CRON_SECRET: "e2e-cron-secret",
        AI_MAX_CALLS_PER_SPACE_PER_DAY: "60",
      },
    },
  ],
});
