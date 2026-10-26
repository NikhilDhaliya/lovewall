import "server-only";
import { one, q } from "@/lib/db";
import { aiEnv } from "@/lib/env";

// Daily caps per space: AI calls cost money, so every feature has its own ceiling and all of them share one total
// (AI_MAX_CALLS_PER_SPACE_PER_DAY). Days are UTC.
export const CAPS = {
  analyze: 500,
  grammar: 200,
  transcript: 50,
  translate: 300,
  summary: 10,
  case_study: 30,
  form: 20,
  screenshot: 100,
} as const;

export type Feature = keyof typeof CAPS;

// Takes one call from today's allowance; false when the feature's cap or the space's total is used up.
export async function reserve(spaceId: string, feature: Feature): Promise<boolean> {
  const total = await one<{ n: number }>(
    "select coalesce(sum(calls), 0)::int as n from ai_usage where space_id = $1 and day = (now() at time zone 'utc')::date",
    [spaceId],
  );
  if ((total?.n ?? 0) >= aiEnv.maxCallsPerDay) return false;
  const row = await one<{ calls: number }>(
    `insert into ai_usage (space_id, day, feature, calls) values ($1, (now() at time zone 'utc')::date, $2, 1)
     on conflict (space_id, day, feature) do update set calls = ai_usage.calls + 1 where ai_usage.calls < $3
     returning calls`,
    [spaceId, feature, CAPS[feature]],
  );
  return Boolean(row);
}

export async function countTokens(spaceId: string, feature: Feature, input: number, output: number) {
  await q(
    `update ai_usage set input_tokens = input_tokens + $3, output_tokens = output_tokens + $4
     where space_id = $1 and day = (now() at time zone 'utc')::date and feature = $2`,
    [spaceId, feature, input, output],
  ).catch(() => {});
}

export async function usageToday(spaceId: string): Promise<{ calls: number; max: number }> {
  const row = await one<{ n: number }>(
    "select coalesce(sum(calls), 0)::int as n from ai_usage where space_id = $1 and day = (now() at time zone 'utc')::date",
    [spaceId],
  );
  return { calls: row?.n ?? 0, max: aiEnv.maxCallsPerDay };
}
