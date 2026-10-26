-- Collect: several forms per space (testimonial, NPS survey, case study), form views, NPS responses, rewards,
-- email invites with reminders, custom domains, replies by email.

-- Forms. The default form lives at /<space-slug>, the others at /<space-slug>/<form-slug>.
create table if not exists forms (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  kind text not null default 'testimonial' check (kind in ('testimonial', 'nps', 'case_study')),
  is_default boolean not null default false,
  slug text not null,
  name text not null,
  -- The page: headline, an optional intro line, and hints (questions shown as guidance).
  title text not null default '',
  prompt text not null default '',
  hints jsonb not null default '[]'::jsonb,
  -- Standard fields (rating, text, video, name, role, photo, email, website): off | optional | required.
  fields jsonb not null default '{}'::jsonb,
  -- Custom questions: [{ id, type, label, required, options }]. Answers land in testimonials.answers by id.
  questions jsonb not null default '[]'::jsonb,
  layout text not null default 'single' check (layout in ('single', 'steps')),
  -- Thank-you screen: { title, text, buttonLabel, buttonUrl }.
  thanks jsonb not null default '{}'::jsonb,
  -- A language code, or 'auto' (the visitor's browser). Only built-in texts are translated.
  language text not null default 'en',
  -- { type: none | coupon | link | wheel, ... }. Codes and links are revealed only after a submission.
  reward jsonb not null default '{"type":"none"}'::jsonb,
  -- NPS: the follow-up question after the score.
  followup text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists forms_space_slug_key on forms (space_id, slug);
create unique index if not exists forms_default_key on forms (space_id) where is_default;
create index if not exists forms_space_idx on forms (space_id, created_at);

-- Every existing space gets a default form made from its collect page settings.
insert into forms (id, space_id, kind, is_default, slug, name, title, hints, fields)
select left(replace(gen_random_uuid()::text, '-', ''), 12), s.id, 'testimonial', true, 'testimonials', 'Testimonials', s.prompt,
       s.questions, jsonb_build_object('video', case when s.collect_video then 'optional' else 'off' end)
from spaces s
where not exists (select 1 from forms f where f.space_id = s.id and f.is_default);

update testimonials t set form_id = f.id
from forms f
where f.space_id = t.space_id and f.is_default and t.form_id is null and t.source = 'Form';

create index if not exists testimonials_form_idx on testimonials (form_id, created_at desc) where form_id is not null;

-- The visitor's own website (an optional form field) and the last reply sent from the inbox.
alter table testimonials add column if not exists website text;
alter table testimonials add column if not exists replied_at timestamptz;

-- The consent each visitor gave on the form: the exact text shown, its version, when, and in which language.
alter table testimonials add column if not exists consent_text text;
alter table testimonials add column if not exists consent_version text;
alter table testimonials add column if not exists consent_at timestamptz;
alter table testimonials add column if not exists consent_lang text;

-- A postal address for the footer of invite emails (anti-spam laws ask for one in commercial mail).
alter table spaces add column if not exists business_address text;

-- Page views per form per day: a counter only (no cookies, no IPs, no personal data).
create table if not exists form_views (
  form_id text not null references forms (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (form_id, day)
);

-- NPS answers. Promoters who go on to write a testimonial link to it; other answers are feedback only.
create table if not exists nps_responses (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  form_id text not null references forms (id) on delete cascade,
  score smallint not null check (score between 0 and 10),
  comment text not null default '',
  name text,
  email text,
  answers jsonb not null default '{}'::jsonb,
  testimonial_id text references testimonials (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists nps_responses_form_idx on nps_responses (form_id, created_at desc);

-- Coupon code lists: each code is handed out once.
create table if not exists reward_codes (
  id bigserial primary key,
  form_id text not null references forms (id) on delete cascade,
  code text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reward_codes_free_idx on reward_codes (form_id, id) where claimed_at is null;

-- What each submission was given. A wheel claim has no prize until the visitor spins (once); the spin token is
-- random and only its hash is stored.
create table if not exists reward_claims (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  form_id text not null references forms (id) on delete cascade,
  testimonial_id text references testimonials (id) on delete set null,
  response_id text references nps_responses (id) on delete set null,
  kind text not null check (kind in ('coupon', 'link', 'wheel')),
  token_hash text unique,
  prize jsonb,
  email text,
  spun_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reward_claims_form_idx on reward_claims (form_id, created_at desc);

-- Email invites. The link token is signed (HMAC of the id), never stored; it expires with the invite. Status comes
-- from the timestamps.
create table if not exists invites (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  form_id text not null references forms (id) on delete cascade,
  name text not null default '',
  email text not null,
  subject text not null,
  message text not null,
  reply_to text,
  reminders_left smallint not null default 1,
  remind_after_days smallint not null default 3,
  sent_at timestamptz,
  reminded_at timestamptz,
  reminders_sent smallint not null default 0,
  opened_at timestamptz,
  clicked_at timestamptz,
  submitted_at timestamptz,
  unsubscribed_at timestamptz,
  testimonial_id text references testimonials (id) on delete set null,
  expires_at timestamptz not null default now() + interval '60 days',
  created_at timestamptz not null default now()
);
create index if not exists invites_space_idx on invites (space_id, created_at desc);
create index if not exists invites_reminder_idx on invites (coalesce(reminded_at, sent_at))
  where reminders_left > 0 and submitted_at is null and unsubscribed_at is null;

-- People who unsubscribed from a space's invites, kept as sha256(lower(email)) in hex: enough to never email them
-- again, without keeping the address.
create table if not exists invite_suppressions (
  space_id text not null references spaces (id) on delete cascade,
  email_hash text not null,
  created_at timestamptz not null default now(),
  primary key (space_id, email_hash)
);

-- Custom domains: one per space, served only once its DNS points at us.
create table if not exists domains (
  domain text primary key,
  space_id text not null unique references spaces (id) on delete cascade,
  verified_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Replies sent from the inbox.
create table if not exists testimonial_replies (
  id bigserial primary key,
  testimonial_id text not null references testimonials (id) on delete cascade,
  space_id text not null references spaces (id) on delete cascade,
  user_id text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists testimonial_replies_idx on testimonial_replies (testimonial_id, created_at desc);

-- Outgoing mail can carry a Reply-To, a sender name and extra headers (List-Unsubscribe).
alter table email_outbox add column if not exists reply_to text;
alter table email_outbox add column if not exists from_name text;
alter table email_outbox add column if not exists headers jsonb;
