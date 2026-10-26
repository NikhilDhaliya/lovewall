import "server-only";
import { aiKeys, getAiSettings } from "@/lib/ai/settings";
import { usageToday } from "@/lib/ai/usage";
import { AiSettingsGroup } from "./settings-group";

// Space settings: the AI switches and today's usage. Nothing at all without a key. The caller has checked the space.
export async function AiSettings({ spaceId }: { spaceId: string }) {
  const keys = aiKeys();
  if (!keys.text && !keys.speech) return null;
  const [settings, usage] = await Promise.all([getAiSettings(spaceId), usageToday(spaceId)]);
  return <AiSettingsGroup spaceId={spaceId} keys={keys} initial={settings} usage={usage} />;
}
