// "Another website" for the embed test (a different origin from the app), plus mock X endpoints.
import { createServer } from "node:http";
import { handle as integrations } from "./mocks/integrations.mjs";
import { handle as accounts } from "./mocks/accounts.mjs";
import { handle as collectMocks } from "./mocks/collect.mjs";
import { handle as importMock } from "./mocks/import.mjs";
import * as show from "./mocks/show.mjs";
import { handle as aiMock } from "./mocks/ai.mjs";

const APP = process.env.E2E_APP_URL || "http://localhost:3111";
const PORT = Number(process.env.E2E_SITE_PORT) || 3101;
const SELF = `http://127.0.0.1:${PORT}`;

const site = (id) => `<!doctype html><html><head><meta charset="utf-8"><title>Acme customer site</title>
<style>body{font-family:system-ui;margin:0;padding:40px;background:#fafafa}h1{font-size:28px}</style></head>
<body><h1>Acme</h1><p>What our customers say:</p>
<div data-lovewall="${String(id).replace(/[^A-Za-z0-9]/g, "")}"></div>
<script src="${APP}/embed.js" async></script></body></html>`;

const oembed = {
  url: "https://x.com/lovewalltest/status/1850000000000000001",
  author_name: "Ada Mock",
  author_url: "https://x.com/lovewalltest",
  html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Lovewall replaced our paid testimonial tool in ten minutes &amp; it&#39;s free.<br><br>Wild. <a href="https://t.co/abc">pic.twitter.com/abc</a></p>&mdash; Ada Mock (@lovewalltest) <a href="https://x.com/lovewalltest/status/1850000000000000001?ref_src=twsrc%5Etfw">October 26, 2026</a></blockquote>',
};

createServer((req, res) => {
  const url = new URL(req.url, SELF);
  if (integrations(req, res, url)) return;
  if (accounts(req, res, url)) return;
  if (collectMocks(req, res, url)) return;
  if (aiMock(req, res, url)) return;
  if (importMock(req, res, url)) return;
  if (show.handle(req, res, url)) return;
  if (url.pathname === "/site.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(site(url.searchParams.get("id") ?? ""));
  }
  if (url.pathname === "/oembed") {
    const target = url.searchParams.get("url") ?? "";
    if (/status\/404/.test(target)) {
      res.writeHead(404);
      return res.end("{}");
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(oembed));
  }
  if (url.pathname === "/syndication") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ user: { profile_image_url_https: `${SELF}/avatar.jpg` }, created_at: "2026-10-26T10:00:00.000Z" }));
  }
  res.writeHead(404);
  res.end("not found");
}).listen(PORT, "127.0.0.1");
