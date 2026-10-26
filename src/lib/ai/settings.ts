import "server-only";
import { one, q } from "@/lib/db";
import { aiEnv } from "@/lib/env";
import { aiReady } from "./client";

export type AiSettings = { spam: boolean; sentiment: boolean; highlight: boolean; captions: boolean; grammar: boolean };
export const AI_SWITCHES = ["spam", "sentiment", "highlight", "captions", "grammar"] as const;

const DEFAULTS: AiSettings = { spam: true, sentiment: true, highlight: true, captions: true, grammar: true };

// Which keys are set: Claude for everything written or read, Deepgram for video transcripts.
export function aiKeys() {
  return { text: aiReady(), speech: Boolean(aiEnv.deepgramKey) };
}

export function anyAi() {
  const k = aiKeys();
  return k.text || k.speech;
}

export async function getAiSettings(spaceId: string): Promise<AiSettings> {
  const row = await one<AiSettings>("select spam, sentiment, highlight, captions, grammar from ai_settings where space_id = $1", [spaceId]);
  return row ?? DEFAULTS;
}

export async function saveAiSettings(spaceId: string, patch: Partial<AiSettings>) {
  const next = { ...(await getAiSettings(spaceId)), ...patch };
  await q(
    `insert into ai_settings (space_id, spam, sentiment, highlight, captions, grammar) values ($1, $2, $3, $4, $5, $6)
     on conflict (space_id) do update set spam = $2, sentiment = $3, highlight = $4, captions = $5, grammar = $6, updated_at = now()`,
    [spaceId, next.spam, next.sentiment, next.highlight, next.captions, next.grammar],
  );
  return next;
}

// What the collect page may offer a visitor: spelling help only with a key and the switch on.
export async function grammarOn(spaceId: string) {
  return aiReady() && (await getAiSettings(spaceId)).grammar;
}
