// Show area mocks: "another website" page for widget layouts (popups float, star snippets land in its <head>).
const APP = process.env.E2E_APP_URL || "http://localhost:3111";

// A long page: the widget sits in the middle (or floats, for popups), with content above and below it.
const page = (
  id,
  float,
) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acme</title><style>body{font-family:system-ui;margin:0;padding:40px;background:#fafafa}section{height:600px}</style></head>
<body><h1>Acme</h1><p>What our customers say:</p><section id="above">Above</section>
<div data-lovewall="${String(id).replace(/[^A-Za-z0-9]/g, "")}"${float ? " data-lovewall-float" : ""}></div>
<section id="below">Below</section><button id="corner" style="position:fixed;left:0;bottom:0;width:120px;height:40px">Corner</button>
<script src="${APP}/embed.js" async></script></body></html>`;

export function handle(req, res, url) {
  if (url.pathname === "/show/site.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(url.searchParams.get("id") ?? "", url.searchParams.get("float") === "1"));
    return true;
  }
  return false;
}
