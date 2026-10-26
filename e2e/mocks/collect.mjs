// Mocks for collect tests: DNS-over-HTTPS (custom-domain checks) and the Vercel domains API.
// Hosts under .pointed.test have a CNAME to the app's host ("localhost"); every other host has none.
const calls = [];
const txt = new Map();

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function handle(req, res, url) {
  if (url.pathname === "/dns-query") {
    const name = (url.searchParams.get("name") ?? "").toLowerCase();
    if (url.searchParams.get("type") === "TXT") {
      const value = txt.get(name);
      json(res, 200, { Status: 0, Answer: value ? [{ name: `${name}.`, type: 16, TTL: 60, data: `"${value}"` }] : [] });
      return true;
    }
    const answer = name.endsWith(".pointed.test") ? [{ name: `${name}.`, type: 5, TTL: 60, data: "localhost." }] : [];
    json(res, 200, { Status: 0, Answer: answer });
    return true;
  }
  // Tests publish a TXT record (the domain owner adding it at their DNS host): POST /dns-txt?name=...&value=...
  if (url.pathname === "/dns-txt" && req.method === "POST") {
    txt.set((url.searchParams.get("name") ?? "").toLowerCase(), url.searchParams.get("value") ?? "");
    json(res, 200, { ok: true });
    return true;
  }
  if (url.pathname.startsWith("/vercel/")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method, path: url.pathname, auth: req.headers.authorization ?? "", body });
      if (req.headers.authorization !== "Bearer e2e-vercel-token") return json(res, 403, { error: { code: "forbidden" } });
      json(res, 200, req.method === "POST" ? { name: JSON.parse(body || "{}").name, verified: true } : {});
    });
    return true;
  }
  if (url.pathname === "/vercel-calls") {
    json(res, 200, calls);
    return true;
  }
  return false;
}
