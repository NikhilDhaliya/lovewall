# Security

## Reporting a vulnerability

Report it privately through GitHub:
[github.com/NikhilDhaliya/lovewall/security/advisories/new](https://github.com/NikhilDhaliya/lovewall/security/advisories/new).
Say what you found, how to reproduce it and what it affects. Please don't open a public issue for security problems.

- You get a reply within a week, and updates while it is being fixed.
- You are credited in the release notes when the fix ships, if you want.
- There is no bounty programme.

Please test only against accounts and instances you own, don't access or change other people's data, don't run
denial-of-service tests, and allow a reasonable time (90 days at most) before publishing. No legal action is taken
against research done in good faith under these rules.

## Scope

- This repository: the app, the embed script, the WordPress plugin, the Zapier and Make apps and the browser
  extension.
- A hosted instance is run by its operator; its own Security page (`/legal/security`) names the operator's contact.
  Report problems in the code here, problems in a particular instance to its operator.

## Supported versions

The latest release on `main`. Security fixes are not backported to older tags.

## How the app is protected

Short version: TLS everywhere, private file storage with signed URLs, server-side sessions, one-time sign-in codes,
per-space access checks, escaped user content, strict CSP, SSRF-safe fetches, rate limits with hashed IPs, hashed or
encrypted secrets. The audit behind these rules, and every route with its access check and rate limit, is in
`docs/security/`.

## Running your own instance safely

- Set `BETTER_AUTH_SECRET` to a long random value (`openssl rand -base64 32`) and `CRON_SECRET` too. A production
  server refuses to start with a missing, short or example secret.
- Behind nginx, Caddy or a load balancer, set `TRUST_PROXY=1` so rate limits see real client IPs: Lovewall then
  trusts only the last `X-Forwarded-For` entry (the one your proxy appends), or the single header named in
  `TRUST_PROXY_HEADER` that your proxy always overwrites. Keep the app's port reachable only through the proxy.
  Without a proxy leave both empty. `RATE_LIMIT_PER_MINUTE` (default 1200) is a per-IP ceiling for each server
  instance; on Vercel, add a Firewall rate-limit rule for the same at the edge.
- Never set the test-only variables (`IMPORT_TEST_ENDPOINT`, `X_OEMBED_ENDPOINT`,
  `POLAR_API_URL`, `ANTHROPIC_BASE_URL`, `DEEPGRAM_API_URL`) in production. `WEBHOOKS_ALLOW_PRIVATE` lets every space
  send webhooks into your network: only for a single-tenant install.
- Serve over https (`APP_URL=https://…`): cookies then get the `Secure` flag and `__Secure-` prefix.
