import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Any S3-compatible store: AWS S3, Cloudflare R2, Supabase Storage (S3 API), MinIO. The bucket stays private:
// browsers upload with presigned PUTs and read through /api/files (a presigned GET).
let client: S3Client | null = null;
let publicClient: S3Client | null = null;

export function storageConfigured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

function make(endpoint: string | undefined) {
  return new S3Client({
    endpoint: endpoint || undefined,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    // Supabase and R2 reject the newer default checksum headers on presigned PUTs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function s3() {
  if (!client) client = make(process.env.S3_ENDPOINT);
  return client;
}

// URLs handed to browsers are signed for the public endpoint (Docker: the app reaches storage at an internal host,
// browsers at localhost or a domain).
function signer() {
  if (!process.env.S3_PUBLIC_ENDPOINT) return s3();
  if (!publicClient) publicClient = make(process.env.S3_PUBLIC_ENDPOINT);
  return publicClient;
}

const bucket = () => {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("Missing env S3_BUCKET");
  return b;
};

// A PUT URL that only accepts this exact type and size (both are signed headers).
export async function presignPut(key: string, contentType: string, size: number) {
  return getSignedUrl(signer(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }), {
    expiresIn: 600,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

// Signed from the start of the hour, valid for two: the same URL for an hour, so browsers and CDNs can cache it. Caches
// keep a file at most an hour, so a deleted photo or video stops showing soon after (the privacy policy says so).
export async function presignGet(key: string) {
  const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  return getSignedUrl(signer(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseCacheControl: "public, max-age=3600" }), {
    expiresIn: 7200,
    signingDate: hour,
  });
}

// A short-lived GET that downloads the file under a given name (account exports: valid for a day).
export async function presignDownload(key: string, filename: string, expiresIn = 600) {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "-");
  return getSignedUrl(
    signer(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename="${safe}"` }),
    { expiresIn },
  );
}

export async function head(key: string): Promise<{ size: number; type: string } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, type: res.ContentType ?? "" };
  } catch {
    return null;
  }
}

// Reads a small object (images for share cards); null when it is missing or larger than maxBytes.
export async function readObject(key: string, maxBytes: number): Promise<{ body: Buffer; type: string } | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body || (res.ContentLength ?? 0) > maxBytes) return null;
    const body = Buffer.from(await res.Body.transformToByteArray());
    return body.length > maxBytes ? null : { body, type: res.ContentType ?? "" };
  } catch {
    return null;
  }
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteKeys(keys: string[]) {
  const list = keys.filter(Boolean);
  for (let i = 0; i < list.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: list.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }),
    );
  }
}

export async function deletePrefix(prefix: string) {
  if (!prefix.endsWith("/") || prefix.length < 4) throw new Error("Refusing to delete a broad prefix");
  let token: string | undefined;
  do {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    await deleteKeys((page.Contents ?? []).map((o) => o.Key!).filter(Boolean));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

// Origins the browser talks to for files (CSP connect-src, img-src, media-src).
export function storageOrigins(): string[] {
  const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
  const b = process.env.S3_BUCKET ?? "";
  try {
    if (endpoint) {
      const url = new URL(endpoint);
      const origins = [url.origin];
      if (process.env.S3_FORCE_PATH_STYLE !== "true" && b) origins.push(`${url.protocol}//${b}.${url.host}`);
      return origins;
    }
  } catch {}
  return ["https://*.amazonaws.com"];
}

export const spacePrefix = (spaceId: string) => `spaces/${spaceId}/`;
