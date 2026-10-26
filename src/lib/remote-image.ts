import "server-only";
import { q } from "@/lib/db";
import { newId } from "@/lib/ids";
import { sniff } from "@/lib/import/parse";
import { safeFetch } from "@/lib/safe-fetch";
import { putObject, spacePrefix, storageConfigured } from "@/lib/storage";
import { IMAGE_TYPES } from "@/lib/validation";

// Copies a remote image (an avatar given to the API) into storage: SSRF-safe fetch, images only, 1 MB cap.
// Best effort: null when storage is off or the image can't be fetched.
export async function storeRemoteImage(spaceId: string, url: string, kind: "avatar" | "image"): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    const res = await safeFetch(url, { accept: "image/*", maxBytes: 1024 * 1024, timeoutMs: 5000 });
    // The file's own first bytes decide its type, never the remote server's Content-Type.
    const type = sniff(res.body) ?? "";
    if (res.status !== 200 || !(IMAGE_TYPES as readonly string[]).includes(type) || res.body.length < 100) return null;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const key = `${spacePrefix(spaceId)}${kind}/${newId(16)}.${ext}`;
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
