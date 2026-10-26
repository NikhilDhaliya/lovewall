-- Byte budgets for uploads from public forms: who asked (a keyed hash of the IP, like every rate limit) so the bytes
-- one visitor and one space may leave unclaimed in an hour can be counted. Cleared when the upload is claimed; null for
-- uploads by signed-in members.
alter table uploads add column if not exists ip_hash text;
create index if not exists uploads_ip_unclaimed_idx on uploads (ip_hash, created_at) where claimed_at is null and ip_hash is not null;
create index if not exists uploads_space_unclaimed_idx on uploads (space_id, created_at) where claimed_at is null and ip_hash is not null;
