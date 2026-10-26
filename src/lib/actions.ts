import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import { widgetIdsOf } from "@/lib/data/spaces";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue?.message && !/^Invalid input|^Expected|^Too (big|small)/.test(issue.message)
    ? issue.message
    : "Check the fields and try again";
}

// Widgets of a space show its testimonials: expire their cached payloads (read-your-own-writes).
export async function refreshWidgets(spaceId: string) {
  for (const id of await widgetIdsOf(spaceId)) updateTag(`widget:${id}`);
}

// Every signed-in action counts against one ceiling per person (on top of each action's own limit), so no action
// can be called in a loop. Throws, and guard() turns it into a plain "too many" answer.
export class LimitError extends Error {}

export async function limitUser(userId: string, bucket = "actions", max = 3000, windowSeconds = 3600) {
  if (!(await rateLimit(`${bucket}:${userId}`, max, windowSeconds)).ok) throw new LimitError("Too many");
}

// Wraps an action body: unexpected errors become a generic message instead of leaking internals.
export async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && error.message === "Signed out") return fail("You're signed out. Sign in again.");
    if (error instanceof LimitError) return fail("Too many changes. Try again later.");
    if (error instanceof Error && "digest" in error) throw error; // redirect() / notFound()
    logError("action", error);
    return fail("Something went wrong. Try again.");
  }
}
