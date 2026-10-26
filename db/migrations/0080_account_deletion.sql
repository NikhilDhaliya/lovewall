-- Credentials and outgoing hooks die with the person who made them: when a member leaves, is removed or deletes their
-- account, their API keys (and the REST Hooks made with those keys) and the webhooks, Slack and Discord links they set
-- up stop at once. Before this, deleting an account only cleared api_keys.created_by and the keys kept working.

-- Keys whose maker deleted their account before this rule (the only way created_by became null): remove them.
delete from api_keys where created_by is null;
alter table api_keys drop constraint if exists api_keys_created_by_fkey;
alter table api_keys
  add constraint api_keys_created_by_fkey foreign key (created_by) references auth_users (id) on delete cascade;

-- Who set up a webhook, Slack or Discord link (null for ones made before this column existed; REST Hooks follow
-- their key instead).
alter table webhooks add column if not exists created_by text references auth_users (id) on delete cascade;
create index if not exists webhooks_created_by_idx on webhooks (created_by) where created_by is not null;
create index if not exists api_keys_created_by_idx on api_keys (created_by);

-- Hosted trials (only written while billing is on): the first sign-up date of an address outlives the account, so
-- deleting it and signing up again doesn't start a second trial. Only a SHA-256 of the lowercased address is kept,
-- and the row is deleted a year after the account was (src/lib/jobs/security.ts).
create table if not exists signup_history (
  email_hash text primary key,
  first_signed_up_at timestamptz not null,
  deleted_at timestamptz not null default now()
);
create index if not exists signup_history_deleted_idx on signup_history (deleted_at);
