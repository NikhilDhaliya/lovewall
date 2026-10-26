import type { Metadata } from "next";
import { AiSettings } from "@/components/ai/settings";
import { ActivitySettings } from "@/components/app/activity-settings";
import { DomainSettings } from "@/components/app/domain-settings";
import { SpaceSettings } from "@/components/app/space-settings";
import { IntegrationsSettings } from "@/components/integrations/settings";
import { getDomain, vercelEnabled } from "@/lib/data/domains";
import { loadSpace } from "@/lib/data/load";
import { listInvites, listMembers } from "@/lib/data/members";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function SpaceSettingsPage(props: PageProps<"/app/[space]/settings">) {
  const { space: spaceId } = await props.params;
  const { space, user, role } = await loadSpace(spaceId);
  const [members, invites] = await Promise.all([listMembers(space.id), role === "owner" ? listInvites(space.id) : []]);
  return (
    <SpaceSettings
      key={space.updated_at}
      // New-testimonial emails go to the owner.
      email={members.find((m) => m.role === "owner")?.email ?? user.email}
      appHost={env.appUrl.replace(/^https?:\/\//, "")}
      space={{
        id: space.id,
        name: space.name,
        slug: space.slug,
        website: space.website,
        brandColor: space.brand_color,
        notify: space.notify,
      }}
      members={{
        spaceId: space.id,
        me: user.id,
        role,
        billing: env.billing,
        members,
        invites: invites.map((i) => ({ id: i.id, email: i.email })),
      }}
      domain={
        role === "owner" && (
          <DomainSettings spaceId={space.id} initial={await getDomain(space.id)} target={env.customDomainTarget} hosted={vercelEnabled()} />
        )
      }
    >
      {/* Owner only: what the space sends and connects to. Editors see the space, the members and "Leave space". */}
      {role === "owner" && (
        <>
          <IntegrationsSettings spaceId={space.id} />
          <AiSettings spaceId={space.id} />
          <ActivitySettings spaceId={space.id} />
        </>
      )}
    </SpaceSettings>
  );
}
