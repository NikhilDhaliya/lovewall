"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateAiSettings } from "@/app/actions/ai";
import { Group, GroupRow } from "@/components/app/grouped";
import { Switch } from "@/components/ui/switch";
import type { AiSettings } from "@/lib/ai/settings";

const NUMBER = new Intl.NumberFormat("en");

const ROWS: { key: keyof AiSettings; label: string; needs: "text" | "speech" }[] = [
  { key: "spam", label: "Spam filter", needs: "text" },
  { key: "sentiment", label: "Sentiment tags", needs: "text" },
  { key: "highlight", label: "Best line", needs: "text" },
  { key: "grammar", label: "Spelling help on forms", needs: "text" },
  { key: "captions", label: "Video captions", needs: "speech" },
];

export function AiSettingsGroup({
  spaceId,
  keys,
  initial,
  usage,
}: {
  spaceId: string;
  keys: { text: boolean; speech: boolean };
  initial: AiSettings;
  usage: { calls: number; max: number };
}) {
  const [settings, setSettings] = useState(initial);

  async function toggle(key: keyof AiSettings, on: boolean) {
    setSettings((s) => ({ ...s, [key]: on }));
    const res = await updateAiSettings(spaceId, { [key]: on });
    if (!res.ok) {
      setSettings((s) => ({ ...s, [key]: !on }));
      toast.error(res.error);
    }
  }

  return (
    <Group title="AI" id="ai" hint="Spam is hidden, never deleted.">
      {ROWS.filter((r) => keys[r.needs]).map((r) => (
        <GroupRow key={r.key} label={r.label} htmlFor={`ai-${r.key}`}>
          <Switch id={`ai-${r.key}`} on={settings[r.key]} onChange={(v) => void toggle(r.key, v)} />
        </GroupRow>
      ))}
      <GroupRow label="Today">
        <span className="text-[14px] text-muted tabular-nums" data-testid="ai-usage">
          {NUMBER.format(usage.calls)} of {NUMBER.format(usage.max)} calls
        </span>
      </GroupRow>
    </Group>
  );
}
