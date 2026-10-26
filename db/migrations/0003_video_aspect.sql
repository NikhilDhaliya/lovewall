-- Width / height of a video testimonial, so widgets reserve the right space before the poster loads.
alter table testimonials add column if not exists video_aspect real;
