"use client";

// Browser-side media helpers: shrink photos before upload, grab a poster frame, upload with progress.

export async function resizeImage(file: Blob, size = 480, square = true): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = square ? size / Math.min(bitmap.width, bitmap.height) : Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const w = square ? size : Math.round(bitmap.width * scale);
  const h = square ? size : Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (square) {
    const sw = bitmap.width * scale;
    const sh = bitmap.height * scale;
    ctx.drawImage(bitmap, (w - sw) / 2, (h - sh) / 2, sw, sh);
  } else ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvasBlob(canvas, "image/jpeg", 0.86);
}

// Logos keep transparency (PNG) and their shape.
export async function resizeLogo(file: Blob, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvasBlob(canvas, "image/png");
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the image"))), type, quality),
  );
}

// Draws the current frame of a <video> into a JPEG (max 960 px wide).
export async function frameOf(video: HTMLVideoElement, mirror = false): Promise<Blob | null> {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, 960 / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, "image/jpeg", 0.82).catch(() => null);
}

// Loads a video file and grabs a poster frame plus its size and duration.
export function probeVideo(file: Blob): Promise<{ poster: Blob | null; aspect: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const done = (r: { poster: Blob | null; aspect: number; duration: number }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ poster: null, aspect: 16 / 9, duration: 0 }), 8000);
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(0.6, (Number.isFinite(v.duration) ? v.duration : 1) / 2);
    };
    v.onseeked = async () => {
      clearTimeout(timer);
      const poster = await frameOf(v);
      done({ poster, aspect: v.videoWidth / v.videoHeight || 16 / 9, duration: Number.isFinite(v.duration) ? v.duration : 0 });
    };
    v.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video"));
    };
  });
}

export function pickRecorderType(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function baseType(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

// PUT to a presigned URL with progress (fetch can't report upload progress).
export function putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(body);
  });
}
