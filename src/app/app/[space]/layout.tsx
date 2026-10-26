import { PlanLock } from "@/components/billing/plan-lock";
import { planFor } from "@/lib/data/billing";
import { loadSpace } from "@/lib/data/load";
import { one } from "@/lib/db";

// Membership is checked here, above the loading boundary, so a space you aren't a member of is a real 404 (status
// included). When the owner's hosted plan has ended, every page of the space shows the subscribe screen instead.
export default async function SpaceLayout({ children, params }: LayoutProps<"/app/[space]">) {
  const { space: spaceId } = await params;
  const { space, role, locked } = await loadSpace(spaceId);
  if (locked) {
    if (role !== "owner") {
      const owner = await one<{ name: string }>(`select coalesce(nullif(name, ''), email) as name from auth_users where id = $1`, [
        space.owner_id,
      ]);
      return <PlanLock reason="owner" owner={owner?.name} leave={{ spaceId: space.id, name: space.name }} />;
    }
    const plan = await planFor(space.owner_id);
    return <PlanLock reason={plan?.state === "ended" ? plan.reason : "trial"} />;
  }
  return children;
}
