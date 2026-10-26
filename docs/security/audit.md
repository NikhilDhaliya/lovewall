# Security audit (10-27)

Scope: every route, action and page (table in [routes.md](routes.md)), built bundles and responses, headers and
cookies, cross-space access, SSRF, XSS, redirects, uploads, tokens, webhooks, dependencies. Tests:
`e2e/security.spec.ts` (plus the existing suites). Secret scan: `node scripts/scan-secrets.mjs [baseUrl paths…]`
after a build (prints variable names, never values).

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

### Medium

- **Owner-only settings an editor could change**: the public link (breaks every shared link and embed), the owner's
  notification emails and the AI switches (they send data to Anthropic and Deepgram). Now owner only, on the server
  and in the UI.
- **API and MCP kept working after a hosted plan ended** (the dashboard was locked). Keys of a locked space get 403.
- **Keys outlived their member**: API keys made by a removed (or leaving) member now die with the membership.
- **Missing rate limits**: widget actions, inbox actions, report resolving, space updates, slug checks, name changes
  had none; replies had no per-recipient cap (now 3 a day per giver, 100 a day per space); media copies were 400 an
  hour; AI caps were per space only (now also 3000 a day per person); collect pages and the report page had none;
  collect submit and presign did database work before the limit. All added. On top, a per-IP flood gate in the
  proxy covers every dynamic request (`RATE_LIMIT_PER_MINUTE`, default 1200).
- **Made-up widget ids filled caches**: each one cached a null payload and rendered a share image for a day. Misses
  are no longer cached; the share image is a 404.
- **Weak secrets**: everything signed with `BETTER_AUTH_SECRET` fell back to a fixed string when it was missing, and
  production only logged a warning. Production now refuses to start with a missing, short (< 32) or example auth
  secret, or a short or example `CRON_SECRET`. Test-only endpoints and `WEBHOOKS_ALLOW_PRIVATE` log a warning.

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
  silently no-op; `X-Forwarded-For` used the client-supplied first entry behind a proxy (now the last).
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
- **Editors may send invites and set the postal address** used in their footer, delete testimonials and resolve
  reports (logged in the audit log). Intended team workflow.
- **Members can create "imported" testimonials with any text** (the manual add already allows it); imports keep their
  source link for checking.
- **Read keys may create REST Hooks** (Zapier/Make need it); hooks of read keys never receive emails.
- **`/api/mcp?key=`** stays for MCP clients that can't send headers; the docs warn it can end up in logs and to give such a client its own key.
- **Files stay reachable for up to ~2 hours after deletion** through cached presigned URLs (the privacy policy says
  so). File links are capability URLs (16 random characters).
- **The flood gate is per instance** (in memory). Hosted: add a Vercel Firewall rate-limit rule for the same
  ceiling at the edge. Self-hosted single instance: as is.
- **Lint warnings** for `window.location.assign` (full reloads on purpose: sign-out, switching spaces).
