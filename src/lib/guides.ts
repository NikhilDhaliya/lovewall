// Platform guides (/guides/<slug>): short numbered steps with the real snippet. The widget id is a placeholder;
// owners copy their own from Widgets → Embed.

export type SnippetKind = "html" | "next" | "react" | "shortcode" | "embed" | "page";

export type Guide = {
  slug: string;
  name: string;
  summary: string;
  steps: { title: string; text?: string; code?: SnippetKind }[];
  note?: string;
};

export const WIDGET_ID = "YOUR_WIDGET_ID";

export function guideSnippet(kind: SnippetKind, appUrl: string, id = WIDGET_ID): { code: string; label: string } {
  switch (kind) {
    case "next":
      return {
        label: "Testimonials.tsx",
        code: `import Script from "next/script";\n\nexport function Testimonials() {\n  return (\n    <>\n      <div data-lovewall="${id}" />\n      <Script src="${appUrl}/embed.js" strategy="lazyOnload" />\n    </>\n  );\n}`,
      };
    case "react":
      return {
        label: "Testimonials.jsx",
        code: `import { useEffect } from "react";\n\nexport function Testimonials() {\n  useEffect(() => {\n    if (document.querySelector('script[src$="/embed.js"]')) return;\n    const s = document.createElement("script");\n    s.src = "${appUrl}/embed.js";\n    s.defer = true;\n    document.body.appendChild(s);\n  }, []);\n  return <div data-lovewall="${id}" />;\n}`,
      };
    case "shortcode":
      return { label: "Shortcode", code: `[lovewall id="${id}"]` };
    case "embed":
      return { label: "Link", code: `${appUrl}/embed/${id}` };
    case "page":
      return { label: "Link", code: `${appUrl}/w/${id}` };
    default:
      return { label: "HTML", code: `<script src="${appUrl}/embed.js" defer></script>\n<div data-lovewall="${id}"></div>` };
  }
}

const COPY = { title: "Copy your widget’s code.", text: "In Lovewall, open Widgets, pick a widget and press Embed." };

export const GUIDES: Guide[] = [
  {
    slug: "html",
    name: "HTML",
    summary: "Any website you can edit.",
    steps: [
      COPY,
      { title: "Paste it where the testimonials should appear.", code: "html" },
      { title: "Publish.", text: "The widget sizes itself and loads after the page, so it never slows it down." },
    ],
  },
  {
    slug: "react",
    name: "React and Next.js",
    summary: "Next.js, Vite, Remix and other React apps.",
    steps: [
      COPY,
      { title: "In Next.js, add this component and render it where you want the testimonials.", code: "next" },
      { title: "In other React apps, load the script once from an effect.", code: "react" },
    ],
    note: "The script notices widgets added later, so client-side navigation works without extra code.",
  },
  {
    slug: "webflow",
    name: "Webflow",
    summary: "With a Code Embed element.",
    steps: [
      COPY,
      { title: "In the Designer, open Add and drag a Code Embed element onto the page." },
      { title: "Paste the code and press Save & Close.", code: "html" },
      { title: "Publish the site.", text: "Embeds run on the published site, not inside the Designer." },
    ],
  },
  {
    slug: "wordpress",
    name: "WordPress",
    summary: "With a Custom HTML block, or the Lovewall plugin.",
    steps: [
      COPY,
      { title: "In the block editor, add a Custom HTML block.", text: "Classic editor: switch to the Text tab." },
      { title: "Paste the code and update the page.", code: "html" },
    ],
    note: 'Prefer a shortcode? Install the Lovewall plugin from GitHub (integrations/wordpress) and use [lovewall id="…"] or the Lovewall block.',
  },
  {
    slug: "shopify",
    name: "Shopify",
    summary: "With a Custom Liquid section.",
    steps: [
      COPY,
      { title: "Go to Online Store → Themes → Customize." },
      { title: "Open the page, choose Add section → Custom Liquid, and paste the code.", code: "html" },
      { title: "Save." },
    ],
  },
  {
    slug: "framer",
    name: "Framer",
    summary: "With the Embed component.",
    steps: [
      COPY,
      { title: "Insert an Embed component and set its type to HTML." },
      { title: "Paste the code.", code: "html" },
      { title: "Set its height to Fit Content, then publish." },
    ],
  },
  {
    slug: "squarespace",
    name: "Squarespace",
    summary: "With a Code block.",
    steps: [
      COPY,
      { title: "Edit the page, add a block and choose Code." },
      { title: "Paste the code, leave the mode on HTML, and save.", code: "html" },
    ],
    note: "Squarespace runs scripts in Code blocks on paid plans only.",
  },
  {
    slug: "wix",
    name: "Wix",
    summary: "With Embed HTML.",
    steps: [
      COPY,
      { title: "Choose Add Elements → Embed Code → Embed HTML." },
      { title: "Pick Code, paste the code and press Update.", code: "html" },
      { title: "Drag the box tall enough for the widget, then publish.", text: "Wix shows embeds in a box of fixed size." },
    ],
  },
  {
    slug: "carrd",
    name: "Carrd",
    summary: "With an Embed element.",
    steps: [
      COPY,
      { title: "Add an Embed element. Set Type to Code and Style to Inline." },
      { title: "Paste the code and publish.", code: "html" },
    ],
    note: "Embeds need Carrd Pro.",
  },
  {
    slug: "ghost",
    name: "Ghost",
    summary: "With an HTML card.",
    steps: [
      COPY,
      { title: "In the editor, press + and choose HTML." },
      { title: "Paste the code and update the post or page.", code: "html" },
    ],
  },
  {
    slug: "notion",
    name: "Notion",
    summary: "With an embed block, or the wall page link.",
    steps: [
      { title: "Find your widget’s id.", text: "In Lovewall, open Widgets, pick a widget and press Embed. The id is in the code." },
      { title: "Type /embed in Notion and paste this link with your id.", code: "embed" },
      { title: "Drag the block’s edge to fit.", text: "Notion doesn’t run scripts, so the block doesn’t size itself." },
      { title: "Or share the wall page as a link.", code: "page" },
    ],
  },
  {
    slug: "bubble",
    name: "Bubble",
    summary: "With an HTML element.",
    steps: [
      COPY,
      { title: "Drag an HTML element onto the page." },
      { title: "Paste the code.", code: "html" },
      { title: "In its layout, tick Fit height to content, then deploy." },
    ],
  },
  {
    slug: "kajabi",
    name: "Kajabi",
    summary: "With a Custom Code section.",
    steps: [
      COPY,
      { title: "Open the page in the builder and add a Custom Code section." },
      { title: "Paste the code and save.", code: "html" },
    ],
  },
];

export function findGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
