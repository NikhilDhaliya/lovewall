# Incident runbook: personal data breach

For whoever operates a Lovewall instance (the operator named in `src/lib/legal/config.ts`). A single operator does
every step here; a team should name who does which. Self-hosters: copy this and put in your own providers and
addresses.

A breach is any security incident that leads to personal data being destroyed, lost, changed, disclosed or accessed
without permission: a leaked database or backup, a leaked `BETTER_AUTH_SECRET`, `CRON_SECRET` or provider key, a bug
that shows one space's data to another, an email sent to the wrong people, a lost laptop with a `.env`.

Promises this runbook keeps: customers within **48 hours** (DPA), the lead authority within **72 hours** under the
GDPR, the Data Protection Board of India and affected people as the DPDP Rules 2025 require (without delay, with a
detailed report within 72 hours).

## 1. Detect (minutes)

Signals: a report through GitHub's private vulnerability reporting or the security contact (see `SECURITY.md`), an
alert from the host, the database provider, the file storage provider or the mail provider, odd rows in `audit_log`
(mass exports or deletions), a spike of 429s or 5xx in the host's logs, a customer's message.

- Open a private incident note (date, time in UTC, who found it, what was seen). Every later step adds to it.
- Do not delete logs or rows that show what happened. Copy the relevant ones out first (host logs expire fast:
  Vercel Hobby keeps 1 hour, Pro 1 day).

## 2. Contain (first hour)

Pick what applies:

- **Leaked app secret** (`BETTER_AUTH_SECRET`): rotate it at the host and redeploy. Every session ends, invite links
  (signed with it) stop working, hashed IPs no longer match old rate-limit rows (harmless), and stored webhook
  secrets must be rolled (`rollWebhookSecret`) because they are encrypted with a key derived from it. Givers' private
  links are random and stored hashed, so they keep working.
- **Leaked provider key** (database URL, S3, mail, Polar, Vercel): revoke it at the provider, set the new one,
  redeploy.
- **Leaked customer API key**: delete it from `api_keys` (its REST hooks go with it) and tell the customer.
- **Bug exposing data**: turn the route off (a quick deploy that returns 404), or take the app down until it is
  fixed.
- **Suspicious account**: `delete from auth_sessions where "userId" = '<id>'` and lock the space if needed.

## 3. Assess (within 24 hours)

Write down, from the database, logs and the audit log:

- what data (tables and columns; use `docs/legal/data-inventory.md`), how many people, which spaces and customers;
- whether it was only accessible or actually taken; whether it was encrypted or hashed (IPs, tokens and API keys are
  hashed; emails, testimonials and files are not);
- the risk to people (low: hashed values, public testimonials; high: givers' emails with names, private answers,
  videos of unpublished testimonials).

## 4. Notify

- **Customers (controllers) whose data is affected: within 48 hours** of becoming aware, by email from the privacy
  contact: what happened, what data, how many of their givers, what you did, what they should do, a contact. Under
  the DPA they decide on telling their givers and their authorities; give them what they need to do it.
- **Authorities for the operator's own data** (account holders, visitors):
  - GDPR / UK GDPR: the lead supervisory authority within **72 hours**, unless the breach is unlikely to result in a
    risk to people. With no EU establishment, notify each authority where affected people live (for the UK, the ICO).
  - India, DPDP Act and Rules: the Data Protection Board of India, without delay, and a detailed report within 72
    hours (or as the Board allows); affected Data Principals without delay, in plain language, with the likely
    consequences, what you are doing, and a contact.
  - United States: state breach laws apply to names with certain other data (not testimonials or emails alone); check
    the affected states if account numbers, IDs or credentials leaked.
- **People directly**: when the risk to them is high, email them (account holders) or ask the customer to (givers).
- Keep the text plain: what happened, when, what data, what you did, what they can do (change nothing for hashed
  data; watch for phishing when emails leaked).

## 5. Recover and record

- Fix the cause, add a test that proves it (`e2e/`), deploy.
- Record every breach, even small ones, in the incident note: facts, effects, actions, who was told and when. GDPR
  Art. 33(5) asks for this record; keep it for at least 3 years.
- Review a week later: what would have caught it sooner? Update this runbook and the data inventory.

## Contacts

- The operator's privacy and security addresses are in `src/lib/legal/config.ts` (`LEGAL.contact`; empty by
  default, so fill them in before you go live).
- Providers: Vercel (vercel.com/help), Supabase (supabase.com/support), ZeptoMail (Zoho support), Polar
  (polar.sh support), the S3 provider's console.
- Authorities: ICO (ico.org.uk/make-a-complaint/data-protection-complaints/), EU authorities list
  (edpb.europa.eu/about-edpb/about-edpb/members_en), Data Protection Board of India (as published under the DPDP Rules).
