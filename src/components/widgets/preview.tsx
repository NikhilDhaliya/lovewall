"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import type { PublicSpace, PublicTestimonial } from "@/lib/types";
import type { WidgetConfig, WidgetType } from "@/lib/widget/config";
import { pageDocument } from "@/lib/widget/page";
import { widgetDocument } from "@/lib/widget/render";
import { selectItems, summarize } from "@/lib/widget/select";

const noop = () => () => {};

// Client only: the iframe must not load before the message listener exists.
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// Live preview: the exact embed HTML, rendered in a sandboxed srcdoc iframe that sizes itself.
export function WidgetPreview({
  widgetId,
  type,
  config,
  items,
  space,
  appUrl,
  className,
  minHeight = 120,
  fill = false,
}: {
  widgetId: string;
  type: WidgetType;
  config: WidgetConfig;
  items: PublicTestimonial[];
  space: PublicSpace;
  appUrl: string;
  className?: string;
  minHeight?: number;
  // Take the parent's full height instead of the content's (the popup floats inside it).
  fill?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  const [width, setWidth] = useState<number | null>(null);
  // A lightbox inside the widget covers the screen while it is open (as embed.js does on a real site).
  const [modal, setModal] = useState(false);
  const mounted = useMounted();

  const html = useMemo(() => {
    const shown = selectItems(items, config, type);
    const summary = summarize(items, config);
    const doc = widgetDocument({ widgetId, type, config, items: shown, summary, space, appUrl, mode: "preview" });
    // Links open in a new tab from the preview. (The script stays byte-identical, so the CSP hash still matches.)
    return doc.replace("<head>", '<head><base target="_blank">');
  }, [widgetId, type, config, items, space, appUrl]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { lovewall?: string; height?: number; width?: number; inline?: boolean; modal?: boolean; float?: unknown };
      if (!d?.lovewall) return;
      setModal(Boolean(d.modal));
      if (d.modal || d.float) return;
      if (typeof d.height === "number") setHeight(Math.max(minHeight, Math.min(4000, d.height)));
      setWidth(d.inline && d.width ? d.width : null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [minHeight]);

  if (!mounted) return <div className={cn("skeleton rounded-[12px]", className)} style={{ height: minHeight }} />;
  return (
    <div className={cn(fill && "h-full")} style={{ height: modal ? height : undefined }}>
      <iframe
        ref={frame}
        title="Widget preview"
        srcDoc={html}
        onLoad={() => frame.current?.contentWindow?.postMessage({ lovewall: "ping" }, "*")}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className={cn(
          "block border-0",
          modal ? "fixed inset-0 z-[60] !h-dvh !w-screen" : fill ? "!h-full" : "transition-[height] duration-300 ease-out",
          className,
        )}
        style={{ height: Math.max(minHeight, height), width: width ?? "100%", colorScheme: "normal" }}
      />
    </div>
  );
}

// The public wall page, live: the same HTML as /w/<id>, scrolling inside a browser-like frame.
export function PagePreview({
  widgetId,
  config,
  items,
  space,
  appUrl,
  className,
}: {
  widgetId: string;
  config: WidgetConfig;
  items: PublicTestimonial[];
  space: PublicSpace;
  appUrl: string;
  className?: string;
}) {
  const mounted = useMounted();
  const html = useMemo(() => {
    const shown = selectItems(items, { ...config, max: Math.max(config.max, 60) }, "wall");
    const summary = summarize(items, config);
    return pageDocument({ widgetId, config, items: shown, summary, space, appUrl, mode: "preview" });
  }, [widgetId, config, items, space, appUrl]);
  // The page reloads once typing pauses, in a fresh frame each time (quick srcdoc swaps can leave a frame blank).
  const [doc, setDoc] = useState({ html, version: 0 });
  useEffect(() => {
    if (html === doc.html) return;
    const id = setTimeout(() => setDoc((d) => ({ html, version: d.version + 1 })), 200);
    return () => clearTimeout(id);
  }, [html, doc.html]);
  if (!mounted) return <div className={cn("skeleton", className)} />;
  return (
    <iframe
      key={doc.version}
      title="Page preview"
      srcDoc={doc.html}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className={cn("block w-full border-0", className)}
      style={{ colorScheme: "normal" }}
    />
  );
}
