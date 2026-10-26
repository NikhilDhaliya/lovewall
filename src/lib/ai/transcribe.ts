import "server-only";
import { z } from "zod";
import { one, q } from "@/lib/db";
import { aiEnv, env } from "@/lib/env";
import { readObject } from "@/lib/storage";
import type { AiResult } from "./client";
import { reserve } from "./usage";
import { cuesFromWords, toVtt } from "./vtt";

// Video transcripts with Deepgram's pre-recorded API: one request with the file, words with timings back. The words
// become WebVTT captions for the players; the transcript is the text of a video testimonial that has none.

const response = z.object({
  results: z.object({
    channels: z
      .array(
        z.object({
          detected_language: z.string().optional(),
          alternatives: z
            .array(
              z.object({
                transcript: z.string(),
                words: z
                  .array(z.object({ word: z.string(), punctuated_word: z.string().optional(), start: z.number(), end: z.number() }))
                  .default([]),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
});

export async function transcribe(id: string): Promise<AiResult<{ text: string } | null>> {
  if (!aiEnv.deepgramKey) return { ok: false, error: "Captions are off", code: "off" };
  const t = await one<{ space_id: string; video_key: string | null; text: string }>(
    "select space_id, video_key, text from testimonials where id = $1",
    [id],
  );
  if (!t?.video_key) return { ok: true, data: null };
  const file = await readObject(t.video_key, env.maxVideoMb * 1024 * 1024);
  if (!file) return { ok: false, error: "Couldn't read the video", code: "failed" };
  if (!(await reserve(t.space_id, "transcript"))) return { ok: false, error: "Daily AI limit reached", code: "cap" };
  let json: unknown;
  try {
    const res = await fetch(`${aiEnv.deepgramUrl}/v1/listen?model=nova-3&smart_format=true&detect_language=true`, {
      method: "POST",
      headers: { Authorization: `Token ${aiEnv.deepgramKey}`, "Content-Type": file.type || "video/webm" },
      body: new Uint8Array(file.body),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.error("AI: the Deepgram key was refused");
      return { ok: false, error: "Captions aren't set up right", code: "failed" };
    }
    if (!res.ok) return { ok: false, error: `Speech-to-text answered ${res.status}`, code: "failed" };
    json = await res.json();
  } catch {
    return { ok: false, error: "Speech-to-text didn't answer", code: "failed" };
  }
  const parsed = response.safeParse(json);
  if (!parsed.success) return { ok: false, error: "Speech-to-text sent something unexpected", code: "failed" };
  const channel = parsed.data.results.channels[0];
  const alt = channel.alternatives[0];
  const text = alt.transcript.trim().slice(0, 3000);
  const words = alt.words.map((w) => ({ word: w.punctuated_word ?? w.word, start: w.start, end: w.end }));
  const lang = channel.detected_language?.slice(0, 12) ?? null;
  if (!text) {
    // Silence or music: nothing to caption. Marked done so it isn't tried again.
    await q("update testimonials set transcript = '' where id = $1", [id]);
    return { ok: true, data: null };
  }
  await q(
    `insert into ai_captions (testimonial_id, space_id, lang, vtt) values ($1, $2, $3, $4)
     on conflict (testimonial_id) do update set lang = excluded.lang, vtt = excluded.vtt, created_at = now()`,
    [id, t.space_id, lang, toVtt(cuesFromWords(words))],
  );
  // A video without words gets its transcript as text (the owner can edit it); written words are never replaced.
  await q(`update testimonials set transcript = $2, captions = true, text = case when text = '' then $2 else text end where id = $1`, [
    id,
    text,
  ]);
  return { ok: true, data: { text } };
}
