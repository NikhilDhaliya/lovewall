-- Posts imported through oEmbed (X, YouTube, TikTok) are looked up again every week: a testimonial whose post is
-- gone is removed, and one the owner hasn't edited follows changes to the post. checked_at is when it was last looked
-- up (null for everything else); source_hash is md5(name, newline, text) as last fetched, to tell owner edits apart.
alter table testimonials add column if not exists checked_at timestamptz;
alter table testimonials add column if not exists source_hash text;
create index if not exists testimonials_checked_idx on testimonials (checked_at) where checked_at is not null;
