// Mock receivers for webhooks, Slack, Discord and Zapier (REST Hooks). Each POST to /hooks/<name> is recorded with
// its headers and raw body; GET /hooks/<name>/log returns what arrived. Names pick the answer:
// fail-* → 500 always, flaky-* → 500 once then 200, gone-* → 410, anything else → 200.
const received = new Map();
const seen = new Set();

function answer(name) {
  if (name.startsWith("fail")) return 500;
  if (name.startsWith("gone")) return 410;
  if (name.startsWith("flaky") && !seen.has(name)) {
    seen.add(name);
    return 500;
  }
  return 200;
}

export function handle(req, res, url) {
  const m = url.pathname.match(/^\/hooks\/([\w-]{1,80})(\/log)?$/);
  if (!m) return false;
  const [, name, log] = m;
  if (log) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(received.get(name) ?? []));
    return true;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return true;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const status = answer(name);
    const list = received.get(name) ?? [];
    list.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8"), status });
    received.set(name, list);
    res.writeHead(status, { "Content-Type": "text/plain" });
    res.end(status === 200 ? "ok" : "no");
  });
  return true;
}
