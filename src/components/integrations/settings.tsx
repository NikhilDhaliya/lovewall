import "server-only";
import type { KeyItem } from "@/app/actions/integrations";
import { listKeys } from "@/lib/api/keys";
import { listHooks } from "@/lib/webhooks";
import { ApiKeys } from "./api-keys";
import { Hooks } from "./hooks";

// Space settings: Slack and Discord, webhooks, API keys. The caller has already checked the space is the user's.
export async function IntegrationsSettings({ spaceId }: { spaceId: string }) {
  const [keys, hooks] = await Promise.all([listKeys(spaceId), listHooks(spaceId)]);
  const items: KeyItem[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    scope: k.scope,
    prefix: `lw_${k.prefix}`,
    lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
    createdAt: new Date(k.created_at).toISOString(),
  }));
  return (
    <>
      <Hooks spaceId={spaceId} initial={hooks} />
      <ApiKeys spaceId={spaceId} initial={items} />
    </>
  );
}
