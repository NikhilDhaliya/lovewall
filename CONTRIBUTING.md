# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome: open an
[issue](https://github.com/NikhilDhaliya/lovewall/issues) first for anything big.

## Set up

```bash
pnpm install
cp .env.example .env.local      # point DATABASE_URL at a Postgres, set BETTER_AUTH_SECRET
pnpm db:migrate
pnpm storage:setup              # optional: creates the S3 bucket for photos and videos
pnpm dev
```

With no mail provider set, sign-in codes are printed in the terminal.

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build:e2e && pnpm test:e2e # Playwright, headless, against `next start` on port 3111
```

The end-to-end tests expect Postgres, an S3-compatible store and [Mailpit](https://mailpit.axllent.org) (SMTP on
1025, API on 8025) running locally; see `playwright.config.ts`. `build:e2e` bakes the test URL and the legal pages
into the static pages; `E2E_PORT` and `E2E_SITE_PORT` move the test servers.

## Guidelines

- Keep the UI quiet: short labels, no helper paragraphs, monochrome app (brand colour only in widgets).
- Every input is validated with zod on the server, and every query checks ownership.
- Database changes are new files in `db/migrations/` (never edit an applied one) and must be idempotent.
- Widget HTML is built in `src/lib/widget/render.ts`: escape every value with `esc()`.

By contributing you agree that your work is released under the AGPL-3.0 license (see [LICENSE](LICENSE)).
