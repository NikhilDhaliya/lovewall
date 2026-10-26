import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CaseStudies, NpsResults } from "@/components/app/collect/results";
import { aiReady } from "@/lib/ai/client";
import { writtenDrafts } from "@/lib/ai/case-study";
import { caseStudyDraft } from "@/lib/case-study";
import { formTestimonials, getForm, npsResponses } from "@/lib/data/forms";
import { loadSpace } from "@/lib/data/load";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Results" };

// NPS: the score and the comments by group. Case studies: each submission as a readable story.
export default async function FormResultsPage(props: PageProps<"/app/[space]/collect/[form]/results">) {
  const { space: spaceId, form: formId } = await props.params;
  const { space } = await loadSpace(spaceId);
  const form = await getForm(space.id, formId);
  if (!form) notFound();
  if (form.kind === "testimonial") redirect(`/app/${space.id}/collect/${form.id}`);
  const url = `${env.appUrl}/${space.slug}${form.isDefault ? "" : `/${form.slug}`}`;
  if (form.kind === "nps") {
    return <NpsResults spaceId={space.id} formId={form.id} name={form.name} url={url} responses={await npsResponses(space.id, form.id)} />;
  }
  const rows = await formTestimonials(space.id, form.id);
  // AI: drafts written from the answers (the seam in src/lib/case-study.ts), only when a key is set.
  const ai = aiReady();
  const written = ai
    ? await writtenDrafts(
        space.id,
        rows.map((t) => t.id),
      )
    : new Map();
  const studies = rows.map((t) => ({
    id: t.id,
    date: new Date(t.given_at).toISOString(),
    draft: caseStudyDraft(t, form.questions, space.name),
    written: written.get(t.id)?.draft ?? null,
  }));
  return <CaseStudies spaceId={space.id} formId={form.id} name={form.name} url={url} studies={studies} ai={ai} />;
}
