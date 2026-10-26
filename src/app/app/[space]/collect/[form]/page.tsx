import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormEditor } from "@/components/app/collect/form-editor";
import { fileUrl } from "@/lib/data/files";
import { getForm } from "@/lib/data/forms";
import { loadSpace } from "@/lib/data/load";
import { env } from "@/lib/env";
import { codeStats } from "@/lib/rewards";
import { storageConfigured } from "@/lib/storage";

export const metadata: Metadata = { title: "Form" };

export default async function FormEditorPage(props: PageProps<"/app/[space]/collect/[form]">) {
  const { space: spaceId, form: formId } = await props.params;
  const { space } = await loadSpace(spaceId);
  const form = await getForm(space.id, formId);
  if (!form) notFound();
  return (
    <FormEditor
      key={form.id}
      appUrl={env.appUrl}
      storage={storageConfigured()}
      form={form}
      codes={await codeStats(form.id)}
      space={{ id: space.id, name: space.name, slug: space.slug, logo: fileUrl(space.logo_key), website: space.website }}
    />
  );
}
