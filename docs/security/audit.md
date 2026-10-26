# Security audit

Scope: every route, action and page (table in [routes.md](routes.md)), built bundles and responses, headers and
cookies, cross-space access, SSRF, XSS, redirects, uploads, tokens, webhooks, sign-in, client IPs, the Docker setup,
database connections and dependencies. Tests: `e2e/security.spec.ts` (plus the other suites, named where they cover
a fix). Secret scan: `node scripts/scan-secrets.mjs [baseUrl paths…]` after a build (prints variable names, never
values).

## Fixed

### Critical / high

- **Next.js had 5 critical and 7 high advisories** (RCE in image optimization, `next/og`, `use cache`; SSRF; cache
  poisoning; server-action DoS) plus postcss and sharp. Upgraded to Next 16.4.3: `pnpm audit` is clean.
- **SSRF through IP literals.** Node skips the DNS hook for `http://127.0.0.1`, `http://[::1]`, `http://2130706433`,
  so `safeFetch` fetched private addresses given directly or by a redirect (website-to-form, media copies, API
  avatars). Now every hop checks literals, and the address actually connected to is checked too. IPv4-compatible
  `::/96` and site-local `fec0::/10` added to the blocklist. API keys in headers are dropped on a redirect to another
  host.
- **Open redirect on `/login?next=`**: `/%09/evil.com` passed the check and browsers turn it into `//evil.com`. One
  `safeNext()` now allows only same-site paths of printable characters.
- **Custom-domain takeover.** Verification only checked a CNAME to our shared target, so anyone could claim a domain
  that pointed at us (one being set up, or left pointing here after removal), and an unverified claim blocked the
  real owner forever. Now a per-space TXT record (`_lovewall.<domain>`) is required, unverified claims don't block
  others, and deleting a space or an account also removes its domains from Vercel.
