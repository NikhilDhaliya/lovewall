# Routes: who may call what

Every page, route handler and server action, with its access check, rate limit and input validation (audit of
10-27). Keep this table current when a route is added.

How to read it:

- **Auth**: `public`, `session` (Better Auth cookie), `key` (API key, `Authorization: Bearer lw_…`), `token` (a
  link token), `secret` (a shared secret header).
- **Role**: `member` = `getOwnedSpace` (owner or editor of the space, plan not ended); `owner` = plus
  `requireRole(space, "owner")`; `self` = the signed-in account only.
- **Limits** are Postgres counters (`src/lib/rate-limit.ts`): `key max/window`. `ip` = keyed hash of the client IP
  (`src/lib/ip.ts`), `user` = account id, `space` = space id. Windows in seconds.
- **Every dynamic request** (pages, API, embeds, files) also passes the proxy's per-IP flood gate: 1200 per minute
  per server instance (`RATE_LIMIT_PER_MINUTE`, `src/lib/flood.ts`). Only static assets (`/_next/static`) skip it.
- **Every signed-in server action** in the testimonials, widgets, integrations and reports files also counts against
  `actions:user 3000/3600` (`limitUser` in `src/lib/actions.ts`); the others have their own limits below.
- **Headers**: CSP on every HTML page (nonce + `strict-dynamic` on dynamic pages, `'self' 'unsafe-inline'` on the
  prerendered ones), `default-src 'none'` on every `/api/*` answer, `frame-ancestors 'none'` + `X-Frame-Options: DENY`
  everywhere except `/embed/*`. HSTS, nosniff, `Referrer-Policy`, `Permissions-Policy`, COOP on all responses.
- **CSRF**: server actions are POSTs that Next.js only runs when `Origin` matches the host; Better Auth checks
  `Origin` against `APP_URL`; the session cookie is `SameSite=Lax`, `HttpOnly`, `Secure` with the `__Secure-` prefix
  on https. Public POST routes need no cookie.
- **CORS**: `Access-Control-Allow-Origin: *` only on public data (`/embed.js`, `/api/files/*`, `/api/captions/*`,
  `/api/v1/openapi.json`, the unkeyed `/api/v1/widgets/<id>`). Never with credentials.

## Pages

