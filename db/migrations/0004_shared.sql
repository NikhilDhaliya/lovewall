-- Columns several features share: image testimonials (screenshots, review cards), answers to a form's custom
-- questions, and the form a testimonial came from. Feature migrations are numbered by area (0010-0059).
alter table testimonials add column if not exists image_key text;
alter table testimonials add column if not exists answers jsonb not null default '{}'::jsonb;
alter table testimonials add column if not exists form_id text;

alter table uploads drop constraint if exists uploads_kind_check;
alter table uploads add constraint uploads_kind_check check (kind in ('avatar', 'video', 'poster', 'logo', 'image'));
