-- Privacy: what givers can do about their own testimonial, reports from the public, consent records with the page
-- they were given on, and an audit log of what team members do with personal data.

-- The page the consent was given on (origin and path only; no query string, so no invite token).
alter table testimonials add column if not exists consent_url text;

-- A giver's private link (in the receipt email) to see, edit or delete their testimonial. Only a SHA-256 of the
-- random token is stored; the link expires.
create table if not exists giver_links (
  testimonial_id text primary key references testimonials (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists giver_links_token_key on giver_links (token_hash);
create index if not exists giver_links_expires_idx on giver_links (expires_at);

-- "Report" on wall pages and widgets: anyone can ask for a testimonial to be removed. The space's members see the
-- queue in the inbox. The reporter's email is optional (to hear back); resolved reports are deleted after 90 days.
create table if not exists reports (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  testimonial_id text not null references testimonials (id) on delete cascade,
  reason text not null check (reason in ('me', 'false', 'offensive', 'other')),
  details text not null default '',
  email text,
  resolved_at timestamptz,
  resolution text check (resolution in ('hidden', 'deleted', 'dismissed')),
  resolved_by text references auth_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reports_open_idx on reports (space_id, created_at desc) where resolved_at is null;
create index if not exists reports_resolved_idx on reports (resolved_at) where resolved_at is not null;

-- Who did what with personal data, and when (exports, deletions, edits, invites, replies, member changes). Ids and
-- counts only, no personal data in the rows, so the log can outlive what it describes: kept one year, also after
-- the space or the person is gone (no foreign keys on purpose).
create table if not exists audit_log (
  id bigserial primary key,
  space_id text,
  actor_id text,
  -- 'member' (a signed-in member), 'giver' (through their private link), 'api' (an API key), 'system'.
  actor_kind text not null default 'member',
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_space_idx on audit_log (space_id, created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index if not exists audit_log_created_idx on audit_log (created_at);

-- Raw IPs that Better Auth wrote before sessions stored a keyed hash, and its old IP-keyed limiter rows.
update auth_sessions set "ipAddress" = null where "ipAddress" ~ '^[0-9a-fA-F.:]+$';
delete from auth_rate_limits;

-- OAuth tokens are not used after sign-in: drop the ones already stored.
update auth_accounts set "accessToken" = null, "refreshToken" = null, "idToken" = null
where "accessToken" is not null or "refreshToken" is not null or "idToken" is not null;
