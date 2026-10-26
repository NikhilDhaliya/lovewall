import { after } from "next/server";
import { z } from "zod";
import { settleSpam } from "@/lib/ai/jobs";
import { one, tx } from "@/lib/db";
import { claimUploads, UploadError, verifyUpload } from "@/lib/data/files";
import { ensureDefaultForm, getForm } from "@/lib/data/forms";
import { env } from "@/lib/env";
import {
  checkAnswers,
  CONSENT_VERSION,
  EMAIL_RE,
  isHttpUrl,
  liveQuestions,
  normalizeUrl,
  NPS_REASON_ID,
  NPS_SCORE_ID,
  type Answers,
  type RewardResult,
} from "@/lib/forms";
import { checkFormToken } from "@/lib/form-token";
import { formLanguage } from "@/lib/i18n/collect";
import { isLang, t } from "@/lib/i18n/collect/languages";
import { newId } from "@/lib/ids";
import { findInvite, markSubmitted } from "@/lib/invites";
import { ipKey } from "@/lib/ip";
import { appLink, newTestimonialMail, npsMail, type Mail } from "@/lib/mail";
import { enqueue, flushOne } from "@/lib/outbox";
import { consentPage } from "@/lib/privacy";
import { giverReceipt } from "@/lib/privacy-mail";
import { rateLimitAll, tooMany } from "@/lib/rate-limit";
import { grantReward, rewardEmail } from "@/lib/rewards";
import type { Space } from "@/lib/types";
import { optionalLine, ratingSchema, textSchema } from "@/lib/validation";
import { emitTestimonialEvent } from "@/lib/webhooks";

const answer = z.union([z.string().max(3200), z.number(), z.boolean(), z.array(z.string().max(100)).max(12)]);

const body = z.object({
  formId: z
    .string()
    .regex(/^[0-9A-Za-z]{8,32}$/)
    .nullable()
    .optional(),
  rating: ratingSchema,
  text: textSchema.optional().default(""),
  name: optionalLine(80),
  title: optionalLine(80),
  company: optionalLine(80),
  email: z.string().trim().max(254).nullable().optional(),
  homepage: z.string().trim().max(300).nullable().optional(),
  avatarKey: z.string().max(200).nullable().optional(),
  videoKey: z.string().max(200).nullable().optional(),
  posterKey: z.string().max(200).nullable().optional(),
  videoAspect: z.number().min(0.2).max(5).nullable().optional(),
  answers: z
    .record(z.string().max(24), answer)
    .refine((a) => Object.keys(a).length <= 24)
    .optional()
    .default({}),
  nps: z.object({ score: z.number().int().min(0).max(10), comment: textSchema.optional().default("") }).optional(),
  // NPS forms: whether a promoter also wrote a testimonial.
  testimonial: z.boolean().optional().default(true),
  consent: z.boolean().optional().default(false),
  invite: z.string().max(80).nullable().optional(),
  // The language the page was shown in (for "visitor's browser" forms), so the consent record says what they read.
  lang: z.string().max(5).optional(),
  token: z.string().max(100),
  // Honeypot: a field people never see. Bots fill it.
  website: z.string().max(500).optional(),
});

function error(message: string, status = 400, code?: string) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

function queue(mails: (Mail | null)[]) {
  const list = mails.filter((m): m is Mail => Boolean(m));
  if (!list.length) return;
  after(async () => {
    for (const mail of list) {
      const id = await enqueue(mail).catch(() => null);
      if (id) await flushOne(id).catch(() => {});
    }
  });
}

