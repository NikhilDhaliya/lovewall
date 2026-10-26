-- Teams: everyone who can open a space, with their role. The owner can do everything (members, billing, deleting
-- the space); editors everything else. spaces.owner_id stays the one owner: the trigger below keeps a matching
-- 'owner' row here when a space is created or handed to someone else.
create table if not exists space_members (
  space_id text not null references spaces (id) on delete cascade,
  user_id text not null references auth_users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_members_user_idx on space_members (user_id, created_at);
create unique index if not exists space_members_one_owner on space_members (space_id) where role = 'owner';

create or replace function lovewall_space_owner() returns trigger language plpgsql as $$
begin
  -- The previous owner (if any) stays on as an editor.
  update space_members set role = 'editor' where space_id = new.id and role = 'owner' and user_id <> new.owner_id;
  insert into space_members (space_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict (space_id, user_id) do update set role = 'owner';
  return new;
end
$$;

drop trigger if exists spaces_owner_member on spaces;
create trigger spaces_owner_member after insert or update of owner_id on spaces
  for each row execute function lovewall_space_owner();

-- Spaces created before teams: their owner becomes the owner member.
insert into space_members (space_id, user_id, role, created_at)
select id, owner_id, 'owner', created_at from spaces
on conflict (space_id, user_id) do nothing;

-- Invites by email. The link carries a random token; only its SHA-256 is stored. Single use, valid for 7 days, and
-- only the invited address can accept it.
create table if not exists space_invites (
  id text primary key,
  space_id text not null references spaces (id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor')),
  token_hash text not null,
  invited_by text references auth_users (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists space_invites_token_key on space_invites (token_hash);
create unique index if not exists space_invites_email_key on space_invites (space_id, email);
