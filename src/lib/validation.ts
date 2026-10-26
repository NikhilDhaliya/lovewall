import { z } from "zod";

// Shared input rules (client forms and server checks use the same ones).
export const RESERVED_SLUGS = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "apps",
  "assets",
  "auth",
  "blog",
  "dashboard",
  "docs",
  "embed",
  "embed.js",
  "favicon.ico",
  "guides",
  "help",
  "home",
  "legal",
  "login",
  "logout",
  "new",
  "pricing",
  "privacy",
  "robots.txt",
  "settings",
  "signin",
  "signup",
  "sitemap.xml",
  "static",
  "status",
  "support",
  "terms",
  "w",
  "widget",
  "widgets",
  "www",
  "_next",
  "lovewall",
  "opengraph-image",
  "icon",
  "invite",
  "billing",
  "apple-icon",
  "manifest.webmanifest",
  "avatar.svg",
  "security",
  "contact",
  "oauth",
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "At least 2 characters")
  .max(40, "At most 40 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Letters, numbers and dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "That link is taken");

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

// No control characters except newlines/tabs in long text; none at all in single-line fields.
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s{2,}/g, " "));
const longText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) =>
      s
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(z.string().max(max, `At most ${max} characters`));

export const nameSchema = line(80).pipe(z.string().min(1, "Add a name"));
export const optionalLine = (max: number) =>
  line(max)
    .optional()
    .nullable()
    .transform((s) => (s ? s : null));
export const textSchema = longText(3000);
export const ratingSchema = z
  .number()
  .int()
  .min(1)
  .max(5)
  .nullable()
  .optional()
  .transform((v) => v ?? null);
export const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A hex colour like #1d1d1f");
export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u, "Letters, numbers, dashes");
export const sourceSchema = line(32).pipe(z.string().min(1)).catch("Manual");

export const websiteSchema = z
  .string()
  .trim()
  .max(300)
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Not a valid link")
  .transform((s) => s || null);

export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((s) => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  }, "Not a valid https link");

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const UPLOAD_KINDS = ["avatar", "video", "poster", "logo", "image"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function uploadRules(kind: UploadKind, maxVideoMb = 60) {
  switch (kind) {
    case "video":
      return { types: VIDEO_TYPES as readonly string[], max: maxVideoMb * 1024 * 1024 };
    case "poster":
      return { types: ["image/jpeg", "image/webp", "image/png"] as readonly string[], max: 1.5 * 1024 * 1024 };
    case "image":
      return { types: IMAGE_TYPES as readonly string[], max: 5 * 1024 * 1024 };
    default:
      return { types: IMAGE_TYPES as readonly string[], max: 3 * 1024 * 1024 };
  }
}

export const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
