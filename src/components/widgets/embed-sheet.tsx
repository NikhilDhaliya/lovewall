"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import type { WidgetType } from "@/lib/widget/config";
import { CodeBlock } from "./code-block";

type Tab = "html" | "react" | "iframe" | "link";

// Popups float over the page, so their div is marked to load right away (it can sit anywhere in the page).
export function embedSnippets(appUrl: string, id: string, type?: WidgetType) {
  const float = type === "popup";
  return {
    html: `<script src="${appUrl}/embed.js" defer></script>\n<div data-lovewall="${id}"${float ? " data-lovewall-float" : ""}></div>`,
    react: `import Script from "next/script";\n\nexport function Testimonials() {\n  return (\n    <>\n      <div data-lovewall="${id}"${float ? " data-lovewall-float" : ""} />\n      <Script src="${appUrl}/embed.js" strategy="lazyOnload" />\n    </>\n  );\n}`,
    iframe: `<iframe src="${appUrl}/embed/${id}" title="Testimonials" loading="lazy" style="width:100%;border:0" height="640"></iframe>`,
    link: `${appUrl}/w/${id}`,
  };
}

export function EmbedSheet({
  open,
  onOpenChange,
  appUrl,
  widgetId,
  type,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appUrl: string;
  widgetId: string;
  type?: WidgetType;
}) {
  const [tab, setTab] = useState<Tab>("html");
  const s = embedSnippets(appUrl, widgetId, type);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Embed" wide>
      <div className="space-y-4 p-5">
        <Segmented
          label="Snippet"
          value={tab}
          onChange={setTab}
          options={[
            { value: "html", label: "HTML" },
            { value: "react", label: "React" },
            { value: "iframe", label: "iframe" },
            { value: "link", label: "Page" },
          ]}
        />
        {tab === "link" ? (
          <div className="space-y-3">
            <CodeBlock code={s.link} />
            <a
              href={s.link}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"
            >
              Open page <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : (
          <CodeBlock code={s[tab]} />
        )}
        <p className="text-[13px] text-muted">
          {tab === "html" && (type === "popup" ? "Paste anywhere in the page." : "Paste where it should appear. It sizes itself.")}
          {tab === "react" && "Works in Next.js. Elsewhere, load embed.js once."}
          {tab === "iframe" && "No script. Set the height yourself."}
          {tab === "link" && "A shareable wall of love."}
        </p>
        <a
          href="/guides"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
        >
          Guides for Webflow, WordPress, Shopify and more <ExternalLink className="size-3.5" />
        </a>
      </div>
    </Sheet>
  );
}
