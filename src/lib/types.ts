import type { WidgetConfig, WidgetType } from "@/lib/widget/config";

export type Status = "new" | "approved" | "hidden";

export type Space = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_key: string | null;
  website: string | null;
  brand_color: string;
  prompt: string;
  questions: string[];
  collect_video: boolean;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

export type Testimonial = {
  id: string;
  space_id: string;
  status: Status;
  featured: boolean;
  source: string;
  source_url: string | null;
  rating: number | null;
  text: string;
  name: string;
  title: string | null;
  company: string | null;
  handle: string | null;
  email: string | null;
  avatar_key: string | null;
  video_key: string | null;
  poster_key: string | null;
  video_aspect: number | null;
  // A screenshot or review card, for image testimonials.
  image_key: string | null;
  // Answers to the form's custom questions, keyed by question id (several choices: a list).
  answers: Record<string, string | number | boolean | string[]>;
  form_id: string | null;
  // The reviewer's company logo (upload kind "logo") and the trimmed range of a video, in seconds.
  company_logo_key?: string | null;
  video_start?: number | null;
  video_end?: number | null;
  // AI (migration 0060): the best line (verbatim), sentiment, spam flag, a video's transcript and whether it has captions.
  highlight?: string | null;
  sentiment?: "positive" | "neutral" | "negative" | null;
  spam?: boolean;
  transcript?: string | null;
  captions?: boolean;
  // The giver claimed a reward for it (migration 0100): shown with the testimonial, never hidden.
  rewarded?: boolean;
  tags: string[];
  consent: boolean;
  given_at: string;
  created_at: string;
  updated_at: string;
};

export type Widget = {
  id: string;
  space_id: string;
  name: string;
  type: WidgetType;
  config: WidgetConfig;
  created_at: string;
  updated_at: string;
};

// What widgets, the wall page and the public API see: no email, no internal fields.
export type PublicTestimonial = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  handle: string | null;
  text: string;
  rating: number | null;
  source: string;
  sourceUrl: string | null;
  avatar: string | null;
  video: string | null;
  poster: string | null;
  videoAspect: number | null;
  image: string | null;
  date: string;
  featured: boolean;
  tags: string[];
  companyLogo?: string | null;
  videoStart?: number | null;
  videoEnd?: number | null;
  // AI: the best line (shown highlighted when the widget asks for it) and the video's WebVTT captions.
  highlight?: string | null;
  captions?: string | null;
  // The giver got a reward for it: every layout says so (the FTC's endorsement rules ask for the disclosure).
  rewarded?: boolean;
};

export type PublicSpace = {
  name: string;
  slug: string;
  logo: string | null;
  website: string | null;
};

// rated: how many of them have a star rating (the review count in Google's AggregateRating).
export type Summary = { average: number | null; count: number; rated?: number };

// Widget analytics: one row per day (last 30 days) and the sites a widget is shown on (hostnames only).
export type StatsDay = { day: string; views: number; clicks: number; plays: number };
export type WidgetStats = { days: StatsDay[]; hosts: { host: string; views: number }[] };

// Teams: the owner manages members, billing and deleting the space; editors do everything else.
export type Role = "owner" | "editor";
