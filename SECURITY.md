# Security

## Reporting a vulnerability

Email **security@lovewall.tech** with what you found, how to reproduce it and what it affects. Please don't open a
public issue for security problems.

- We reply within 3 business days and keep you informed while we fix it.
- We credit you in the release notes when the fix ships, if you want.
- There is no bounty programme.

Please test only against accounts you own, don't access or change other people's data, don't run denial-of-service
tests, and give us a reasonable time (90 days at most) before publishing. We will not take legal action against
research done in good faith under these rules.

## Scope

- This repository and the hosted service at https://lovewall.tech.
- Self-hosted instances are run by their own operators; report problems in the code here, problems in a particular
  instance to its operator.

## Supported versions

The latest release on `main`. Security fixes are not backported to older tags.

## How the app is protected

Short version: TLS everywhere, private file storage with signed URLs, server-side sessions, one-time sign-in codes,
per-space access checks, escaped user content, strict CSP, SSRF-safe fetches, rate limits with hashed IPs, hashed or
encrypted secrets. The hosted service's Security page has the details: https://lovewall.tech/legal/security

## Running your own instance safely

- Set `BETTER_AUTH_SECRET` to a long random value (`openssl rand -base64 32`) and `CRON_SECRET` too. A production
  server refuses to start with a missing, short or example secret.
- Behind nginx, Caddy or a load balancer, set `TRUST_PROXY=1` so rate limits see real client IPs; without a proxy
  leave it empty. `RATE_LIMIT_PER_MINUTE` (default 1200) is a per-IP ceiling for each server instance; on Vercel, add
  a Firewall rate-limit rule for the same at the edge.
- Never set the test-only variables (`IMPORT_TEST_ENDPOINT`, `X_OEMBED_ENDPOINT`, `X_SYNDICATION_ENDPOINT`,
  `POLAR_API_URL`, `ANTHROPIC_BASE_URL`, `DEEPGRAM_API_URL`) in production. `WEBHOOKS_ALLOW_PRIVATE` lets every space
  send webhooks into your network: only for a single-tenant install.
- Serve over https (`APP_URL=https://…`): cookies then get the `Secure` flag and `__Secure-` prefix.

The audit behind these rules, and every route with its access check and rate limit: `docs/security/`.
