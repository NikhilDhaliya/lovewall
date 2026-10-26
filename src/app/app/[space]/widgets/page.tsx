import type { Metadata } from "next";
import { WidgetList, type WidgetRow } from "@/components/widgets/widget-list";
import { q } from "@/lib/db";
import { loadSpace } from "@/lib/data/load";
import { viewsByWidget } from "@/lib/data/stats";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Widgets" };

export default async function WidgetsPage(props: PageProps<"/app/[space]/widgets">) {
  const { space: spaceId } = await props.params;
  const { space } = await loadSpace(spaceId);
  const widgets = await q<WidgetRow>("select id, name, type, updated_at from widgets where space_id = $1 order by created_at", [space.id]);
  const views = await viewsByWidget(space.id);
  return (
    <WidgetList
      key={widgets.map((w) => w.id).join()}
      spaceId={space.id}
      widgets={widgets.map((w) => ({ ...w, views: views[w.id] ?? 0 }))}
      appUrl={env.appUrl}
    />
  );
}
