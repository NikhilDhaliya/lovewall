-- A testimonial whose author claimed a reward says so wherever it is shown (widgets, wall page, public API), and
-- the space can't switch that off. Set when the reward is granted; existing claims are backfilled.
alter table testimonials add column if not exists rewarded boolean not null default false;

update testimonials t set rewarded = true
from reward_claims c
where c.testimonial_id = t.id and not t.rewarded;
