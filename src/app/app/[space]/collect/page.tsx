import type { Metadata } from "next";
import { FormsList } from "@/components/app/collect/forms-list";
import { aiReady } from "@/lib/ai/client";
import { ensureDefaultForm, listForms } from "@/lib/data/forms";
import { loadSpace } from "@/lib/data/load";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Collect" };

export default async function CollectFormsPage(props: PageProps<"/app/[space]/collect">) {
  const { space: spaceId } = await props.params;
  const { space } = await loadSpace(spaceId);
  await ensureDefaultForm(space);
  return <FormsList spaceId={space.id} spaceSlug={space.slug} appUrl={env.appUrl} forms={await listForms(space.id)} ai={aiReady()} />;
}
