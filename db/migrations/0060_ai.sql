-- AI (only with ANTHROPIC_API_KEY; video captions also need DEEPGRAM_API_KEY). Nothing here is used without keys.

-- Per space switches for the automatic features. A space without a row uses the defaults below.
create table if not exists ai_settings (
  space_id text primary key references spaces (id) on delete cascade,
  spam boolean not null default true,
  sentiment boolean not null default true,
  highlight boolean not null default true,
  captions boolean not null default true,
  grammar boolean not null default true,
  updated_at timestamptz not null default now()
);

-- What the AI added to a testimonial: the best line (verbatim), the sentiment, a spam flag (spam is hidden, never
-- deleted), and the transcript of a video (its WebVTT captions live in ai_captions).
alter table testimonials add column if not exists highlight text;
alter table testimonials add column if not exists sentiment text;
alter table testimonials drop constraint if exists testimonials_sentiment_check;
alter table testimonials add constraint testimonials_sentiment_check check (sentiment is null or sentiment in ('positive', 'neutral', 'negative'));
alter table testimonials add column if not exists spam boolean not null default false;
alter table testimonials add column if not exists transcript text;
alter table testimonials add column if not exists captions boolean not null default false;

create table if not exists ai_captions (
  testimonial_id text primary key references testimonials (id) on delete cascade,
  space_id text not null references spaces (id) on delete cascade,
  lang text,
  vtt text not null,
  created_at timestamptz not null default now()
);

-- Translations, one per language. source_hash is md5 of the text they were made from: an edited testimonial falls
-- back to its own words until it is translated again.
create table if not exists testimonial_translations (
  testimonial_id text not null references testimonials (id) on delete cascade,
  space_id text not null references spaces (id) on delete cascade,
  lang text not null,
  text text not null,
  highlight text,
  source_hash text not null,
  created_at timestamptz not null default now(),
  primary key (testimonial_id, lang)
);
create index if not exists testimonial_translations_space_idx on testimonial_translations (space_id, lang);

-- Background work: analyze (spam, sentiment, best line), transcript, translate (lang), screenshot. Run right after the
-- request (after()) and retried by the maintenance cron with backoff.
create table if not exists ai_jobs (
  id bigserial primary key,
  space_id text not null references spaces (id) on delete cascade,
  testimonial_id text not null references testimonials (id) on delete cascade,
  kind text not null check (kind in ('analyze', 'transcript', 'translate', 'screenshot')),
  lang text not null default '',
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_jobs_pending_key on ai_jobs (testimonial_id, kind, lang) where done_at is null;
create index if not exists ai_jobs_due_idx on ai_jobs (next_at) where done_at is null;

-- Calls per space per day and feature, for the daily caps and the usage line in settings.
create table if not exists ai_usage (
  space_id text not null references spaces (id) on delete cascade,
  day date not null default current_date,
  feature text not null,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (space_id, day, feature)
);

-- The latest summary of a space's testimonials.
create table if not exists ai_summaries (
  space_id text primary key references spaces (id) on delete cascade,
  summary jsonb not null,
  count integer not null,
  created_at timestamptz not null default now()
);

-- Written case studies (from a case-study form answer), editable by the owner.
create table if not exists case_study_drafts (
  testimonial_id text primary key references testimonials (id) on delete cascade,
  space_id text not null references spaces (id) on delete cascade,
  draft jsonb not null,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
