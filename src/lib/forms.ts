import { z } from "zod";
import { RESERVED_SLUGS } from "@/lib/validation";

// Collect forms: the shape stored in `forms`, its defaults, and the checks shared by the editor, the public page and
// the submit API. Plain module (no server imports): the browser uses it too.

export const FORM_KINDS = ["testimonial", "nps", "case_study"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export const FIELD_KEYS = ["rating", "text", "video", "name", "role", "photo", "email", "website"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export const FIELD_MODES = ["off", "optional", "required"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];
export type Fields = Record<FieldKey, FieldMode>;

export const QUESTION_TYPES = ["short", "long", "rating", "yesno", "single", "multiple", "email", "url"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type Question = { id: string; type: QuestionType; label: string; required: boolean; options: string[] };
export type Answer = string | number | boolean | string[];
export type Answers = Record<string, Answer>;

export type Thanks = { title: string; text: string; buttonLabel: string; buttonUrl: string };

export const PRIZE_KINDS = ["code", "link", "none"] as const;
export type Prize = { label: string; kind: (typeof PRIZE_KINDS)[number]; value: string; weight: number };
export const REWARD_TYPES = ["none", "coupon", "link", "wheel"] as const;
export type RewardType = (typeof REWARD_TYPES)[number];
// One flat shape for every reward type, so switching types in the editor keeps what was typed.
export type Reward = { type: RewardType; mode: "fixed" | "list"; code: string; url: string; label: string; prizes: Prize[] };

export type Layout = "single" | "steps";

export type FormConfig = {
  id: string;
  spaceId: string;
  kind: FormKind;
  isDefault: boolean;
  slug: string;
  name: string;
  title: string;
  prompt: string;
  hints: string[];
  fields: Fields;
  questions: Question[];
  layout: Layout;
  thanks: Thanks;
  language: string;
  reward: Reward;
  followup: string;
};

export const KIND_LABEL: Record<FormKind, string> = { testimonial: "Testimonial", nps: "NPS survey", case_study: "Case study" };

export const QUESTION_LABEL: Record<QuestionType, string> = {
  short: "Short text",
  long: "Long text",
  rating: "Rating",
  yesno: "Yes or no",
  single: "One choice",
  multiple: "Several choices",
  email: "Email",
  url: "Link",
};

export const FIELD_LABEL: Record<FieldKey, string> = {
  rating: "Rating",
  text: "Text",
  video: "Video",
  name: "Name",
  role: "Title and company",
  photo: "Photo",
  email: "Email",
  website: "Website",
};

// Bump when the consent wording changes: every testimonial records the text it was given with, and this version.
export const CONSENT_VERSION = "2026-10-27";

// NPS answers are kept with the testimonial a promoter writes, under these ids.
export const NPS_SCORE_ID = "nps_score";
export const NPS_REASON_ID = "nps_reason";

const BASE_FIELDS: Fields = {
  rating: "optional",
  text: "required",
  video: "optional",
  name: "required",
  role: "optional",
  photo: "optional",
  email: "off",
  website: "off",
};

export function defaultFields(kind: FormKind): Fields {
  if (kind === "case_study") return { ...BASE_FIELDS, rating: "off", text: "optional", video: "off", role: "required", email: "optional" };
  if (kind === "nps") return { ...BASE_FIELDS, rating: "off" };
  return { ...BASE_FIELDS };
}

// The case-study question set. Stable ids, so the case-study view can lay answers out as sections.
export const CASE_STUDY_IDS = ["challenge", "before", "solution", "results", "metric"] as const;

export function caseStudyQuestions(space: string): Question[] {
  return [
    { id: "challenge", type: "long", label: "What challenge were you facing?", required: true, options: [] },
    { id: "before", type: "long", label: "How did you handle it before?", required: false, options: [] },
    { id: "solution", type: "long", label: `How did ${space} help?`, required: true, options: [] },
    { id: "results", type: "long", label: "What results did you get?", required: true, options: [] },
    { id: "metric", type: "short", label: "One number that sums it up", required: false, options: [] },
  ];
}

export function emptyReward(): Reward {
  return {
    type: "none",
    mode: "fixed",
    code: "",
    url: "",
    label: "",
    prizes: [
      { label: "10% off", kind: "code", value: "", weight: 1 },
      { label: "Try again", kind: "none", value: "", weight: 3 },
    ],
  };
}

// What a new form of each kind starts with.
export function formDefaults(kind: FormKind, space: string) {
  if (kind === "nps") {
    return {
      name: "NPS survey",
      slug: "nps",
      title: `How likely are you to recommend ${space} to a friend?`,
      followup: "What’s the main reason for your score?",
      layout: "steps" as Layout,
      questions: [] as Question[],
    };
  }
  if (kind === "case_study") {
    return {
      name: "Case study",
      slug: "case-study",
      title: `Tell your story with ${space}`,
      followup: "",
      layout: "steps" as Layout,
      questions: caseStudyQuestions(space),
    };
  }
  return {
    name: "Testimonials",
    slug: "testimonials",
    title: `What do you love about ${space}?`,
    followup: "",
    layout: "single" as Layout,
    questions: [],
  };
}

// ---------- Parsing stored rows (lenient: anything unexpected falls back to a default) ----------

const mode = z.enum(FIELD_MODES);
const str = (max: number) => z.string().max(max).catch("");

export function parseFields(raw: unknown, kind: FormKind): Fields {
  const base = defaultFields(kind);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...base };
  for (const key of FIELD_KEYS) {
    const v = mode.safeParse(obj[key]);
    if (v.success) out[key] = v.data;
  }
  return out;
}

const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,24}$/),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().max(200),
  required: z.boolean().catch(false),
  options: z.array(z.string().trim().max(80)).max(12).catch([]),
});

