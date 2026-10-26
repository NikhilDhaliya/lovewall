import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { aiEnv } from "@/lib/env";
import { countTokens, reserve, type Feature } from "./usage";

// The one way the app calls Claude: structured output checked against a zod schema, a timeout, a daily cap per space
// and feature, and errors that become a short message instead of an exception.

export function aiReady() {
  return Boolean(aiEnv.anthropicKey);
}

const globalForAi = globalThis as unknown as { lovewallAnthropic?: { key: string; client: Anthropic } };

function client(): Anthropic {
  const key = aiEnv.anthropicKey;
  if (globalForAi.lovewallAnthropic?.key !== key) {
    globalForAi.lovewallAnthropic = {
      key,
      client: new Anthropic({ apiKey: key, baseURL: aiEnv.anthropicBaseUrl, maxRetries: 1 }),
    };
  }
  return globalForAi.lovewallAnthropic.client;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string; code: "off" | "cap" | "failed" };

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

// Models that take the server-side refusal fallback (a declined request is retried on another model, same call).
const FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/;

export async function aiJson<S extends z.ZodType>(opts: {
  spaceId: string;
  feature: Feature;
  model: "fast" | "write";
  system: string;
  content: Content;
  schema: S;
  maxTokens?: number;
  timeoutMs?: number;
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<z.infer<S>>> {
  if (!aiReady()) return { ok: false, error: "AI is off", code: "off" };
  if (!(await reserve(opts.spaceId, opts.feature))) {
    return { ok: false, error: "Daily AI limit reached. Try again tomorrow.", code: "cap" };
  }
  const model = opts.model === "fast" ? aiEnv.fastModel : aiEnv.writeModel;
  try {
    const res = await client().beta.messages.parse(
      {
        model,
        max_tokens: opts.maxTokens ?? (opts.model === "fast" ? 4000 : 16000),
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
        output_config: { effort: opts.effort ?? (opts.model === "fast" ? "low" : "medium"), format: betaZodOutputFormat(opts.schema) },
        ...(FALLBACK.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { timeout: opts.timeoutMs ?? (opts.model === "fast" ? 30_000 : 90_000) },
    );
    await countTokens(opts.spaceId, opts.feature, res.usage.input_tokens ?? 0, res.usage.output_tokens ?? 0);
    if (res.stop_reason === "refusal") return { ok: false, error: "The AI declined this one", code: "failed" };
    if (res.stop_reason === "max_tokens" || res.parsed_output == null)
      return { ok: false, error: "The AI answer was cut short", code: "failed" };
    const checked = opts.schema.safeParse(res.parsed_output);
    if (!checked.success) return { ok: false, error: "The AI answer didn't fit", code: "failed" };
    return { ok: true, data: checked.data };
  } catch (error) {
    return { ok: false, error: message(error), code: "failed" };
  }
}

function message(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "AI is busy. Try again in a minute.";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("AI: the Anthropic key was refused");
    return "AI isn't set up right. Check the API key.";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "AI took too long. Try again.";
  if (error instanceof Anthropic.APIError) {
    console.error(`AI: ${error.status ?? "connection"} ${error.name}`);
    return "AI is unavailable. Try again.";
  }
  console.error("AI:", error instanceof Error ? error.message : error);
  return "AI is unavailable. Try again.";
}

// Untrusted text goes inside tags, so it reads as data, not as instructions.
export function quoteBlock(tag: string, text: string) {
  return `<${tag}>\n${text.replace(new RegExp(`</?${tag}>`, "gi"), "")}\n</${tag}>`;
}
