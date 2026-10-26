"use client";

import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { textareaClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { parseConfig, type WidgetConfig } from "@/lib/widget/config";
import { Row, Section, smallInput } from "./controls";

type Set = <K extends keyof WidgetConfig>(k: K, v: WidgetConfig[K]) => void;

function Labelled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px]">
        {label}
      </label>
      {children}
    </div>
  );
}

// Settings for the public wall page (/w/<id>).
export function PagePanel({ config, set, spaceName }: { config: WidgetConfig; set: Set; spaceName: string }) {
  const badLink = Boolean(config.ctaUrl?.trim()) && !parseConfig({ ctaUrl: config.ctaUrl }).ctaUrl;
  const halfButton = Boolean(config.ctaLabel.trim()) !== Boolean(config.ctaUrl?.trim());
  return (
    <>
      <Section title="Page">
        <Row label="Style">
          <Segmented
            size="sm"
            className="w-[236px]"
            label="Page style"
            value={config.pageStyle}
            onChange={(v) => set("pageStyle", v)}
            options={[
              { value: "centered", label: "Centered" },
              { value: "left", label: "Left" },
              { value: "tinted", label: "Tinted" },
              { value: "split", label: "Split" },
            ]}
          />
        </Row>
        <Row label="Theme">
          <Segmented
            size="sm"
            className="w-[180px]"
            label="Theme"
            value={config.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "auto", label: "Auto" },
            ]}
          />
        </Row>
      </Section>
      <Section title="Header">
        <Labelled id="pageTitle" label="Heading">
          <input
            id="pageTitle"
            value={config.pageTitle}
            maxLength={80}
            onChange={(e) => set("pageTitle", e.target.value)}
            placeholder={spaceName}
            className={smallInput}
          />
        </Labelled>
        <Labelled id="pageText" label="Text">
          <textarea
            id="pageText"
            value={config.pageText}
            maxLength={280}
            rows={3}
            onChange={(e) => set("pageText", e.target.value)}
            placeholder="Optional"
            className={cn(textareaClass, "text-[14px] md:text-[13.5px]")}
          />
        </Labelled>
      </Section>
      <Section title="Button">
        <Labelled id="ctaLabel" label="Label">
          <input
            id="ctaLabel"
            value={config.ctaLabel}
            maxLength={40}
            onChange={(e) => set("ctaLabel", e.target.value)}
            placeholder="Start free trial"
            className={smallInput}
          />
        </Labelled>
        <Labelled id="ctaUrl" label="Link">
          <input
            id="ctaUrl"
            value={config.ctaUrl ?? ""}
            maxLength={500}
            inputMode="url"
            onChange={(e) => set("ctaUrl", e.target.value || null)}
            placeholder="https://"
            aria-invalid={badLink || undefined}
            aria-describedby={badLink || halfButton ? "cta-hint" : undefined}
            className={cn(smallInput, badLink && "ring-danger/60")}
          />
        </Labelled>
        {(badLink || halfButton) && (
          <p id="cta-hint" className={cn("-mt-1.5 text-[13px]", badLink ? "text-danger" : "text-muted")}>
            {badLink ? "Not a valid link" : "Add a label and a link"}
          </p>
        )}
        <Row label="Add yours" htmlFor="pageAddYours">
          <Switch id="pageAddYours" on={config.pageAddYours} onChange={(v) => set("pageAddYours", v)} />
        </Row>
      </Section>
      <Section title="Visitors">
        <Row label="Tag filters" htmlFor="pageFilters">
          <Switch id="pageFilters" on={config.pageFilters} onChange={(v) => set("pageFilters", v)} />
        </Row>
      </Section>
    </>
  );
}