export function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 20)) {
    const q = questionSchema.safeParse(item);
    if (q.success && !seen.has(q.data.id)) {
      seen.add(q.data.id);
      out.push(q.data);
    }
  }
  return out;
}

const prizeSchema = z.object({
  label: str(40),
  kind: z.enum(PRIZE_KINDS).catch("none"),
  value: str(500),
  weight: z.number().int().min(0).max(100).catch(1),
});

export function parseReward(raw: unknown): Reward {
  const base = emptyReward();
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prizes = Array.isArray(obj.prizes)
    ? obj.prizes
        .slice(0, 8)
        .map((p) => prizeSchema.safeParse(p))
        .filter((p) => p.success)
        .map((p) => p.data)
    : [];
  return {
    type: z.enum(REWARD_TYPES).catch("none").parse(obj.type),
    mode: z.enum(["fixed", "list"]).catch("fixed").parse(obj.mode),
    code: str(80).parse(obj.code ?? ""),
    url: str(500).parse(obj.url ?? ""),
    label: str(60).parse(obj.label ?? ""),
    prizes: prizes.length >= 2 ? prizes : base.prizes,
  };
}

export function parseThanks(raw: unknown): Thanks {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: str(120).parse(obj.title ?? ""),
    text: str(400).parse(obj.text ?? ""),
    buttonLabel: str(40).parse(obj.buttonLabel ?? ""),
    buttonUrl: str(500).parse(obj.buttonUrl ?? ""),
  };
}

export type FormRow = {
  id: string;
  space_id: string;
  kind: FormKind;
  is_default: boolean;
  slug: string;
  name: string;
  title: string;
  prompt: string;
  hints: unknown;
  fields: unknown;
  questions: unknown;
  layout: Layout;
  thanks: unknown;
  language: string;
  reward: unknown;
  followup: string;
};

export function toFormConfig(row: FormRow): FormConfig {
  const kind = FORM_KINDS.includes(row.kind) ? row.kind : "testimonial";
  return {
    id: row.id,
    spaceId: row.space_id,
    kind,
    isDefault: row.is_default,
    slug: row.slug,
    name: row.name,
    title: row.title,
    prompt: row.prompt,
    hints: Array.isArray(row.hints) ? row.hints.filter((h): h is string => typeof h === "string").slice(0, 6) : [],
    fields: parseFields(row.fields, kind),
    questions: parseQuestions(row.questions),
    // NPS and case studies always go one step at a time.
    layout: kind === "testimonial" ? (row.layout === "steps" ? "steps" : "single") : "steps",
    thanks: parseThanks(row.thanks),
    language: row.language || "en",
    reward: parseReward(row.reward),
    followup: row.followup,
  };
}

