import "server-only";
import { aiReady } from "@/lib/ai/client";
import { readImage, type ScreenshotText } from "@/lib/ai/screenshot";

// Reads screenshots (who wrote it, what they said, the stars) with AI when a key is set. Imports call it for every
// screenshot; null keeps name and text empty for the owner (or the background job) to fill.
export async function readScreenshot(spaceId: string, key: string): Promise<ScreenshotText | null> {
  if (!aiReady()) return null;
  const res = await readImage(spaceId, key);
  return res.ok ? res.data : null;
}

// Several at once, within a time budget: the ones not read by then are left to the background job.
export async function readScreenshots(spaceId: string, keys: string[], budgetMs = 20_000): Promise<Map<string, ScreenshotText>> {
  const out = new Map<string, ScreenshotText>();
  if (!aiReady() || !keys.length) return out;
  const deadline = Date.now() + budgetMs;
  let i = 0;
  const worker = async () => {
    while (i < keys.length && Date.now() < deadline) {
      const key = keys[i++];
      const read = await readScreenshot(spaceId, key);
      if (read) out.set(key, read);
    }
  };
  await Promise.race([Promise.all(Array.from({ length: Math.min(5, keys.length) }, worker)), new Promise((r) => setTimeout(r, budgetMs))]);
  return new Map(out);
}
