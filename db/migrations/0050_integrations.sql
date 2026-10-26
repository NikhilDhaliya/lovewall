-- API keys, one set per space. Only a SHA-256 hash of the key is stored; the short prefix is public (it finds the
-- row and identifies the key in the UI). scope: read, or write (read and write). Revoking deletes the row.
create table if not exists api_keys (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  name text not null,
  scope text not null check (scope in ('read', 'write')),
  prefix text not null,
  hash text not null,
  created_by text references auth_users (id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists api_keys_prefix_key on api_keys (prefix);
create index if not exists api_keys_space_idx on api_keys (space_id, created_at);

-- Outgoing webhooks of a space. kind: webhook (an endpoint the owner added), rest (a REST Hook subscription made
-- through the API, e.g. by Zapier or Make; it dies with its key), slack and discord (chat messages).
-- The signing secret is encrypted at rest (AES-GCM, key derived from BETTER_AUTH_SECRET).
create table if not exists webhooks (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  kind text not null check (kind in ('webhook', 'rest', 'slack', 'discord')),
  url text not null,
  events text[] not null default '{}',
  secret text,
  api_key_id text references api_keys (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhooks_space_idx on webhooks (space_id, created_at);
create unique index if not exists webhooks_chat_key on webhooks (space_id, kind) where kind in ('slack', 'discord');

-- Delivery queue and log. next_at is set while a delivery waits for an attempt and cleared once it is delivered or
-- given up. The id is the Standard Webhooks message id (same on every retry).
create table if not exists webhook_deliveries (
  id text primary key,
  webhook_id text not null references webhooks (id) on delete cascade,
  space_id text not null references spaces (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_at timestamptz default now(),
  delivered_at timestamptz,
  status_code integer,
  last_error text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  attempted_at timestamptz
);
create index if not exists webhook_deliveries_due_idx on webhook_deliveries (next_at) where next_at is not null;
create index if not exists webhook_deliveries_hook_idx on webhook_deliveries (webhook_id, created_at desc);
create index if not exists webhook_deliveries_created_idx on webhook_deliveries (created_at);
