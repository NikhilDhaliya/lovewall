import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWallPayload } from "@/lib/data/public";
import { env } from "@/lib/env";
import { pageBody, pageCss, pageRoot } from "@/lib/widget/page";
import { jsonLd, WIDGET_SCRIPT } from "@/lib/widget/render";

// Static, regenerated on demand: any change to the widget or its testimonials expires it (updateTag).
export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

async function load(id: string) {
  return /^[0-9A-Za-z]{8,32}$/.test(id) ? getWallPayload(id) : null;
}

export async function generateMetadata(props: PageProps<"/w/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const payload = await load(id);
  if (!payload) return { title: "Not found" };
  const { space, summary, widget } = payload;
  const title = `${widget.config.pageTitle || space.name} · Wall of love`;
  const description =
    widget.config.pageText ||
    (summary.average ? `${summary.average.toFixed(1)} out of 5 from ${summary.count} reviews.` : `What people say about ${space.name}.`);
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, type: "website", url: `${env.appUrl}/w/${id}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function WallPage(props: PageProps<"/w/[id]">) {
  const { id } = await props.params;
  const payload = await load(id);
  if (!payload) notFound();
  const { widget, space, items, summary } = payload;
  const input = { widgetId: widget.id, config: widget.config, items, summary, space, appUrl: env.appUrl, mode: "page" as const };
  const ld = widget.config.snippets ? jsonLd(input) : "";
  return (
    <div {...pageRoot(input)}>
      <style dangerouslySetInnerHTML={{ __html: pageCss(input) }} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />}
      <div className="contents" dangerouslySetInnerHTML={{ __html: pageBody(input) }} />
      <script dangerouslySetInnerHTML={{ __html: WIDGET_SCRIPT }} />
    </div>
  );
}
