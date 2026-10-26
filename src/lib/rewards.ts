import "server-only";
import { randomInt } from "node:crypto";
import { one, q } from "@/lib/db";
import { pickPrize, type FormConfig, type Prize, type RewardResult, type SpinResult } from "@/lib/forms";
import { newId } from "@/lib/ids";
import { rewardMail, type Mail } from "@/lib/mail";
import { hashToken, newToken } from "@/lib/tokens";

// Rewards are decided and handed out on the server only, once per submission. Coupon codes from a list are claimed
// with SKIP LOCKED, so two visitors never get the same code. A wheel is spun once; the result is stored.

type Grant = { spaceId: string; form: FormConfig; testimonialId: string | null; responseId: string | null; email: string | null };

type ClaimPrize = { options: Prize[]; index: number | null };

async function record(g: Grant, kind: "coupon" | "link" | "wheel", prize: unknown, tokenHash: string | null = null) {
  await q(
    `insert into reward_claims (id, space_id, form_id, testimonial_id, response_id, kind, token_hash, prize, email)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [newId(16), g.spaceId, g.form.id, g.testimonialId, g.responseId, kind, tokenHash, JSON.stringify(prize), g.email],
  );
}

export async function grantReward(g: Grant): Promise<RewardResult | null> {
  const r = g.form.reward;
  if (r.type === "coupon") {
    let code = r.mode === "fixed" ? r.code : null;
    if (r.mode === "list") {
      const row = await one<{ code: string }>(
        `update reward_codes set claimed_at = now()
         where id = (select id from reward_codes where form_id = $1 and claimed_at is null order by id limit 1 for update skip locked)
         returning code`,
        [g.form.id],
      );
      code = row?.code ?? null;
    }
    if (!code) return null;
    await record(g, "coupon", { kind: "code", value: code, label: r.label });
    return { type: "code", code, label: r.label };
  }
  if (r.type === "link") {
    if (!r.url) return null;
    await record(g, "link", { kind: "link", value: r.url, label: r.label });
    return { type: "link", url: r.url, label: r.label };
  }
  if (r.type === "wheel") {
    const options = r.prizes.slice(0, 8);
    if (options.length < 2) return null;
    // The visitor holds a random token; only its hash is stored. The prizes are kept as they were at this moment.
    const token = newToken();
    await record(g, "wheel", { options, index: null } satisfies ClaimPrize, hashToken(token));
    return { type: "wheel", claim: token, prizes: options.map((p) => p.label) };
  }
  return null;
}

// Spins a wheel claim once. A second call returns the same result. Null: no such claim (or it expired).
type Spun = { result: SpinResult; email: string | null; first: boolean; space: string; language: string };

export async function spin(spaceId: string, token: string): Promise<Spun | null> {
  const hash = hashToken(token);
  const claim = await one<{ id: string; prize: ClaimPrize; email: string | null; space: string; language: string }>(
    `select c.id, c.prize, c.email, s.name as space, f.language
     from reward_claims c join spaces s on s.id = c.space_id join forms f on f.id = c.form_id
     where c.token_hash = $1 and c.space_id = $2 and c.kind = 'wheel' and c.created_at > now() - interval '1 day'`,
    [hash, spaceId],
  );
  if (!claim?.prize?.options?.length) return null;
  const toResult = (p: ClaimPrize): SpinResult => {
    const prize = p.options[p.index!];
    return { index: p.index!, prize: { label: prize.label, kind: prize.kind, value: prize.kind === "none" ? "" : prize.value } };
  };
  const base = { email: claim.email, space: claim.space, language: claim.language };
  if (claim.prize.index !== null) return { ...base, result: toResult(claim.prize), first: false };
  const index = pickPrize(claim.prize.options, randomInt(0, 2 ** 32) / 2 ** 32);
  const picked = { ...claim.prize, index };
  const won = await one<{ prize: ClaimPrize }>(
    "update reward_claims set prize = $2, spun_at = now() where id = $1 and spun_at is null returning prize",
    [claim.id, JSON.stringify(picked)],
  );
  if (won) return { ...base, result: toResult(won.prize), first: true };
  // Another request spun it a moment ago: return what it got.
  const again = await one<{ prize: ClaimPrize }>("select prize from reward_claims where id = $1", [claim.id]);
  return again && again.prize.index !== null ? { ...base, result: toResult(again.prize), first: false } : null;
}

// The reward again by email (codes and links; a wheel's prize after the spin).
export function rewardEmail(opts: {
  to: string;
  space: string;
  subject: string;
  intro: string;
  prize: { kind: "code" | "link" | "none"; value: string; label: string };
}): Mail | null {
  if (opts.prize.kind === "none" || !opts.prize.value) return null;
  return rewardMail({ ...opts, kind: opts.prize.kind, value: opts.prize.value, label: opts.prize.label });
}

export async function codeStats(formId: string) {
  const row = await one<{ left: number; used: number }>(
    "select count(*) filter (where claimed_at is null)::int as left, count(*) filter (where claimed_at is not null)::int as used from reward_codes where form_id = $1",
    [formId],
  );
  return row ?? { left: 0, used: 0 };
}
