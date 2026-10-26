-- Hosted billing (only used when POLAR_ACCESS_TOKEN is set). One row per Polar subscription, kept in sync by the
-- webhook. The 14-day trial runs from sign-up (auth_users."createdAt") and needs no row.
create table if not exists subscriptions (
  id text primary key,
  user_id text not null references auth_users (id) on delete cascade,
  customer_id text not null,
  product_id text not null,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  -- Polar's own modification time: an older event that arrives late never overwrites a newer state.
  modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id);

-- Webhook deliveries already handled. Polar retries until it gets a 2xx; the webhook-id makes each count once.
create table if not exists billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
create index if not exists billing_events_received_idx on billing_events (received_at);
