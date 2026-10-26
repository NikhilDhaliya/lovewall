import { answerText, type Answers, type Question } from "@/lib/forms";

// A case study from one submission: sections in a fixed order, the key number, the quote. Plain module.
//
// Seam for an AI writer: it takes a CaseStudyDraft and returns a better-written one of the same shape, so the view
// and the Markdown export don't change. Until then the draft is the visitor's own words.
export type CaseStudyDraft = {
  title: string;
  person: { name: string; title: string | null; company: string | null };
  metric: string | null;
  sections: { id: string; heading: string; body: string }[];
  quote: string | null;
};

export type CaseStudyWriter = (draft: CaseStudyDraft) => Promise<CaseStudyDraft>;

const HEADINGS: Record<string, string> = { challenge: "The challenge", before: "Before", solution: "The solution", results: "The results" };

export function caseStudyDraft(
  t: { name: string; title: string | null; company: string | null; text: string; answers: Answers },
  questions: Question[],
  space: string,
): CaseStudyDraft {
  const sections: CaseStudyDraft["sections"] = [];
  for (const q of questions) {
    const v = t.answers[q.id];
    if (q.id === "metric" || v === undefined || v === "") continue;
    sections.push({ id: q.id, heading: HEADINGS[q.id] ?? q.label, body: answerText(v) });
  }
  const metric = t.answers.metric !== undefined ? answerText(t.answers.metric) : null;
  const who = t.company || t.name;
  return {
    title: `${who} and ${space}`,
    person: { name: t.name, title: t.title, company: t.company },
    metric: metric || null,
    sections,
    quote: t.text.trim() || null,
  };
}

export function caseStudyMarkdown(d: CaseStudyDraft): string {
  const role = [d.person.title, d.person.company].filter(Boolean).join(", ");
  const out = [`# ${d.title}`, "", `**${d.person.name}**${role ? `, ${role}` : ""}`];
  if (d.metric) out.push("", `> **${d.metric}**`);
  for (const s of d.sections) out.push("", `## ${s.heading}`, "", s.body);
  if (d.quote) out.push("", `> “${d.quote.replace(/\n+/g, " ")}”`, `> — ${d.person.name}`);
  return `${out.join("\n")}\n`;
}