// ---------- Answers ----------

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function isHttpUrl(s: string) {
  // Another scheme ("javascript:alert(1)//@a.b") is refused outright, not read as a host name.
  if (/^\s*[a-z][a-z0-9+-]*:/i.test(s) && !/^\s*https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function normalizeUrl(s: string) {
  const v = s.trim();
  return v && !/^https?:\/\//i.test(v) ? `https://${v}` : v;
}

const clean = (s: string, max: number, multiline = false) =>
  (multiline
    ? s
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .replace(/\n{3,}/g, "\n\n")
    : s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s{2,}/g, " ")
  )
    .trim()
    .slice(0, max);

export function isEmptyAnswer(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

// Checks one answer against its question. Returns the cleaned value, null for "not answered", or an error key.
export function checkAnswer(q: Question, raw: unknown): { value: Answer | null } | { error: "required" | "email" | "url" | "invalid" } {
  if (isEmptyAnswer(raw)) return q.required ? { error: "required" } : { value: null };
  switch (q.type) {
    case "short":
    case "long": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = clean(raw, q.type === "long" ? 3000 : 300, q.type === "long");
      return v ? { value: v } : q.required ? { error: "required" } : { value: null };
    }
    case "email": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = raw.trim().toLowerCase().slice(0, 254);
      return EMAIL_RE.test(v) ? { value: v } : { error: "email" };
    }
    case "url": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = normalizeUrl(raw).slice(0, 500);
      return isHttpUrl(v) ? { value: v } : { error: "url" };
    }
    case "rating":
      return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 5 ? { value: raw } : { error: "invalid" };
    case "yesno":
      return typeof raw === "boolean" ? { value: raw } : { error: "invalid" };
    case "single":
      return typeof raw === "string" && q.options.includes(raw) ? { value: raw } : { error: "invalid" };
    case "multiple": {
      if (!Array.isArray(raw) || !raw.every((x) => typeof x === "string" && q.options.includes(x))) return { error: "invalid" };
      const v = q.options.filter((o) => raw.includes(o));
      return v.length ? { value: v } : q.required ? { error: "required" } : { value: null };
    }
  }
}

// Every question of a form: unknown keys are dropped, required ones must be there.
export function checkAnswers(
  questions: Question[],
  raw: unknown,
): { ok: true; answers: Answers } | { ok: false; id: string; error: "required" | "email" | "url" | "invalid" } {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: Answers = {};
  for (const q of questions) {
    const res = checkAnswer(q, obj[q.id]);
    if ("error" in res) return { ok: false, id: q.id, error: res.error };
    if (res.value !== null) answers[q.id] = res.value;
  }
  return { ok: true, answers };
}

export function answerText(v: Answer, yes = "Yes", no = "No"): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? yes : no;
  return String(v);
}

// ---------- NPS ----------

export type NpsGroup = "promoter" | "passive" | "detractor";

export function npsGroup(score: number): NpsGroup {
  return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
}

// Net Promoter Score: % promoters minus % detractors, -100 to 100. Null with no answers.
export function npsScore(c: { promoters: number; passives: number; detractors: number }): number | null {
  const total = c.promoters + c.passives + c.detractors;
  if (!total) return null;
  return Math.round(((c.promoters - c.detractors) / total) * 100);
}

// ---------- Spin the wheel ----------

// Picks a prize by weight. `rand` is in [0, 1). Prizes with weight 0 never win (unless every weight is 0).
export function pickPrize(prizes: Prize[], rand: number): number {
  const total = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (total <= 0) return Math.min(prizes.length - 1, Math.floor(rand * prizes.length));
  let at = rand * total;
  for (let i = 0; i < prizes.length; i++) {
    at -= Math.max(0, prizes[i].weight);
    if (at < 0) return i;
  }
  return prizes.length - 1;
}

