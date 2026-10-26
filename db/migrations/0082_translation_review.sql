-- AI translations wait for a person: widgets and the public API show one only after an owner or editor approved it.
-- Translations made before this were never reviewed, so they start unapproved. A discarded translation keeps its row
-- (the background job would otherwise make it again) until the testimonial's text changes or someone translates again.
alter table testimonial_translations add column if not exists approved_at timestamptz;
alter table testimonial_translations add column if not exists approved_by text references auth_users (id) on delete set null;
alter table testimonial_translations add column if not exists discarded_at timestamptz;
