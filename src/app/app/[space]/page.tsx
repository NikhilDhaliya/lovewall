import type { Metadata } from "next";
import { Inbox } from "@/components/inbox/inbox";
import { aiKeys } from "@/lib/ai/settings";
import { ReportsQueue } from "@/components/inbox/reports";
import { formsMeta } from "@/lib/data/forms";
import { loadSpace } from "@/lib/data/load";
import { inboxMeta, queryInbox, type InboxFilters } from "@/lib/data/testimonials";
import { env } from "@/lib/env";
import { listReports } from "@/lib/privacy";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage(props: PageProps<"/app/[space]">) {
  const { space: spaceId } = await props.params;
  const { space, role } = await loadSpace(spaceId);
  const meta = await inboxMeta(space.id);
  // Open on what needs attention: new ones if there are any, else everything.
  const filters: InboxFilters = { status: meta.counts.new > 0 ? "new" : "all" };
  const page = await queryInbox(space.id, filters);
  return (
    <Inbox
      space={{ id: space.id, name: space.name, brandColor: space.brand_color, hasLogo: Boolean(space.logo_key) }}
      collectUrl={`${env.appUrl}/${space.slug}`}
      initial={{ filters, items: page.items, next: page.next, meta }}
      forms={await formsMeta(space.id)}
      ai={aiKeys()}
      notice={<ReportsQueue key="reports" spaceId={space.id} initial={await listReports(space.id)} />}
      canExport={role === "owner"}
    />
  );
}
