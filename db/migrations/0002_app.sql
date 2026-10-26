-- Spaces: one per product or brand. The slug is the public collect page (/<slug>).
create table if not exists spaces (
  id text primary key,
  owner_id text not null references auth_users (id) on delete cascade,
  name text not null,
  slug text not null,
  logo_key text,
  website text,
  brand_color text not null default '#1d1d1f',
  prompt text not null default '',
  questions jsonb not null default '[]'::jsonb,
  collect_video boolean not null default true,
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists spaces_slug_key on spaces (slug);
create index if not exists spaces_owner_idx on spaces (owner_id, created_at);

-- Testimonials: collected on the form, imported (X, CSV) or added by hand.
create table if not exists testimonials (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'approved', 'hidden')),
  featured boolean not null default false,
  source text not null default 'form',
  source_url text,
  rating smallint check (rating between 1 and 5),
  text text not null default '',
  name text not null,
  title text,
  company text,
  handle text,
  email text,
  avatar_key text,
  video_key text,
  poster_key text,
  tags text[] not null default '{}',
  consent boolean not null default false,
  given_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists testimonials_space_status_idx on testimonials (space_id, status, created_at desc);
create index if not exists testimonials_space_created_idx on testimonials (space_id, created_at desc);
create index if not exists testimonials_tags_idx on testimonials using gin (tags);
create unique index if not exists testimonials_source_url_key on testimonials (space_id, source_url) where source_url is not null;

-- Widgets: an embeddable view of a space's testimonials. The id is public (embed, /w/<id>).
create table if not exists widgets (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  name text not null,
  type text not null check (type in ('wall', 'carousel', 'marquee', 'single', 'badge')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists widgets_space_idx on widgets (space_id, created_at);

-- Uploads: every presigned PUT is recorded. A file is served only once a testimonial or space claims it;
-- unclaimed uploads are deleted by the maintenance cron.
create table if not exists uploads (
  key text primary key,
  space_id text not null references spaces (id) on delete cascade,
  kind text not null check (kind in ('avatar', 'video', 'poster', 'logo')),
  content_type text not null,
  size integer not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists uploads_unclaimed_idx on uploads (created_at) where claimed_at is null;

-- Fixed-window rate limits for public endpoints (works on serverless: the counter lives in Postgres).
create table if not exists rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
create index if not exists rate_limits_reset_idx on rate_limits (reset_at);

-- Outgoing mail queue: sent right away, retried by the maintenance cron when the provider fails.
create table if not exists email_outbox (
  id bigserial primary key,
  to_email text not null,
  subject text not null,
  html text not null,
  body text not null,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists email_outbox_due_idx on email_outbox (next_at) where sent_at is null;

-- Deleted files waiting to be removed from storage (retried by the cron if storage is down).
create table if not exists storage_trash (
  prefix text primary key,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
