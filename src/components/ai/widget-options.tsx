"use client";

import { Row, Section } from "@/components/widgets/controls";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES } from "@/lib/i18n/collect/languages";
import type { WidgetConfig } from "@/lib/widget/config";

// Widget options that need AI: each testimonial's best line marked, and translations into one language.
export function AiWidgetOptions({
  config,
  set,
}: {
  config: WidgetConfig;
  set: <K extends keyof WidgetConfig>(k: K, v: WidgetConfig[K]) => void;
}) {
  return (
    <Section title="AI">
      <Row label="Best line" htmlFor="highlight">
        <Switch id="highlight" on={config.highlight} onChange={(v) => set("highlight", v)} />
      </Row>
      <Row label="Language">
        <Select
          aria-label="Language"
          className="w-[150px]"
          value={config.language ?? "__original"}
          onChange={(v) => set("language", v === "__original" ? null : v)}
          options={[{ value: "__original", label: "As written" }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
        />
      </Row>
      {config.language && <p className="-mt-2 text-[13px] text-muted">New translations appear in a minute.</p>}
    </Section>
  );
}
