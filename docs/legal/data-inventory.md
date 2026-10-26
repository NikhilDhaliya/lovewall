# Personal data inventory

What a Lovewall instance collects or stores, read from the code. Each row: where it lives, why, the lawful basis,
who can see it, how long it stays and how it is deleted, and which provider touches it. The retention periods are
the ones in `src/lib/legal/config.ts` (`LEGAL.retention`); the cleanup jobs in `src/lib/jobs/` apply them. Written for
the hosted service's providers (Supabase, Vercel, ZeptoMail, Polar); a self-hosted instance has the same rows with
its own providers.

Legend: **DB** = Postgres; **S3** = the private file bucket; **Host** = the hosting provider's request logs;
**Mail** = the email provider; **Polar** = merchant of record (an independent controller). Basis is given for the
GDPR; under India's DPDP Act the same rows rest on consent or on a "legitimate use" (security, legal duty).

## 1. Account holders (controller: the operator)

| Data | Where (table.column) | Why | Basis | Who sees it | Retention / deletion | Provider |
| --- | --- | --- | --- | --- | --- | --- |
| Email, name, email-verified flag, avatar URL (from GitHub/Google) | DB `auth_users` | Account, sign-in codes, notices | Contract | The user; team members see each other's name and email | Until account deletion (cascade) | DB, Host |
| OAuth link: provider, provider account id, scope (no tokens) | DB `auth_accounts` | Optional GitHub/Google sign-in | Contract | Nobody in the UI | Cascade on deletion. Access, refresh and id tokens are nulled before they are written (`databaseHooks.account`) | DB; GitHub/Google (independent) |
| Sessions: token, expiry, keyed hash of the IP (`hashIp`), user agent | DB `auth_sessions` | Keep signed in, "sign out everywhere" | Contract | The user, in the account export | 30 days, renewed daily; revoked on sign-out; expired rows deleted by the cron; cascade on deletion | DB |
| Sign-in codes (hashed), identifier (email) | DB `auth_verifications` | One-time code sign-in | Contract | Nobody | 10 minutes; the cron deletes expired rows after 1 day | DB |
| Auth rate limits | DB `rate_limits`, key `auth:<hash of ip+path>` | Abuse protection on sign-in | Legitimate interest | Nobody | Window length (at most 1 h); the cron sweeps expired rows | DB |
| Per-address cap on sign-in mails: `otp-mail:<email>` | DB `rate_limits.key` | Stop inbox flooding | Legitimate interest | Nobody | 1 h window; swept by the cron | DB |
| Spaces: name, slug, logo, website, brand colour, prompt, questions, settings | DB `spaces`, S3 `spaces/<id>/logo/` | The product | Contract | Owner, team; slug and logo are public on collect and wall pages | Deleted with the space or account; files through `storage_trash` | DB, S3 |
| Team memberships and team invites (member email, role, SHA-256 of the invite token) | DB `space_members`, `space_invites` | Teams | Contract | Space members | Deleted with the space; invites expire after 7 days and the cron deletes them | DB, Mail (invite mail) |
| Activity log: actor id and kind (member, giver, API key), action, target id, counts | DB `audit_log` | Accountability for personal data (the DPDP Rules ask for a year of logs) | Legal obligation | The space owner (Settings, Activity); the actor in their account export | 1 year (cron), also after the space or person is deleted (ids only, no foreign keys) | DB |
| Billing: Polar customer id, subscription id and status, trial start and end | DB `subscriptions`, `billing_events` | Knowing what the account may do | Contract | Owner | Cascade on deletion; the Polar subscription is revoked first (`cancelSubscriptions`); webhook receipts 30 days | Polar (independent: card, invoices, tax, its own logs) |
| After an account is deleted (only when billing is on): SHA-256 of its lower-cased email and the date it first signed up | DB `signup_history` | So a deleted account cannot start a new free trial | Legitimate interest | Nobody | `LEGAL.retention.signupHistoryDays` (365 days), pruned by the cron; nothing else about the account survives deletion | DB |
| Outgoing mail queue: recipient, subject, full HTML and text, reply-to | DB `email_outbox` | Reliable delivery, retries | Contract | Nobody | Sent rows 7 days, any row 30 days (cron); account deletion removes unsent rows to the user and on their behalf (reply-to), then queues one confirmation mail | DB, Mail |
| Mail delivery logs at the provider | Mail | Delivery reporting | Contract | Operator, in the provider's console | The provider's retention; open and click tracking is off (`track_opens: false`) | Mail |
| API keys: name, scope, prefix, SHA-256 hash, created_by, last_used_at | DB `api_keys` | Integrations | Contract | Space owner | Revoking deletes the row at once; also deleted when the member who made it leaves, is removed or deletes their account (webhooks too); cascade on space deletion. Exports list names, never hashes | DB |
| Webhooks: URL, events, encrypted secret, kind (webhook, REST hook, Slack, Discord) | DB `webhooks` | Integrations | Contract | Space owner | Cascade | DB |
| Webhook deliveries: event payload (a testimonial; the giver's email only for REST hooks made with a write key), status, error, timing | DB `webhook_deliveries` | Retries and a delivery log | Contract | Space owner | 30 days (cron) | DB; the customer's endpoint (the customer's processor) |
| Support emails | The operator's mailboxes | Answering | Legitimate interest | Operator | 2 years | The mailbox provider |
| Request logs: IP, URL, headers, timing, function logs | Host | Security, debugging | Legitimate interest | Operator | The host's retention (Vercel Hobby: 1 h of runtime logs, Pro: 1 day) | Host |

## 2. Testimonial givers (controller: the customer; the operator is the processor; security data: the operator)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Provider |
| --- | --- | --- | --- | --- | --- | --- |
| Name, title, company, handle, **email**, website, text, rating, answers (keyed by question id), tags, featured, status | DB `testimonials` | The testimonial | Consent (form checkbox) | The customer's team; the public when approved (never the email; read-scope API keys and webhooks omit it) | Until the customer deletes it, the space or the account, or the giver deletes it with their private link | DB |
| Whether the giver claimed a reward (`testimonials.rewarded`) | DB `testimonials` | The testimonial discloses the reward wherever it is shown (FTC endorsement rules) | Legal obligation | The public, with the testimonial | With the testimonial; nobody can unset it | DB |
| Giver's private link: SHA-256 of a random token, expiry | DB `giver_links` | See, edit or delete their own testimonial (`/t/<token>`) | Consent | Nobody (the giver holds the link) | 1 year, or with the testimonial; expired rows deleted by the cron | DB |
| Reports: testimonial, reason, details, optional reporter email, resolution, who resolved | DB `reports` | "Report" on wall pages and widgets; the inbox queue | Legitimate interest | Space members; the owner gets an email | Open until handled; deleted 90 days after; with the testimonial or space | DB, Mail |
| Photo, video, poster, company logo, image testimonial | S3 `spaces/<space>/{avatar,video,poster,logo,image}/`, keys in `uploads` and `testimonials.*_key` | The testimonial | Consent | Public when approved, through `/api/files` (302, cached 30 min) to a signed URL (`max-age=3600`) | Trash queue on delete; unclaimed uploads after 24 h. Cached copies up to 2 h after deletion (the policy says so) | S3 |
| Upload budget: keyed hash of the uploader's IP | DB `uploads.ip_hash` | Caps unclaimed upload bytes per visitor | Legitimate interest (abuse prevention) | Nobody | Cleared when the upload is claimed; unclaimed uploads are deleted after `LEGAL.retention.unclaimedUploadHours` (3 h) | DB |
| Video width and height, trim points, transcript and captions (WebVTT) | DB `testimonials`; the transcript comes from Deepgram | Playback, AI features | Consent (same) | Customer; the public (captions, when shown) | With the testimonial | Deepgram (audio, with `mip_opt_out`), Anthropic (text, summaries, translations) |
| Translations of a testimonial's text | DB `testimonial_translations` (approved_at, approved_by, discarded_at) | Widgets in another language | Consent (same as the testimonial) | Customer; the public only after a member approves the translation | With the testimonial | Anthropic (text) |
| Consent record: flag, exact wording shown, version, language, time, page URL (origin and path) | DB `testimonials.consent*` | Proof of consent | Legal obligation | Customer (edit sheet, exports); the giver on their private page | With the testimonial; in the space and account exports | DB |
| Form stamp token (HMAC of space id and time, in the page) | In the HTML form only | Bot timing check | Legitimate interest | – | Not stored | – |
| Submission rate limits: `submit:ip:<hash>`, `submit:ip-space:<hash>:<space>` | DB `rate_limits` | Abuse protection | Legitimate interest | Nobody | 1 h and 10 min windows, swept by the cron. The IP is a keyed hash | DB |
| Invites: name, email, signed token (not stored), sent, opened and clicked timestamps, reminders sent | DB `invites` | Sending the invitation the customer asked for | Legitimate interest of the customer (consent where PECR or CASL require it) | Customer | Opened and clicked nulled 90 days after sending (cron); the row is deleted with the space | DB, Mail |
| Invite unsubscribe list (SHA-256 of the lower-cased email, space) | DB `invite_suppressions` | Honouring opt-outs | Legal obligation (CAN-SPAM, PECR) | The customer sees "unsubscribed" | Kept until the space is deleted, so the opt-out holds | DB |
| Invitation opens (tracking pixel) and link clicks | `/api/invites/open/<token>` | Reminders only to people who did not open | Legitimate interest | Customer | As above. The pixel is sent only while `LEGAL.inviteTracking` is on | Host |
| Reply by email: the customer's reply text, Reply-To header with the giver's address | DB `testimonial_replies`, `email_outbox` headers | Thanking the giver | Contract with the customer | Customer | With the testimonial | Mail |
| Rewards: code, claim (giver email and time) | DB `reward_codes`, `reward_claims` | Delivering the promised reward | Contract with the customer | Customer | With the space | DB |
| NPS score and comment | DB `nps_responses` | The customer's survey | Consent | Customer | With the space | DB |
| Collect-page views (counts per form per day; no IP, no user agent) | DB `form_views` | Form statistics | Legitimate interest | Customer | 400 days (cron) | DB |
| Receipt email to the giver (when they gave an email) | DB `email_outbox` | The giver's own copy, with the private link and the privacy link | Consent | Giver | Outbox retention | Mail |

## 3. Authors of imported reviews and mentions (controller: the customer)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Provider |
| --- | --- | --- | --- | --- | --- | --- |
| Public name, handle, avatar (copied into S3 only from Senja/Testimonial.to exports and the API), text, rating, date, source URL | DB `testimonials` (sources: X, YouTube, TikTok, App Store, WordPress.org and Hacker News through their official APIs or feeds; X, YouTube and TikTok re-checked weekly and removed once deleted; Google Business Profile, Google Play, Yotpo, Judge.me and any other CSV from the site's own export file; paste; screenshot; the browser extension; CSV) | Republishing a public review | The customer's legitimate interest; the customer confirms the right (Acceptable Use Policy) | Customer; the public when approved | With the testimonial. The author can ask for removal through the Report link or the operator | DB, S3; the source site's API (fetched server-side through `safe-fetch`) |
| Sync state: source URL or id, last sync time | DB import tables | Keeping API-backed imports fresh | Contract | Customer | With the space | DB; the source site's API |
| Mentions (Hacker News): author, text, URL | DB import tables | Monitoring | The customer's legitimate interest | Customer | 90 days unless saved as a testimonial | DB; the Hacker News Algolia API |
| Screenshots of reviews (image testimonials) | S3 `image/` | Review cards | As above | Public when approved | With the testimonial | S3 |

## 4. Visitors of public pages and widgets (controller: the operator for security; the customer for its pages)

| Data | Where | Why | Basis | Who sees it | Retention / deletion | Provider |
| --- | --- | --- | --- | --- | --- | --- |
| Widget stats: views, clicks, plays per widget per day per **hostname** | DB `widget_stats`, from the beacon `/api/e` | Analytics for the customer | Legitimate interest | Customer | 400 days (cron). No cookies, no IP stored | DB, Host |
| Beacon rate-limit key (hashed IP) | DB `rate_limits` | Abuse | Legitimate interest | – | 1 h | DB |
| Request logs (IP, URL, referrer = the embedding site) | Host | Security | Legitimate interest | Operator | The host's retention | Host |
| Cookies | None on public pages, embeds or widgets | – | – | – | – | – |
| Theme preference | The browser's localStorage only | – | – | – | Never leaves the browser | – |

## 5. Mail footers, senders and identity

| Mail | From | Reply-To | Footer | Kind |
| --- | --- | --- | --- | --- |
| Sign-in code | `MAIL_FROM` (Lovewall) | – | "Lovewall · free and open source" | Transactional |
| New-testimonial alert to the owner | Lovewall | – | same | Transactional |
| Invitation and reminder | `<space>` (`from_name`), address `MAIL_FROM` | the customer | "Sent by `<space>` via Lovewall", unsubscribe `/i/<token>` (works after the invite expires, as long as the row exists), RFC 8058 one-click, the space's mailing address (Settings → Space) | Commercial (CAN-SPAM): sender identity, opt-out and postal address |
| Receipt to the giver | `<space>` | – | "Sent by `<space>` via Lovewall" · Privacy | Transactional; carries the private manage link |
| Report to the space owner | Lovewall | – | same as alerts | Transactional |
| Account deleted | Lovewall | the privacy contact (hosted) | – | Transactional |
| Team invite | Lovewall | the inviter | – | Transactional |

## How the product keeps these promises

1. **Hashed IPs.** Sessions store `hashIp(ip)` (`databaseHooks.session`); Better Auth's limiter counts in `rate_limits`
   under `auth:<hash>` (`rateLimit.customStorage`). No raw IP is written by the app.
2. **Giver self-service.** The receipt email carries a private link (`giver_links`, random token, SHA-256 stored,
   1 year) to `/t/<token>`: view, edit (a published one goes back to review), delete; in the form's language. "Report"
   under widgets and on wall pages goes to `/r/<widget>`; reports land in an inbox queue (Hide, Delete, Dismiss) and
   email the owner.
3. **Account export.** Account settings, Export data: `/api/account/export`, one JSON file with the account, sign-in
   methods, sessions (hashed IPs), subscriptions, every owned space with every table that has a `space_id`,
   memberships, own activity, and a file manifest with 24 h download links. Hashes and secrets are omitted.
4. **Complete deletion.** Polar revoke first, then sessions, spaces (cascade), files (trash), unsent mail to the user
   and on their behalf, then a confirmation email. `storage_trash` is emptied by the cron. Only the trial-abuse hash
   (section 1) remains.
5. **Consent records.** Wording, version, language, time and the page URL (`consent_url`), shown in the edit sheet,
   on the giver's page and in both exports.
6. **Invite tracking.** Opens and clicks are nulled after 90 days (cron); suppressions are `sha256(lower(email))`;
   invites cascade with the space.
7. **OAuth tokens.** Nulled before every write (`databaseHooks.account`).
8. **Analytics retention.** `widget_stats` and `form_views`: 400 days (cron). `form_views` has no IP or user agent.
9. **Invite footers.** Sender identity, one-click and page unsubscribe (works after expiry), the space's postal
   address. The open pixel follows `LEGAL.inviteTracking`.
10. **Integration logs.** Deliveries 30 days (cron); revoked keys are deleted at once.
11. **Emails in the API and webhooks.** Read keys, plain webhooks, Slack and Discord never get the giver's email; REST
    hooks of write keys do. The privacy policy and the DPA say so, and that the customer's endpoint is the customer's
    processor.
12. **Caches.** Signed file URLs carry `max-age=3600`; the policy says "up to 2 hours".
13. **Log mail.** `src/instrumentation.ts` stops a production server when `MAIL_DRIVER=log` is set, or when the hosted
    service (billing on, or `APP_URL` on the hosted domain) would fall back to it; a self-hosted first run only warns.
14. **Consent line.** The collect form shows a "Privacy" link (22 languages) next to the consent text, which states
    the purpose (sharing publicly, with name and photo).
15. **Children.** The login page says "By continuing you confirm you are 16 or older and agree to the Terms and
    Privacy Policy" on the hosted service.
16. **Backups.** `LEGAL.retention.backupDays` must stay at or below `deletedAccountDays`; a unit test checks.
17. **Breach runbook.** `docs/legal/incident-runbook.md`.
18. **Team roles.** Owner only: space export, API keys, webhooks and chat integrations, custom domains, members,
    billing, deleting the space. Editors' (and givers' and API keys') exports, edits, deletions, replies, invites,
    report decisions and member changes go to `audit_log` (ids only, 1 year), shown to the owner in Settings,
    Activity. Editors can delete single testimonials (inbox work); it is logged.
19. **Rewarded testimonials.** `testimonials.rewarded` is set when a reward is granted and backfilled from
    `reward_claims` (migration 0100); every widget layout, the wall page and the public API show the disclosure.
20. **AI providers.** Anthropic's API does not train on API data unless the customer opts in (Lovewall does not);
    every Deepgram request sends `mip_opt_out=true`.
