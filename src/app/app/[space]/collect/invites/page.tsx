import type { Metadata } from "next";
import { Invites } from "@/components/app/collect/invites";
import { ensureDefaultForm, listForms } from "@/lib/data/forms";
import { one } from "@/lib/db";
import { loadSpace } from "@/lib/data/load";
import { defaultInvite, inviteQuota, listInvites } from "@/lib/invites";

export const metadata: Metadata = { title: "Invites" };

export default async function InvitesPage(props: PageProps<"/app/[space]/collect/invites">) {
  const { space: spaceId } = await props.params;
  const { space } = await loadSpace(spaceId);
  await ensureDefaultForm(space);
  const forms = await listForms(space.id);
  const row = await one<{ business_address: string | null }>("select business_address from spaces where id = $1", [space.id]);
  return (
    <Invites
      spaceId={space.id}
      forms={forms.map((f) => ({ id: f.id, name: f.name }))}
      invites={await listInvites(space.id)}
      quota={await inviteQuota(space)}
      defaults={defaultInvite(space.name)}
      hasAddress={Boolean(row?.business_address?.trim())}
    />
  );
}