| Path | Auth | Role | Limit | Validation | Notes |
|---|---|---|---|---|---|
| `/` landing, `/docs/*`, `/guides/*`, `/legal/*` | public | – | flood gate | – | prerendered, no user content |
| `/login` | public | – | Better Auth (below) | `next` through `safeNext` (same-site path, printable ASCII, no `\`) | signed-in visitors are redirected to `next` |
| `/app` (+ layout) | session | self | – | `lw-space` cookie checked against the user's spaces | proxy redirects to `/login` without a cookie; the page checks the session for real |
| `/app/new`, `/app/settings` | session | self | – | – | |
| `/app/<space>` inbox, `/collect`, `/collect/<form>`, `/collect/<form>/results`, `/collect/invites`, `/mentions`, `/widgets`, `/widgets/<id>` | session | member (`loadSpace`) | – | ids by regex; every query scoped by `space.id` | locked plan shows the plan lock; a removed member gets 404 at once (membership read every request) |
| `/app/<space>/settings` | session | member; AI, integrations, domain, activity sections owner only | – | – | editors see slug read-only, no notification switch |
| `/<slug>`, `/<slug>/<form>` collect pages | public | – | `page:collect:ip 300/600` | slug regex | `noindex`; view counter `3/3600` per ip and form |
| `/w/<id>` wall page (+ `opengraph-image`) | public | – | flood gate; ISR cache | id regex | unknown ids are 404 and never cached (no share image either) |
| `/r/<widget>` report form | public | – | `page:report:ip 60/600` | id regex | approved testimonials only |
| `/t/<token>` giver's own testimonial | token | that testimonial | `giver-page:ip 60/600` | 24-char token regex | token stored as SHA-256, expires (`GIVER_LINK_DAYS`) |
| `/i/<token>` invite unsubscribe page | token | – | `invite-unsub-page:ip 60/600` | HMAC token, constant-time compare | a button, not a GET, so link scanners can't unsubscribe |
| `/invite/<token>` team invite | token (+ session to join) | invited address only | `invite-view:ip 60/600` | 43-char token regex | 256-bit token stored as SHA-256, 7 days, single use |

## API routes

| Route | Methods | Auth | Role | Limit | Validation | Notes |
|---|---|---|---|---|---|---|
| `/api/auth/*` (Better Auth) | GET, POST | public / session | – | default `100/60` per ip and path; `send-verification-otp 3/60`; `sign-in/email-otp 6/60`; `otp-mail:<email> 6/3600` | Better Auth | 6-digit code, hashed, 10 min, 5 attempts; OAuth (GitHub/Google, only when configured) with a signed state, callback `<APP_URL>/api/auth/callback/<provider>`; no passwords; `Origin` must be `APP_URL` |
| `/api/collect/<space>` submit | POST | public | – | `submit:ip-space 4/600`, `submit:ip 12/3600`, `submit:space MAX_SUBMISSIONS…/86400` (before any database work) | zod, 64 KB, signed form stamp (min 2.5 s, max 1 day), honeypot, upload keys verified and unclaimed | |
| `/api/collect/<space>/upload` presign | POST | public | – | `upload:ip 30/600`, `upload:space 300/3600` | kind enum, type allowlist (no SVG), size cap per kind | PUT URL signs type and length; unclaimed uploads deleted after 24 h |
| `/api/collect/<space>/polish` | POST | public | – | `polish:ip 8/600`, `polish:ip-day 30/86400`, `polish:space 120/3600` + space AI cap | zod, 16 KB, form stamp | only when the space turned grammar on |
| `/api/collect/<space>/spin` | POST | public | – | `spin:ip 20/600` | claim token regex | prize picked server-side, once |
| `/api/e` analytics beacon | POST | public | – | `hit:ip 300/3600`, `hit:widget 20000/3600`, per ip+widget | zod, 1 KB, same-origin only | bots ignored |
| `/api/captions/<id>` | GET | public | – | `captions:ip 600/600` | id regex | spam has no captions |
| `/api/files/<key>` | GET | public | – | flood gate | strict key regex, claimed uploads only | 302 to a presigned GET (2 h, hourly) |
| `/api/invites/open/<token>` | GET | public | – | `invite-open:ip 120/600` | token | always the pixel |
| `/api/invites/unsubscribe/<token>` | POST | token | – | `invite-unsub:ip 30/600` | HMAC token | RFC 8058 one-click |
| `/api/spaces/<space>/export` | GET | session | owner | `export:user 30/3600` | zod query, 20,000 rows | `no-store`, audited, CSV formula guard |
| `/api/spaces/<space>/testimonials/<id>/image` | GET | session | member | `social-image:user 240/600` | id regex, zod | scoped by space |
| `/api/spaces/<space>/testimonials/<id>/video` | GET | session | member | `video-download:user 120/3600` | id regex | scoped by space |
| `/api/account/export` | GET | session | self | `account-export:user 5/3600` | – | owned spaces only; secret-looking columns removed by name |
| `/api/billing/webhook` (Polar in) | POST | signature | – | `polar-webhook:ip 600/60` | Standard Webhooks HMAC (constant time, 5-min window), 512 KB, `webhook-id` once | 404 when billing is off |
| `/api/billing/return` | GET | session | self | `billing-sync:user 10/600` | – | redirects only to `APP_URL` |
| `/api/cron/maintenance` | GET | secret | – | flood gate | `Bearer CRON_SECRET`, constant time | production refuses a short or example secret |
| `/api/health` | GET | public | – | flood gate | – | `{ ok }` only |
| `/api/v1/*` REST | GET, POST, PATCH, DELETE | key | read / write scope; space of the key | `api:key 120/60`; failed keys `api-auth-fail:ip 20/600`; create `api-create:space` per day | zod, 64 KB JSON | every query scoped by the key's space; keys of a locked space get 403; keys die with the member who made them |
| `/api/v1/widgets/<id>` | GET, OPTIONS | public, or key | – | flood gate; cached payload | id regex | public JSON (CORS `*`), approved testimonials only |
| `/api/v1/hooks`, `/api/v1/hooks/<id>` | POST, DELETE | key (read is enough) | key's space | as REST | `checkTarget` (https, public host) | REST Hooks for Zapier/Make; emails only for write keys |
| `/api/v1/openapi.json` | GET | public | – | static | – | |
| `/api/mcp` | GET, POST, DELETE | key (header, or `?key=`) | write tools only for write keys | as REST | zod per tool | prefer the header: a key in a URL lands in proxy logs |
| `/embed/<id>` | GET | public | – | flood gate; ISR cache | id regex | frameable anywhere; own CSP (`default-src 'none'`, script by hash) |
| `/embed.js` | GET | public | – | static | – | CORS `*`, origin-checked `postMessage` |

Outgoing: webhooks (signed `webhook-signature`, AES-GCM-encrypted secrets at rest, `safeFetch` per delivery, POSTs never
follow redirects), Slack and Discord (only `hooks.slack.com` / `discord.com` webhook URLs unless
`WEBHOOKS_ALLOW_PRIVATE`), mail through the outbox.

## Server actions

All take the session (`actionUser`), return `{ ok, error }` through `guard()` (no internals leak) and validate with
zod or id regexes. Ids from the browser are always queried together with the checked space id.

| File | Actions | Role | Limits |
|---|---|---|---|
| `account.ts` | `updateName`, `deleteAccount` | self | `account-name:user 60/3600`; `account-delete:user 5/3600` |
| `billing.ts` | `startCheckout`, `openBillingPortal` | self | `checkout:user 10/600`; `billing-portal:user 20/600` |
| `spaces.ts` | `createSpace` | self | `space-create:user 20/3600`, `MAX_SPACES_PER_USER` |
| | `updateSpace` | member; slug and notify owner only | `space-update:user 600/3600` |
| | `checkSlug` | member | `slug-check:user 300/3600` |
| | `deleteSpace` | owner | `space-delete:user 20/3600` |
| | `presignUpload` | member | `owner-upload:user 120/3600` |
| `testimonials.ts` | `listTestimonials`, `setStatus`, `setFeatured`, `changeTags`, `deleteTestimonials`, `updateTestimonial` | member | `actions:user 3000/3600`; ≤ 500 ids a call |
| | `addTestimonial`, `importFromX`, `importCsv` | member | `manual-add:user 300/3600`; `x-import:user 60/3600`; `csv-import:user 20/3600` + `csv-import-space 30/3600`, ≤ 1000 rows |
| `widgets.ts` | `createWidget`, `updateWidget`, `deleteWidget`, `duplicateWidget` | member | `actions:user 3000/3600`; `MAX_WIDGETS_PER_SPACE` |
| `forms.ts` | `createForm`, `updateForm`, `deleteForm`, `addRewardCodes`, `clearRewardCodes` | member | `forms:<action>:user` 30–1200/3600; 50 forms |
| `invites.ts` | `sendInviteBatch`, `saveBusinessAddress` | member | `invites:send:user 30/3600` + `MAX_INVITES_PER_SPACE_PER_DAY`; `invites:address:user 60/3600` |
| `members.ts` | `inviteMember`, `resendInvite`, `revokeInvite`, `makeOwner`, `removeMember` | owner | `invite:user 20/3600`, `invite-space 50/86400`; `members:user 60/3600` |
| | `leaveSpace` | member (also when locked) | `members:user 60/3600` |
| | `acceptInvite` | invited address | `invite-accept:user 20/3600` |
| `domains.ts` | `saveDomain`, `checkDomain`, `removeDomain` | owner | `domains:<action>:user` 20–60/3600 |
| `integrations.ts` | API keys, webhooks, deliveries, Slack/Discord | owner | `actions:user 3000/3600`; create key `30/3600`; webhook `30/3600`; test `30/600` per space; retry `60/600` per space; chat `30/3600` |
| `ai.ts` | settings | owner | `ai:settings:user 240/3600` |
| | summaries, translations, transcripts, image reading, case studies, forms from a website | member | `ai:<action>:user` 10–600/3600, `ai:day:user 3000/86400`, space AI caps (`AI_MAX_CALLS_PER_SPACE_PER_DAY`) |
| `import.ts` | find, import, sources, sync, screenshots, media copies | member | `import-*:user` and `:space` per action; media `200/3600` per user and space, `600/86400` per space |
| `mentions.ts` | settings, list, check, status, save | member | `mentions-*:user` 30–600/3600, `mentions-check:space 12/3600` |
| `replies.ts` | `replyToTestimonial` | member | `reply:user 30/3600`, `reply-to:testimonial 3/86400`, `reply-space 100/86400` |
| `reports.ts` | `submitReport` | public | `report:ip 5/3600`, `report:space 50/86400`, honeypot |
| | `resolveReport` | member | `actions:user 3000/3600` |
| `giver.ts` | `updateMyTestimonial`, `deleteMyTestimonial` | token | `giver:token 30/3600`, `giver:ip 60/3600` |
