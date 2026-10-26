"use client";

import { presignUpload } from "@/app/actions/spaces";
import { putWithProgress } from "@/lib/media";

// Owner uploads (photos, logos, images, posters): presign through a server action, PUT straight to storage, return the key.
export async function uploadOwnerFile(
  spaceId: string,
  kind: "avatar" | "logo" | "image" | "poster",
  blob: Blob,
  type: string,
): Promise<string> {
  const res = await presignUpload(spaceId, { kind, type, size: blob.size });
  if (!res.ok) throw new Error(res.error);
  await putWithProgress(res.data.url, blob, type);
  return res.data.key;
}
