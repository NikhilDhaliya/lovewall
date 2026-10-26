import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Configurator, type ConfiguratorTab } from "@/components/widgets/configurator";
import { aiReady } from "@/lib/ai/client";
import { one, q } from "@/lib/db";
import { fileUrl } from "@/lib/data/files";
import { loadSpace } from "@/lib/data/load";
import { toPublic } from "@/lib/data/public";
import { widgetStats } from "@/lib/data/stats";
import { env } from "@/lib/env";
import type { Testimonial, Widget } from "@/lib/types";
import { parseConfig } from "@/lib/widget/config";
import { SAMPLES } from "@/lib/widget/samples";

export const metadata: Metadata = { title: "Widget" };

export default async function WidgetPage(props: PageProps<"/app/[space]/widgets/[widget]">) {
  const { space: spaceId, widget: widgetId } = await props.params;
  const { tab } = await props.searchParams;
  const { space } = await loadSpace(spaceId);
  const widget = await one<Widget>("select * from widgets where id = $1 and space_id = $2", [widgetId, space.id]);
  if (!widget) notFound();
  // Everything approved (newest 300): the preview filters and sorts it locally, instantly.
  const rows = await q<Testimonial>(
    "select * from testimonials where space_id = $1 and status = 'approved' order by given_at desc limit 300",
    [space.id],
  );
  const tags = await q<{ tag: string }>("select distinct unnest(tags) as tag from testimonials where space_id = $1 order by 1 limit 200", [
    space.id,
  ]);
  const items = rows.map(toPublic);
  // AI: the translations the preview can show (current ones only, i.e. made from the text as it is now).
  const ai = aiReady();
  const translations: Record<string, Record<string, { text: string; highlight: string | null }>> = {};
  if (ai && rows.length) {
    const tr = await q<{ testimonial_id: string; lang: string; text: string; highlight: string | null }>(
      `select tr.testimonial_id, tr.lang, tr.text, tr.highlight from testimonial_translations tr join testimonials t on t.id = tr.testimonial_id
       where tr.space_id = $1 and tr.testimonial_id = any($2) and tr.source_hash = md5(t.text)`,
      [space.id, rows.map((r) => r.id)],
    );
    for (const r of tr) (translations[r.lang] ??= {})[r.testimonial_id] = { text: r.text, highlight: r.highlight };
  }
  const stats = await widgetStats(space.id, widget.id);
  return (
    <Configurator
      spaceId={space.id}
      widget={{ id: widget.id, name: widget.name, type: widget.type, config: parseConfig(widget.config) }}
      items={items.length ? items : SAMPLES}
      sample={!items.length}
      tags={tags.map((t) => t.tag)}
      space={{ name: space.name, slug: space.slug, logo: fileUrl(space.logo_key), website: space.website }}
      appUrl={env.appUrl}
      stats={stats}
      ai={ai}
      translations={translations}
      initialTab={(["design", "page", "stats"] as const).find((t) => t === tab) ?? ("design" satisfies ConfiguratorTab)}
    />
  );
}