- **Default passwords in the Docker setup.** `docker-compose.yml` gave RustFS the keys `lovewall` / `lovewall-secret`
  and Postgres the password `lovewall` when `.env` left them empty (as `.env.example` did), and published RustFS on
  every interface: anyone who could reach port 9000 could read and write every uploaded file. Compose now refuses to
  start until `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are set (`.env.example` says how to
  generate them), and RustFS listens on 127.0.0.1 unless `STORAGE_BIND` says otherwise.
- **GitHub sign-in could join an existing account without a verified email** (only with GitHub sign-in configured).
  GitHub was listed as a trusted provider for account linking, so Better Auth linked a GitHub sign-in to the account
  with the same email even when GitHub reported that address unverified. No provider is trusted blindly now: a GitHub
  or Google sign-in links only when the provider verified the address, only to an account whose own address was
  proven by a code, and a new account can't start from an unverified address at all (`src/lib/auth-privacy.ts`).

### Medium

- **Owner-only settings an editor could change**: the public link (breaks every shared link and embed), the owner's
  notification emails and the AI switches (they send data to Anthropic and Deepgram). Now owner only, on the server
  and in the UI.
- **API and MCP kept working after a hosted plan ended** (the dashboard was locked). Keys of a locked space get 403.
- **Keys and hooks outlived their member**: API keys a removed or leaving member made, and the webhooks, Slack and
  Discord links they set up, now go with the membership; deleting an account removes them in every space (foreign
  keys cascade, and keys left behind by accounts deleted earlier were removed).
- **Client IP behind a reverse proxy**: with `TRUST_PROXY=1`, a client-sent `X-Real-IP` won over the proxy's
  `X-Forwarded-For` (most proxies pass `X-Real-IP` through untouched), so anyone could pick a fresh rate-limit bucket
  per request; Better Auth read the same forgeable header. Now only the last `X-Forwarded-For` entry counts (the one
  the proxy added), or the one header named in `TRUST_PROXY_HEADER`; never a list of fallbacks. Better Auth reads a
  header Lovewall fills in itself from that source, after removing any copy a client sent.
- **Unauthenticated storage fill.** Anyone could ask the public upload route for 60 MB presigned PUTs (30 per IP per
  10 minutes, 300 per space per hour), and unclaimed files lived 24 hours. Presigns now need the collect page's
  signed stamp (as submissions do), the bytes left unclaimed in the last hour are capped at 300 MB per visitor and
  2 GB per space (more when `MAX_VIDEO_MB` is raised), and unclaimed uploads are deleted after 3 hours.
- **Missing rate limits**: widget actions, inbox actions, report resolving, space updates, slug checks, name changes
  had none; replies had no per-recipient cap (now 3 a day per giver, 100 a day per space); media copies were 400 an
  hour; AI caps were per space only (now also 3000 a day per person); collect pages and the report page had none;
  collect submit and presign did database work before the limit. All added. On top, a per-IP flood gate in the
  proxy covers every dynamic request (`RATE_LIMIT_PER_MINUTE`, default 1200).
- **The flood gate and custom-domain rules could be skipped** by adding a `Purpose: prefetch` or
  `Next-Router-Prefetch` header: the proxy's matcher left such requests out. It runs on them too now.
- **Made-up widget ids filled caches**: each one cached a null payload and rendered a share image for a day. Misses
  are no longer cached; the share image is a 404.
- **Weak secrets**: everything signed with `BETTER_AUTH_SECRET` fell back to a fixed string when it was missing, and
  production only logged a warning. Production now refuses to start with a missing, short (< 32) or example auth
  secret, or a short or example `CRON_SECRET`. Test-only endpoints and `WEBHOOKS_ALLOW_PRIVATE` log a warning.
- **AI translations went public unreviewed**: widgets set to another language and the public widget API showed
  machine translations as soon as they were made. Now a member approves each one first (Approve / Discard in the
  testimonial's edit sheet and the Translate sheet); a translation made before stays hidden until approved, and one
  of an edited testimonial waits again.

### Low

- No CSP on API answers and embed 404s: `/api/*` now sends `default-src 'none'; frame-ancestors 'none'`.
- Upload keys could be attached twice in one space (deleting one removed the other's file): claimed keys are refused.
- Slack/Discord hooks accepted any https URL: now only their own webhook hosts (unless private targets are allowed).
- Custom CSS on wall pages: CSS escapes could slip `@import` past the filter and relative `url()` made visitors call
  the app with cookies. Backslashes are dropped and `url()` allows only `https:` and `data:image/`.
- `isHttpUrl` accepted `javascript:…//@a.b` (not exploitable: every caller prefixed `https://`). Now refused.
- Remote avatars trusted the remote Content-Type: now the file's own bytes decide.
- CSV export left formula-looking multi-choice answers unguarded; `POST /api/v1/testimonials/<id>/constructor` hit
  a prototype key; the account export dropped secrets by an exact-name list (now by pattern); `makeOwner` could
  silently no-op.
- **One shared bucket, silently**: behind a reverse proxy without `TRUST_PROXY`, every visitor shared the proxy's
  rate limits. The server now logs one warning when it sees only private addresses (or no address at all) and
  `TRUST_PROXY` is unset.
- **Trial reset by deleting the account** (hosted service only): the 14-day trial ran from the account's creation,
  so deleting it and signing up again started a new one. On deletion, a SHA-256 of the lowercased email and its
  first sign-up date are kept for a year (`signup_history`, only while billing is on), and the trial runs from the
  earliest date for that address.
- **Database TLS without verification**: `sslmode=require` and any Supabase host connected with
  `rejectUnauthorized: false`. TLS now follows libpq: `verify-full` / `verify-ca` check the certificate (CA from
  `DATABASE_CA_CERT`), `require` only encrypts, no host-based exceptions; `prefer` and `allow` are refused rather
  than reinterpreted (`scripts/db-ssl.mjs`).
- **Custom domains broke three public calls**: the wall page's Report link and "Made with Lovewall" went to `/` and
  `/r/<id>` on the custom domain (its form, and a 404), and the analytics beacon and the form's spelling help were not
  routed there. Both links now use the app's URL, and the domain serves `/api/e` and `/api/collect/<space>/polish`.
- **Forged analytics**: the beacon accepted requests without fetch metadata (curl with a browser's user agent), with
  any `h` hostname. Now only same-origin requests whose Referer is that widget's own embed or wall page count; a wall
  page is counted under the host it was served on. The per-IP, per-widget and 25-sites-a-day caps stay.
- **Invites from hosted trial accounts**: a new trial could send 200 invites a day per space, from as many spaces as
  it made. While the owner is on a hosted trial, invites are capped at 50 people a day across their spaces (paid and
  self-hosted: the per-space limit only). The space's mailing address (anti-spam laws ask for the sender's postal
  address in commercial email) moved to the space's settings, and the invites page says when it is missing.
- Server logs: errors are logged through `logError()` (name, code, stack; emails and keys masked; no database row
  details).
- `lw-space` cookie is `Secure` on https.

## Checked and fine

- **Bundles and responses**: no server env value (19 canary secrets set) in `.next/static`, prerendered HTML/RSC or
  any page/API response; no `process.env.<server var>` in client chunks; every server module that reads secrets
  imports `server-only`.
- **Errors**: actions return a generic message via `guard()`; API and MCP a plain 500; error pages show no details.
- **Cross-space access (IDOR)**: every action, REST and MCP query is scoped by the checked space (tested: pages,
  exports, media routes, REST read/update/delete/shortcuts, MCP, replayed server actions with another space's id).
  Membership is read on every request: a removed member gets 404 at once.
- **CSRF**: replayed server actions with a foreign `Origin` are rejected; Better Auth refuses foreign origins.
- **Tokens**: API keys, team invites, giver links and spin claims are stored as SHA-256; invite unsubscribe links are
  HMACs compared in constant time; OTPs are hashed, 10 minutes, 5 attempts; invites expire after 7 days and work
  once. Polar webhooks are verified by the SDK (constant-time HMAC, 5-minute window, each id once); ours are signed.
- **Sign-in**: no passwords. When someone proves an address with a code and an account with that address exists
  that was never proven, Better Auth first removes the GitHub/Google links and sessions it had.
- **XSS**: the widget renderer escapes every value; JSON-LD escapes `<`, `>`, `&`, U+2028/9; the embed runs under a
  hash-only CSP; configurator previews are sandboxed without `allow-same-origin`; emails escape every value; no
  Markdown or AI HTML is rendered; uploads are JPEG/PNG/WebP/MP4/WebM/MOV only (no SVG), with type and size signed
  into the PUT URL.
- **Cookies**: session cookie `HttpOnly`, `SameSite=Lax`, `Secure` + `__Secure-` prefix on https, cookie cache off
  (revocation is instant); custom domains never receive cookies.

## Accepted or left (and why)

- **Prerendered pages use `script-src 'self' 'unsafe-inline'`** (landing, docs, wall pages): no nonce exists at build
  time. Wall pages render user text only through the escaping renderer.
- **Editors see givers' emails in the inbox**; export is owner-only. Editors are trusted teammates by design.
- **Editors may send invites, set the space's mailing address** used in their footer, approve AI translations,
  delete testimonials and resolve reports (logged in the audit log where personal data is involved). Intended team
  workflow.
- **Members can create "imported" testimonials with any text** (the manual add already allows it); imports keep their
  source link for checking.
- **Read keys may create REST Hooks** (Zapier/Make need it); hooks of read keys never receive emails.
- **`/api/mcp?key=`** stays for MCP clients that can't send headers; the docs warn it can end up in logs and to give
  such a client its own key.
- **Files stay reachable for up to ~2 hours after deletion** through cached presigned URLs (the privacy policy says
  so). File links are capability URLs (16 random characters).
- **The flood gate is per instance** (in memory). Hosted: add a Vercel Firewall rate-limit rule for the same
  ceiling at the edge. Self-hosted single instance: as is.
- **Analytics are statistics, not proof**: a script that copies a browser's headers (fetch metadata, Referer) can
  still add counts within the caps, and an embed's site name comes from the widget's own script. Nothing else
  depends on these numbers.
- **The collect page's signed stamp is public**: anyone can load the page to get one. It ties presigns and
  submissions to a page view; the byte budgets and rate limits are what bound the storage.
- **Webhooks made before their creator was recorded** have no creator, so they stay until an owner removes them.
- **Lint warnings** for `window.location.assign` (full reloads on purpose: sign-out, switching spaces).
