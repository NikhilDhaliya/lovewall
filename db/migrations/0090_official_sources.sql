-- Imports read other sites only through official feeds, APIs and oEmbed endpoints. Synced sources that were read
-- any other way stop (the App Store feed and the WordPress.org API stay), and mentions come from Hacker News only.
delete from import_sources where source not in ('appstore', 'wordpress');

delete from mentions where platform <> 'hackernews';
alter table mentions drop constraint if exists mentions_platform_check;
alter table mentions add constraint mentions_platform_check check (platform = 'hackernews');
