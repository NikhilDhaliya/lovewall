import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { CollectPage } from "@/components/collect/collect-page";
import { getFormBySlug } from "@/lib/data/forms";
import { getSpaceBySlug } from "@/lib/data/spaces";
import { pageAllowed } from "@/lib/rate-limit";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";

const load = cache(async (slug: string, formSlug: string) => {
  if (!(await pageAllowed("collect", 300, 600))) return null;
  const space = await getSpaceBySlug(slug.toLowerCase());
  const form = space ? await getFormBySlug(space.id, formSlug.toLowerCase()) : null;
  return space && form ? { space, form } : null;
});

export async function generateMetadata(props: PageProps<"/[slug]/[form]">): Promise<Metadata> {
  const { slug, form } = await props.params;
  const found = await load(slug, form);
  if (!found) return { title: "Not found" };
  const { dict } = formLanguage(found.form.language, (await headers()).get("accept-language"));
  const title = t(dict, "metaTitle", { space: found.space.name });
  const description = found.form.title || t(dict, "defaultTitle", { space: found.space.name });
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

// Any other form of a space: /<space-slug>/<form-slug>.
export default async function FormPage(props: PageProps<"/[slug]/[form]">) {
  await connection();
  const { slug, form: formSlug } = await props.params;
  const found = await load(slug, formSlug);
  if (!found) notFound();
  const { i } = await props.searchParams;
  return <CollectPage space={found.space} form={found.form} invite={i} />;
}
