import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Geist (SIL OFL, assets/fonts/OFL.txt) for share images; next.config traces assets/fonts into the build.
let cache: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: "normal" }[]> | null = null;

export function ogFonts() {
  if (!cache) {
    const dir = join(process.cwd(), "assets", "fonts");
    cache = Promise.all(
      (
        [
          ["Geist-Regular.ttf", 400],
          ["Geist-Medium.ttf", 500],
          ["Geist-SemiBold.ttf", 600],
          ["Geist-Bold.ttf", 700],
        ] as const
      ).map(async ([file, weight]) => ({ name: "Geist", data: await readFile(join(dir, file)), weight, style: "normal" as const })),
    ).catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}
