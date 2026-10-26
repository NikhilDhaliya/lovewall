import type { PublicForm } from "@/lib/forms";

// The groups a form is made of. "steps" forms show one group at a time; single-page forms show them all.
export type Step =
  | { kind: "experience" } // rating, text or video
  | { kind: "question"; id: string }
  | { kind: "about" } // name, title and company, photo, email, website, consent
  | { kind: "score" } // NPS 0-10
  | { kind: "reason" } // NPS follow-up
  | { kind: "ask" }; // NPS promoters: write a testimonial too?

export function buildSteps(form: PublicForm, opts: { promoter: boolean; optIn: boolean | null; video: boolean }): Step[] {
  const f = form.fields;
  const experience = f.rating !== "off" || f.text !== "off" || (f.video !== "off" && opts.video);
  const questions: Step[] = form.questions.map((q) => ({ kind: "question", id: q.id }));
  if (form.kind === "nps") {
    const steps: Step[] = [{ kind: "score" }, { kind: "reason" }, ...questions];
    if (!opts.promoter) return steps;
    steps.push({ kind: "ask" });
    if (opts.optIn) {
      if (experience) steps.push({ kind: "experience" });
      steps.push({ kind: "about" });
    }
    return steps;
  }
  if (form.kind === "case_study") return [...questions, ...(experience ? [{ kind: "experience" } as Step] : []), { kind: "about" }];
  return [...(experience ? [{ kind: "experience" } as Step] : []), ...questions, { kind: "about" }];
}

export const stepKey = (s: Step) => (s.kind === "question" ? `q:${s.id}` : s.kind);
