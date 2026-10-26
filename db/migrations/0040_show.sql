-- Showing testimonials: more widget layouts, a company logo per testimonial, video trimming, and widget analytics.

alter table widgets drop constraint if exists widgets_type_check;
alter table widgets add constraint widgets_type_check check (
  type in ('wall', 'grid', 'carousel', 'marquee', 'list', 'single', 'hero', 'video', 'gallery', 'popup', 'badge', 'avatars', 'logos')
);

-- The reviewer's company logo (an upload of kind "logo"), shown by the Logos layout and next to names.
alter table testimonials add column if not exists company_logo_key text;

-- Video trimming: players start at video_start and stop at video_end (seconds; null = from the start / to the end).
alter table testimonials add column if not exists video_start real;
alter table testimonials add column if not exists video_end real;
alter table testimonials drop constraint if exists testimonials_video_trim_check;
alter table testimonials add constraint testimonials_video_trim_check check (
  (video_start is null or video_start >= 0) and (video_end is null or video_end > coalesce(video_start, 0))
);

-- Widget analytics, counted per widget per day and per site (hostname only). No cookies, no visitor data.
create table if not exists widget_stats (
  space_id text not null references spaces (id) on delete cascade,
  widget_id text not null references widgets (id) on delete cascade,
  day date not null,
  host text not null default '',
  views integer not null default 0,
  clicks integer not null default 0,
  plays integer not null default 0,
  primary key (widget_id, day, host)
);
create index if not exists widget_stats_space_day_idx on widget_stats (space_id, day);
