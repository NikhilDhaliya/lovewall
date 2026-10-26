import "server-only";
import { fileUrl } from "@/lib/data/files";
import { env } from "@/lib/env";
import type { Status, Testimonial, Widget } from "@/lib/types";
import { parseConfig } from "@/lib/widget/config";

// What the API, webhooks and MCP see of a testimonial (snake_case, file keys become URLs). The giver's email is only
// for read and write keys: read-only keys, webhooks and chat messages never get it.
export type ApiTestimonial = {
  id: string;
  status: Status;
  featured: boolean;
  rating: number | null;
  text: string;
  name: string;
  title: string | null;
  company: string | null;
  handle: string | null;
  email?: string | null;
  avatar_url: string | null;
  video_url: string | null;
  image_url: string | null;
  source: string;
  source_url: string | null;
  tags: string[];
  given_at: string;
  created_at: string;
  updated_at: string;
  inbox_url: string;
};

const iso = (v: string | Date) => new Date(v).toISOString();

export function toApi(t: Testimonial, withEmail = false): ApiTestimonial {
  const out: ApiTestimonial = {
    id: t.id,
    status: t.status,
    featured: t.featured,
    rating: t.rating,
    text: t.text,
    name: t.name,
    title: t.title,
    company: t.company,
    handle: t.handle,
    email: t.email,
    avatar_url: fileUrl(t.avatar_key),
    video_url: fileUrl(t.video_key),
    image_url: fileUrl(t.image_key),
    source: t.source,
    source_url: t.source_url,
    tags: t.tags,
    given_at: iso(t.given_at),
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
    inbox_url: `${env.appUrl}/app/${t.space_id}`,
  };
  if (!withEmail) delete out.email;
  return out;
}

export type ApiWidget = {
  id: string;
  name: string;
  type: string;
  config: unknown;
  page_url: string;
  embed_url: string;
  embed_html: string;
  created_at: string;
  updated_at: string;
};

export function toApiWidget(w: Widget): ApiWidget {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    config: parseConfig(w.config),
    page_url: `${env.appUrl}/w/${w.id}`,
    embed_url: `${env.appUrl}/embed/${w.id}`,
    embed_html: `<script src="${env.appUrl}/embed.js" defer></script>\n<div data-lovewall="${w.id}"></div>`,
    created_at: iso(w.created_at),
    updated_at: iso(w.updated_at),
  };
}
