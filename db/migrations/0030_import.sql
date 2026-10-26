-- Connected sources: review pages kept in sync. The cron fetches each one about once a day and adds reviews
-- newer than the watermark; failures back off.
create table if not exists import_sources (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  source text not null,
  input text not null,
  label text not null default '',
  -- Approve new reviews at or above this rating; null leaves them as new.
  auto_approve smallint check (auto_approve between 1 and 5),
  -- Newest review date seen; older reviews (ones the owner chose not to import) are never added later.
  since timestamptz,
  last_run_at timestamptz,
  last_added integer,
  last_error text,
  failures integer not null default 0,
  next_run_at timestamptz not null default now() + interval '1 day',
  created_at timestamptz not null default now()
);
create unique index if not exists import_sources_input_key on import_sources (space_id, source, input);
create index if not exists import_sources_due_idx on import_sources (next_run_at);

-- Mentions: keywords per space, searched on Hacker News and Reddit by the cron.
create table if not exists mention_settings (
  space_id text primary key references spaces (id) on delete cascade,
  keywords text[] not null default '{}',
  digest boolean not null default true,
  checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  failures integer not null default 0,
  last_error text,
  digest_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists mention_settings_due_idx on mention_settings (next_check_at) where cardinality(keywords) > 0;

create table if not exists mentions (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  platform text not null check (platform in ('hackernews', 'reddit')),
  external_id text not null,
  url text not null,
  author text not null default '',
  title text not null default '',
  text text not null default '',
  keyword text not null default '',
  posted_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed')),
  testimonial_id text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists mentions_external_key on mentions (space_id, platform, external_id);
create index if not exists mentions_space_status_idx on mentions (space_id, status, posted_at desc);
