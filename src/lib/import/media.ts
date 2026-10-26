import "server-only";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { safeFetch } from "@/lib/safe-fetch";
import { putObject, spacePrefix, storageConfigured } from "@/lib/storage";
import { EXT, IMAGE_TYPES, VIDEO_TYPES } from "@/lib/validation";
import { route } from "./http";
import { sniff } from "./parse";

// Copies a remote file (an avatar, a screenshot, a video from an export) into this space's storage. SSRF-safe fetch,
// size caps per kind, and the type is read from the file's first bytes (not the server's header), so only real
// JPEG/PNG/WebP images and MP4/WebM/MOV videos are kept. Best effort: any failure returns null.

export type MediaKind = "avatar" | "image" | "poster" | "video";

const LIMITS: Record<MediaKind, { types: readonly string[]; max: () => number; timeoutMs: number }> = {
  avatar: { types: IMAGE_TYPES, max: () => 1024 * 1024, timeoutMs: 6000 },
  image: { types: IMAGE_TYPES, max: () => 5 * 1024 * 1024, timeoutMs: 10_000 },
  poster: { types: IMAGE_TYPES, max: () => 1.5 * 1024 * 1024, timeoutMs: 8000 },
  video: { types: VIDEO_TYPES, max: () => env.maxVideoMb * 1024 * 1024, timeoutMs: 60_000 },
};

export async function copyRemote(spaceId: string, url: string | null | undefined, kind: MediaKind): Promise<string | null> {
  if (!url || !storageConfigured()) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
    const rules = LIMITS[kind];
    const r = route(url);
    const res = await safeFetch(r.url, {
      accept: kind === "video" ? "video/*" : "image/*",
      maxBytes: rules.max(),
      timeoutMs: rules.timeoutMs,
      trusted: r.trusted,
    });
    const type = sniff(res.body);
    if (res.status !== 200 || res.body.length < 100 || !type || !rules.types.includes(type)) return null;
    const key = `${spacePrefix(spaceId)}${kind}/${newId(16)}.${EXT[type]}`;
    await putObject(key, res.body, type);
    await q("insert into uploads (key, space_id, kind, content_type, size, claimed_at) values ($1, $2, $3, $4, $5, now())", [
      key,
      spaceId,
      kind,
      type,
      res.body.length,
    ]);
    return key;
  } catch {
    return null;
  }
}