// ---------- Editor input (server-validated) ----------

const slugRe = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const formPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Add a name").max(60),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "At least 2 characters")
      .max(40, "At most 40 characters")
      .regex(slugRe, "Letters, numbers and dashes")
      .refine((s) => !RESERVED_SLUGS.has(s), "That link is taken"),
    title: z.string().trim().max(160, "At most 160 characters"),
    prompt: z.string().trim().max(400, "At most 400 characters"),
    hints: z
      .array(z.string().trim().max(140))
      .max(6)
      .transform((a) => a.filter(Boolean)),
    fields: z.record(z.enum(FIELD_KEYS), z.enum(FIELD_MODES)),
    questions: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9_]{1,24}$/),
          type: z.enum(QUESTION_TYPES),
          label: z.string().trim().max(200, "Questions: at most 200 characters"),
          required: z.boolean(),
          options: z.array(z.string().trim().max(80, "Choices: at most 80 characters")).max(12, "At most 12 choices"),
        }),
      )
      .max(20, "At most 20 questions"),
    layout: z.enum(["single", "steps"]),
    thanks: z.object({
      title: z.string().trim().max(120),
      text: z.string().trim().max(400),
      buttonLabel: z.string().trim().max(40),
      buttonUrl: z
        .string()
        .trim()
        .max(500)
        .refine((s) => !s || isHttpUrl(s), "Thank-you button: not a valid link")
        .transform((s) => (s ? normalizeUrl(s) : "")),
    }),
    language: z.string().regex(/^(auto|[a-z]{2})$/),
    reward: z.object({
      type: z.enum(REWARD_TYPES),
      mode: z.enum(["fixed", "list"]),
      code: z.string().trim().max(80),
      url: z
        .string()
        .trim()
        .max(500)
        .refine((s) => !s || isHttpUrl(s), "Reward: not a valid link")
        .transform((s) => (s ? normalizeUrl(s) : "")),
      label: z.string().trim().max(60),
      prizes: z
        .array(
          z
            .object({
              label: z.string().trim().max(40),
              kind: z.enum(PRIZE_KINDS),
              value: z.string().trim().max(500),
              weight: z.number().int().min(0).max(100),
            })
            // Link prizes are web links only (never javascript: or data: URLs).
            .refine((p) => p.kind !== "link" || !p.value || isHttpUrl(p.value), "Prize: not a valid link")
            .transform((p) => (p.kind === "link" && p.value ? { ...p, value: normalizeUrl(p.value) } : p)),
        )
        .min(2, "The wheel needs 2 to 8 prizes")
        .max(8, "The wheel needs 2 to 8 prizes"),
    }),
    followup: z.string().trim().max(200),
  })
  .partial();

export type FormPatch = z.input<typeof formPatchSchema>;

// ---------- What the public page gets ----------

// The client-safe part of a form: no reward codes or links (those are revealed only after a submission).
export type PublicForm = Pick<
  FormConfig,
  "id" | "kind" | "title" | "prompt" | "hints" | "fields" | "questions" | "layout" | "thanks" | "followup"
>;

export function toPublicForm(f: FormConfig): PublicForm {
  const { id, kind, title, prompt, hints, fields, layout, thanks, followup } = f;
  return { id, kind, title, prompt, hints, fields, questions: liveQuestions(f.questions), layout, thanks, followup };
}

// Questions a visitor can answer: half-written ones (no label, or a choice without choices) stay in the editor.
export function liveQuestions(questions: Question[]): Question[] {
  return questions
    .map((q) => ({ ...q, options: q.options.filter(Boolean) }))
    .filter((q) => q.label.trim() && (q.type !== "single" && q.type !== "multiple" ? true : q.options.length > 0));
}

// What a visitor is given after submitting. A wheel has no prize yet: the server picks it when they spin.
export type RewardResult =
  | { type: "code"; code: string; label: string }
  | { type: "link"; url: string; label: string }
  | { type: "wheel"; claim: string; prizes: string[] };

export type SpinResult = { index: number; prize: { label: string; kind: Prize["kind"]; value: string } };
