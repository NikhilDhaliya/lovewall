# Lovewall hosted service: personal data inventory

What the hosted service at lovewall.tech collects or stores, read from the code on `main` (10-27, updated 10-27 after the
privacy area closed the 18 gaps below; migration 0070). Each row: where it lives, why,
the lawful basis, who can see it, how long it stays and how it is deleted, and which subprocessor touches it.
Self-hosters: the same table applies to your instance, with your own providers.

Legend: **DB** = Postgres (Supabase); **S3** = private bucket (Supabase Storage or R2); **Vercel** = hosting and
request logs; **Zepto** = ZeptoMail; **Polar** = merchant of record (independent controller). Basis is given for the
GDPR; under the DPDP Act the same rows rest on consent or on a "legitimate use" (security, legal duty).

## 1. Account holders (controller: the operator)

| Data | Where (table.column) | Why | Basis | Who sees it | Retention / deletion | Subprocessor |
| --- | --- | --- | --- | --- | --- | --- |
| Email, name, email-verified flag, avatar URL (from GitHub/Google) | DB `auth_users` | Account, sign-in codes, notices | Contract | The user; team members see name and email of each other | Until account deletion (cascade) | Supabase, Vercel |
| OAuth link: provider, provider account id, scope (no tokens) | DB `auth_accounts` | Optional GitHub/Google sign-in | Contract | Nobody in the UI | Cascade on deletion. Access/refresh/id tokens are nulled before they are written (`databaseHooks.account`) | Supabase, GitHub/Google (independent) |
| Sessions: token, expiry, keyed hash of the IP (`hashIp`), user agent | DB `auth_sessions` | Keep signed in, "sign out everywhere" | Contract | The user, in the account export | 30 days, renewed daily; revoked on sign-out; expired rows deleted by the cron; cascade on deletion | Supabase |
| Sign-in codes (hashed), identifier (email) | DB `auth_verifications` | One-time code sign-in | Contract | Nobody | 10 minutes; cron deletes expired after 1 day | Supabase |
| Auth rate limits (Better Auth) | DB `rate_limits`, key `auth:<hash of ip+path>` (custom limiter storage); `auth_rate_limits` is no longer written | Abuse protection on sign-in | Legitimate interest | Nobody | Window length (≤ 1 h); cron sweeps expired | Supabase |
| Per-address cap on sign-in mails: `otp-mail:<email>` | DB `rate_limits.key` | Stop inbox flooding | Legitimate interest | Nobody | 1 h window; cron sweeps expired | Supabase |
| Spaces: name, slug, logo, website, brand colour, prompt, questions, settings | DB `spaces`, S3 `spaces/<id>/logo/` | The product | Contract | Owner, team; slug and logo are public on collect/wall pages | Deleted with the space or account; files via `storage_trash` | Supabase, S3 |
| Team memberships and team invites (member email, role, SHA-256 of the invite token) | `space_members`, `space_invites` (0010) | Teams | Contract | Space members | Delete with the space; invites expire after 7 days and the cron deletes them | Supabase, Zepto (invite mail) |
| Activity log: actor id and kind (member, giver, api), action, target id, counts | `audit_log` (0070) | Accountability for personal data (DPDP Rules: a year of logs) | Legal obligation | The space owner (settings > Activity); the actor in their account export | 1 year (cron), also after the space or person is deleted (ids only, no FK) | Supabase |
| Billing: Polar customer id, subscription id/status, trial start/end | `subscriptions`, `billing_events` (0011) | Knowing what the account may do | Contract | Owner | Cascade on deletion; the Polar subscription is revoked first (`cancelSubscriptions`); webhook receipts 30 days | Polar (independent: card, invoices, tax, its own logs) |
| Outgoing mail queue: recipient, subject, full HTML/text, reply-to | DB `email_outbox` | Reliable delivery, retries | Contract | Nobody | Sent rows 7 days, any row 30 days (cron); account deletion removes unsent rows to the user and on their behalf (reply-to), then queues one confirmation mail | Supabase, Zepto |
| Mail delivery logs at the provider | ZeptoMail | Delivery reporting | Contract | Operator in Zepto console | Zepto's retention (owner to confirm; set opens/clicks tracking off: already `track_opens:false`) | Zepto |
| API keys: name, scope, prefix, SHA-256 hash, created_by, last_used_at | integrations `api_keys` (0050) | Integrations | Contract | Space owner | Revoking deletes the row at once; cascade on space deletion. Export lists names, never hashes | Supabase |
| Webhooks: URL, events, encrypted secret, kind (webhook/rest/slack/discord) | integrations `webhooks` | Integrations | Contract | Space owner | Cascade | Supabase |
| Webhook deliveries: event payload (a testimonial; the giver's email only for REST hooks made with a write key), status, error, timing | integrations `webhook_deliveries` | Retries and a delivery log | Contract | Space owner | 30 days (cron) | Supabase; the customer's endpoint (customer's processor) |
| Support emails | Mailbox support@/privacy@/legal@ | Answering | Legitimate interest | Operator | Owner decision: 2 years suggested | Mail provider of the mailbox |
| Request logs: IP, URL, headers, timing, function logs (console output, incl. `[mail]` log driver lines in dev) | Vercel | Security, debugging | Legitimate interest | Operator | Vercel's log retention (Hobby: 1 h runtime logs, Pro: 1 day; owner to confirm plan) | Vercel |

## 2. Testimonial givers (controller: the customer; operator = processor; security data: operator)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Subprocessor |
| --- | --- | --- | --- | --- | --- | --- |
| Name, title, company, handle, **email**, website (collect), text, rating, answers (jsonb keyed by question id), tags, featured, status | DB `testimonials` | The testimonial | Consent (form checkbox) | Customer's team; the public when approved (never the email; read-scope API keys and webhooks omit it) | Until the customer deletes it, the space or the account, or the giver deletes it with their private link | Supabase |
| Giver's private link: SHA-256 of a random token, expiry | `giver_links` (0070) | See, edit, delete their own testimonial (`/t/<token>`) | Consent | Nobody (the giver holds the link) | 1 year, or with the testimonial; expired rows deleted by the cron | Supabase |
| Reports: testimonial, reason, details, optional reporter email, resolution, who resolved | `reports` (0070) | "Report" on wall pages and widgets; inbox queue | Legitimate interest | Space members; the owner gets an email | Open until handled; deleted 90 days after; with the testimonial or space | Supabase, Zepto |
| Photo, video, poster, company logo, image testimonial | S3 `spaces/<space>/{avatar,video,poster,logo,image}/`, keys in `uploads` + `testimonials.*_key` | The testimonial | Consent | Public when approved, via `/api/files` (302 cached 30 min) to a signed URL (`max-age=3600`) | Trash queue on delete; unclaimed uploads 24 h. Cached copies up to 2 h after deletion (policy says so) | S3 |
| Video width/height, trim points, transcript and captions (WebVTT) | DB `testimonials`; transcript via Deepgram | Playback, AI features | Consent (same) | Customer; public (transcript if shown) | With the testimonial | Deepgram (audio), Anthropic (text, summaries, translations) |
| Consent record: flag, exact wording shown, version, language, time, page URL (origin + path) | `testimonials.consent*` (0020 + `consent_url` 0070) | Proof of consent | Legal obligation | Customer (edit sheet, exports); the giver on their private page | With the testimonial; in the space and account exports | Supabase |
| Form stamp token (HMAC of space id + time, in the page) | In the HTML form only, not stored | Bot timing check | Legitimate interest | – | Not stored | – |
| Submission rate limits: `submit:ip:<hash>`, `submit:ip-space:<hash>:<space>` | DB `rate_limits` | Abuse protection | Legitimate interest | Nobody | 1 h / 10 min windows, swept by cron. IP is a keyed hash (good) | Supabase |
| Invites: name, email, signed token (not stored), sent/opened/clicked timestamps, reminders sent | collect `invites` (0020) | Sending the invitation the customer asked for | Legitimate interest of the customer (consent where PECR/CASL require it) | Customer | Opened/clicked nulled 90 days after sending (cron); row deleted with the space | Supabase, Zepto |
| Invite unsubscribe list (sha256 of the lower-cased email, space) | collect `invite_suppressions` | Honouring opt-outs | Legal obligation (CAN-SPAM, PECR) | Customer sees "unsubscribed" | Kept until the space is deleted (so the opt-out holds) | Supabase |
| Invitation opens (tracking pixel) and link clicks | collect `/api/invites/open/<token>` | Reminders only to people who did not open | Legitimate interest | Customer | As above. The pixel is sent only while `LEGAL.inviteTracking` is on (owner decision; draft on) | Vercel |
| Reply by email: customer's reply text, Reply-To header with the giver's address | collect `testimonial_replies`, `email_outbox` headers | Thanking the giver | Contract with the customer | Customer | With the testimonial | Zepto |
| Rewards: code, claim (giver email + time) | collect `reward_codes`, `reward_claims` | Delivering the promised reward | Contract with the customer | Customer | With the space | Supabase |
| NPS score + comment | collect `nps_responses` | Customer's survey | Consent | Customer | With the space | Supabase |
| Collect-page views (counts per form per day; no IP, no user agent) | collect `form_views` | Form statistics | Legitimate interest | Customer | 400 days (cron) | Supabase |
| Receipt email to the giver (when they gave an email) | `email_outbox` | Giver's own copy with the private link and the privacy link | Consent | Giver | Outbox retention | Zepto |

## 3. Authors of imported reviews and mentions (controller: the customer)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Subprocessor |
| --- | --- | --- | --- | --- | --- | --- |
| Public name, handle, avatar (copied into S3), text, rating, date, source URL | DB `testimonials` (source X, Google, Trustpilot, G2, Capterra, PH, App/Play Store, Reddit, YouTube, HN, LinkedIn paste, CSV, screenshot image) | Republishing a public review | Customer's legitimate interest; customer attests the right (AUP) | Customer; public when approved | With the testimonial. Author can ask for removal (gap 2 covers them too) | Supabase, S3; source sites (fetched server-side via safe-fetch) |
| Auto-sync state: source URL/place id, last sync time | import tables (0030-0039) | Keeping imports fresh | Contract | Customer | With the space | Supabase; the source site |
| Mentions (Reddit, HN): author, text, URL | import tables | Monitoring | Customer's legitimate interest | Customer | Proposal: 90 days unless saved as a testimonial (import helper to confirm) | Supabase; Reddit/HN APIs |
| Screenshots of reviews (image testimonials) | S3 `image/` | Review cards | As above | Public when approved | With the testimonial | S3 |

## 4. Visitors of public pages and widgets (controller: the operator for security; the customer for its pages)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Subprocessor |
| --- | --- | --- | --- | --- | --- | --- |
| Widget stats: views, clicks, plays per widget per day per **hostname** | show `widget_stats` (0040) via beacon `/api/e` | Analytics for the customer | Legitimate interest | Customer | 400 days (cron). No cookies, no IP stored | Supabase, Vercel |
| Beacon rate-limit key (hashed IP) | `rate_limits` | Abuse | Legitimate interest | – | 1 h | Supabase |
| Request logs (IP, URL, referrer = the embedding site) | Vercel | Security | Legitimate interest | Operator | Vercel retention | Vercel |
| Cookies | None on public pages, embeds or widgets | – | – | – | – | – |
| Theme preference | Browser localStorage only | – | – | – | Never leaves the browser | – |

## 5. Mail footers, senders and identity

| Mail | From | Reply-To | Footer today | Required |
| --- | --- | --- | --- | --- |
| Sign-in code | `MAIL_FROM` (Lovewall) | – | "Lovewall · free and open source" | Transactional: fine |
| New-testimonial alert to owner | Lovewall | – | same | Transactional: fine |
| Invitation / reminder (collect) | `<space>` (`from_name`), address MAIL_FROM | the customer | "Sent by `<space>` via Lovewall", unsubscribe `/i/<token>` (works after the invite expires, as long as the row exists), RFC 8058 one-click, the space's business address or else `LEGAL.postalAddress` | Commercial under CAN-SPAM: met once a postal address is set (owner decision) |
| Receipt to giver | `<space>` | – | "Sent by `<space>` via Lovewall" · Privacy | Transactional; private manage link |
| Report to the space owner | Lovewall | – | same as alerts | Transactional |
| Account deleted | Lovewall | privacy@ (hosted) | – | Transactional |
| Team invite (accounts) | Lovewall | inviter | – | Transactional |

## The 18 gaps, closed (privacy area, 10-27)

1. **Hashed IPs.** Sessions store `hashIp(ip)` (`databaseHooks.session`), Better Auth's limiter counts in `rate_limits`
   under `auth:<hash>` (`rateLimit.customStorage`); migration 0070 nulled old raw IPs and emptied `auth_rate_limits`.
2. **Giver self-service.** Receipt email with a private link (`giver_links`, random token, SHA-256 stored, 1 year) to
   `/t/<token>`: view, edit (a published one goes back to review), delete; in the form's language. "Report" link under
   widgets and on wall pages to `/r/<widget>`; reports land in an inbox queue (Hide, Delete, Dismiss) and email the owner.
3. **Account export.** Account settings > Export data: `/api/account/export`, one JSON file with the account, sign-in
   methods, sessions (hashed IPs), subscriptions, every owned space with every table that has a `space_id` (found from
   the schema), memberships, own activity, and a file manifest with 24 h download links. Hashes and secrets are omitted.
4. **Complete deletion.** Polar revoke first, sessions, spaces (cascade), files (trash), unsent mail to the user and on
   their behalf, then a confirmation email. `storage_trash` is emptied by the cron when no storage is configured.
5. **Consent records.** Wording, version, language, time (0020) plus the page URL (`consent_url`, 0070), shown in the
   edit sheet, on the giver's page, in both exports.
6. **Invite tracking.** Opens/clicks nulled after 90 days (cron); suppressions are already `sha256(lower(email))`;
   invites cascade with the space.
7. **OAuth tokens.** Nulled before every write (`databaseHooks.account`); 0070 nulled existing ones.
8. **Analytics retention.** `widget_stats` and `form_views`: 400 days (cron). `form_views` has no IP or user agent.
9. **Invite footers.** Sender identity, one-click and page unsubscribe (works after expiry), the space's business
   address or the operator's (`LEGAL.postalAddress`, owner decision). The open pixel follows `LEGAL.inviteTracking`.
10. **Integration logs.** Deliveries 30 days (cron); revoked keys are deleted at once.
11. **Emails in API and webhooks.** Read keys, plain webhooks, Slack and Discord never get the giver's email; REST hooks
    of write keys do. The privacy policy and DPA say so, and that the customer's endpoint is the customer's processor.
12. **Caches.** Signed file URLs `max-age=3600` (was 86400 immutable); the policy says "up to 2 hours".
13. **Log mail.** `src/instrumentation.ts` stops the server in production when `MAIL_DRIVER=log` is set, or when the
    hosted service (billing on, or APP_URL on the legal domain) would fall back to it; a self-hosted first run only warns.
14. **Consent line.** The collect form shows a "Privacy" link (22 languages) next to the consent text, which states the
    purpose (sharing publicly, with name and photo).
15. **Children.** The login page says "By continuing you confirm you are 16 or older and agree to the Terms and Privacy
    Policy" on the hosted service.
16. **Backups.** `LEGAL.retention.backupDays` (7, Supabase Pro daily backups; owner confirms the plan) must stay at or
    below `deletedAccountDays` (30); a unit test checks.
17. **Breach runbook.** `docs/legal/incident-runbook.md`.
18. **Team roles.** Owner only: space export, API keys, webhooks and chat integrations, custom domains, members, billing,
    deleting the space. Editors' (and givers' and API keys') exports, edits, deletions, replies, invites, report
    decisions and member changes go to `audit_log` (ids only, 1 year), shown to the owner in settings > Activity.
    Editors can still delete single testimonials (inbox work); it is logged.

Open owner decisions (config values in `src/lib/legal/config.ts`, drafts in place): refund window (14 days), courts
city, postal address, EU/UK representative, invite open/click tracking (on).
