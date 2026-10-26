import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { CollectPage } from "@/components/collect/collect-page";
import { ensureDefaultForm } from "@/lib/data/forms";
import { getSpaceBySlug } from "@/lib/data/spaces";
import { pageAllowed } from "@/lib/rate-limit";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";

const load = cache(async (slug: string) => {
  if (!(await pageAllowed("collect", 300, 600))) return null;
  const space = await getSpaceBySlug(slug.toLowerCase());
  return space ? { space, form: await ensureDefaultForm(space) } : null;
});

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const found = await load(slug);
  if (!found) return { title: "Not found" };
  const { dict } = formLanguage(found.form.language, (await headers()).get("accept-language"));
  const title = t(dict, "metaTitle", { space: found.space.name });
  const description = found.form.title || t(dict, "defaultTitle", { space: found.space.name });
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

// The space's default form.
export default async function DefaultFormPage(props: PageProps<"/[slug]">) {
  await connection();
  const { slug } = await props.params;
  const found = await load(slug);
  if (!found) notFound();
  const { i } = await props.searchParams;
  return <CollectPage space={found.space} form={found.form} invite={i} />;
}