// Public: a visitor submits a form (a testimonial, an NPS answer or a case study).
export async function POST(request: Request, ctx: RouteContext<"/api/collect/[space]">) {
  const { space: spaceId } = await ctx.params;
  if (!/^[0-9A-Za-z]{8,32}$/.test(spaceId)) return error("Not found", 404);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 64 * 1024) return error("Too large", 413);
  const raw = await request.text().catch(() => "");
  if (raw.length > 64 * 1024) return error("Too large", 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return error("Bad request");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path?.[0] ?? "");
    return field === "text" ? error("That's a bit long", 400, "text") : error("Check the form and try again");
  }
  const d = parsed.data;

  // Bots: honeypot filled, or the form came back faster than anyone could write. Pretend it worked.
  const stamp = checkFormToken(spaceId, d.token);
  if (d.website || stamp === "fast") return Response.json({ ok: true });
  if (stamp === "bad") return error("This form expired. Reload the page and try again.", 400, "expired");

  const ip = ipKey(request.headers);
  const limit = await rateLimitAll([
    [`submit:ip-space:${ip}:${spaceId}`, 4, 600],
    [`submit:ip:${ip}`, 12, 3600],
    [`submit:space:${spaceId}`, env.maxTestimonialsPerDay, 86400],
  ]);
  if (!limit.ok) return tooMany(limit);

  const space = await one<Space & { owner_email: string }>(
    `select s.*, u.email as owner_email from spaces s join auth_users u on u.id = s.owner_id where s.id = $1`,
    [spaceId],
  );
  if (!space) return error("Not found", 404);
  const form = d.formId ? await getForm(spaceId, d.formId) : await ensureDefaultForm(space);
  if (!form) return error("Not found", 404);

  const f = form.fields;
  const nps = form.kind === "nps";
  if (nps && !d.nps) return error("Pick a score", 400, "score");
  const promoter = nps && d.nps!.score >= 9;
  // NPS answers become a testimonial only when a promoter chose to write one; everything else stays feedback.
  const testimonial = !nps || (promoter && d.testimonial === true);

  const checked = checkAnswers(liveQuestions(form.questions), d.answers);
  if (!checked.ok) return error("Answer every required question", 400, checked.error === "invalid" ? "required" : checked.error);
  const answers: Answers = checked.answers;

  const invite = d.invite ? await findInvite(d.invite, spaceId) : null;

  let email: string | null = null;
  if (f.email !== "off" && d.email) {
    if (!EMAIL_RE.test(d.email.toLowerCase())) return error("Enter a valid email", 400, "email");
    email = d.email.toLowerCase();
  }
  if (f.email === "required" && !email) return error("Enter a valid email", 400, "email");
  email = email ?? invite?.email ?? null;

  let homepage: string | null = null;
  if (f.website !== "off" && d.homepage) {
    if (!isHttpUrl(d.homepage)) return error("Enter a valid link", 400, "url");
    homepage = normalizeUrl(d.homepage).slice(0, 300);
  }
  if (testimonial && f.website === "required" && !homepage) return error("Enter a valid link", 400, "url");

  const name = f.name === "off" ? null : d.name;
  const title = f.role === "off" ? null : d.title;
  const company = f.role === "off" ? null : d.company;
  const text = f.text === "off" ? "" : d.text;

  if (testimonial) {
    if (f.name === "required" && !name) return error("Add your name", 400, "name");
    if (f.role === "required" && (!title || !company)) return error("Add your title and company", 400, "required");
    if (d.videoKey && f.video === "off") return error("Video is off for this page");
    if (d.avatarKey && f.photo === "off") return error("Photos are off for this page");
    if (f.video === "required" && !d.videoKey) return error("Record or upload a video", 400, "video");
    if (f.text === "required" && !text && !d.videoKey) return error("Write a few words or record a video", 400, "text");
    if (f.rating === "required" && !d.rating) return error("Pick a rating", 400, "rating");
    if (!text && !d.videoKey && !d.rating && !Object.keys(answers).length) return error("Write a few words or record a video", 400, "text");
    if (!d.consent) return error("Please tick the box to agree", 400, "consent");
  }

  let avatar: string | null = null,
    video: string | null = null,
    poster: string | null = null;
  if (testimonial) {
    try {
      avatar = await verifyUpload(spaceId, "avatar", d.avatarKey);
      video = await verifyUpload(spaceId, "video", d.videoKey);
      poster = video ? await verifyUpload(spaceId, "poster", d.posterKey) : null;
    } catch (e) {
      if (e instanceof UploadError) return error(e.message);
      throw e;
    }
  }

  // The consent exactly as it was shown: same language, same wording, photo or not.
  const { lang, dict } = formLanguage(
    form.language === "auto" && d.lang && isLang(d.lang) ? d.lang : form.language,
    request.headers.get("accept-language"),
  );
  const consentText = t(dict, avatar ? "consentPhoto" : "consent", { space: space.name });

  const testimonialId = testimonial ? newId(12) : null;
  const responseId = nps ? newId(12) : null;
  const stored: Answers =
    nps && testimonial
      ? { ...answers, [NPS_SCORE_ID]: d.nps!.score, ...(d.nps!.comment ? { [NPS_REASON_ID]: d.nps!.comment } : {}) }
      : answers;
  await tx(async (c) => {
    if (testimonialId) {
      await c.query(
        `insert into testimonials (id, space_id, form_id, status, source, rating, text, name, title, company, email, website, answers,
                                   avatar_key, video_key, poster_key, video_aspect, consent, consent_text, consent_version, consent_at, consent_lang, consent_url)
         values ($1, $2, $3, 'new', 'Form', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, $16, $17, now(), $18, $19)`,
        [
          testimonialId,
          spaceId,
          form.id,
          f.rating === "off" ? null : d.rating,
          text,
          name || "Anonymous",
          title,
          company,
          email,
          homepage,
          JSON.stringify(stored),
          avatar,
          video,
          poster,
          video ? (d.videoAspect ?? null) : null,
          consentText,
          CONSENT_VERSION,
          lang,
          consentPage(request.headers.get("referer")),
        ],
      );
      await claimUploads([avatar, video, poster], c);
    }
    if (responseId) {
      await c.query(
        `insert into nps_responses (id, space_id, form_id, score, comment, name, email, answers, testimonial_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [responseId, spaceId, form.id, d.nps!.score, d.nps!.comment, name, email, JSON.stringify(answers), testimonialId],
      );
    }
  });
  if (invite) await markSubmitted(invite.id, testimonialId);
  if (testimonialId) await emitTestimonialEvent(spaceId, "testimonial.created", [testimonialId]);

  const reward: RewardResult | null = await grantReward({ spaceId, form, testimonialId, responseId, email });

  const ownerMail: Mail | null = !space.notify
    ? null
    : testimonialId
      ? newTestimonialMail({
          to: space.owner_email,
          space: space.name,
          name: name || "Anonymous",
          text,
          rating: d.rating,
          video: Boolean(video),
          url: appLink(`/app/${spaceId}`),
        })
      : npsMail({
          to: space.owner_email,
          space: space.name,
          score: d.nps!.score,
          comment: d.nps!.comment,
          url: appLink(`/app/${spaceId}/collect/${form.id}/results`),
        });
  // The owner hears about a testimonial once the spam filter (when AI is on) has looked at it: spam is hidden, not mailed.
  if (ownerMail) {
    after(async () => {
      if (testimonialId && (await settleSpam(spaceId, testimonialId).catch(() => false))) return;
      const id = await enqueue(ownerMail).catch(() => null);
      if (id) await flushOne(id).catch(() => {});
    });
  }
  const mails: (Mail | null)[] = [];
  // The giver's receipt: a private link to see, change or delete what they sent.
  if (email && testimonialId) mails.push(await giverReceipt({ testimonialId, to: email, space: space.name, dict }));
  // Codes and links are emailed too, so they aren't lost with the tab. A wheel's prize is emailed after the spin.
  if (email && reward && reward.type !== "wheel") {
    mails.push(
      rewardEmail({
        to: email,
        space: space.name,
        subject: t(dict, "mailRewardSubject", { space: space.name }),
        intro: dict.mailRewardIntro,
        prize:
          reward.type === "code"
            ? { kind: "code", value: reward.code, label: reward.label }
            : { kind: "link", value: reward.url, label: reward.label },
      }),
    );
  }
  queue(mails);
  return Response.json({ ok: true, id: testimonialId ?? responseId, reward });
}
