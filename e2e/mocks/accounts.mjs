// Mock Polar API for the hosted-billing tests: checkouts and the hosted checkout page, customer portal sessions,
// subscription lists and revokes. The billing test server points POLAR_API_URL at <site>/polar.
import { randomBytes } from "node:crypto";

export const POLAR_TEST = {
  token: "polar_oat_e2e",
  webhookSecret: "polar_whs_e2e_secret",
  monthly: "prod_e2e_monthly",
  yearly: "prod_e2e_yearly",
};

const checkouts = new Map();
const subscriptions = new Map();
const revoked = [];

const id = (prefix) => `${prefix}_${randomBytes(8).toString("hex")}`;
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
const page = (res, title, body) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`,
  );
};
const readJson = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(null);
      }
    });
  });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function handle(req, res, url) {
  if (!url.pathname.startsWith("/polar/")) return false;
  const self = `http://${req.headers.host}`;
  const path = url.pathname.slice("/polar".length);

  // The pages a customer sees (no API token).
  let m = path.match(/^\/checkout\/(chk_[0-9a-f]+)$/);
  if (m && checkouts.has(m[1])) {
    const c = checkouts.get(m[1]);
    page(res, "Mock Polar checkout", `<p>${esc(c.customer_email)} · ${esc(c.product_id)}</p><a href="/polar/checkout/${c.id}/pay">Pay</a>`);
    return true;
  }
  m = path.match(/^\/checkout\/(chk_[0-9a-f]+)\/pay$/);
  if (m && checkouts.has(m[1])) {
    const c = checkouts.get(m[1]);
    const now = new Date();
    const days = c.product_id === POLAR_TEST.yearly ? 365 : 30;
    const sub = {
      id: id("sub"),
      status: "active",
      customer_id: `cus_${c.external_customer_id}`,
      product_id: c.product_id,
      current_period_end: new Date(now.getTime() + days * 86400_000).toISOString(),
      cancel_at_period_end: false,
      ended_at: null,
      created_at: now.toISOString(),
      modified_at: now.toISOString(),
      customer: { external_id: c.external_customer_id, email: c.customer_email },
    };
    subscriptions.set(sub.id, sub);
    res.writeHead(302, { Location: c.success_url.replace("{CHECKOUT_ID}", c.id) });
    res.end();
    return true;
  }
  if (path === "/portal") {
    page(res, "Mock customer portal", `<p>${esc(url.searchParams.get("customer") ?? "")}</p>`);
    return true;
  }
  // What the tests check afterwards.
  if (path === "/_state") {
    json(res, 200, { revoked, subscriptions: [...subscriptions.values()] });
    return true;
  }

  // The API: needs the organization token.
  if (req.headers.authorization !== `Bearer ${POLAR_TEST.token}`) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  if (req.method === "POST" && path === "/v1/checkouts/") {
    readJson(req).then((body) => {
      const product = body?.products?.[0];
      if (![POLAR_TEST.monthly, POLAR_TEST.yearly].includes(product) || !body.external_customer_id || !body.success_url) {
        return json(res, 422, { detail: "Invalid checkout" });
      }
      const c = {
        id: id("chk"),
        status: "open",
        product_id: product,
        external_customer_id: body.external_customer_id,
        customer_email: body.customer_email ?? null,
        success_url: body.success_url,
      };
      c.url = `${self}/polar/checkout/${c.id}`;
      checkouts.set(c.id, c);
      json(res, 201, c);
    });
    return true;
  }
  if (req.method === "POST" && path === "/v1/customer-sessions/") {
    readJson(req).then((body) => {
      const known = [...subscriptions.values()].some((s) => s.customer.external_id === body?.external_customer_id);
      if (!known) return json(res, 404, { detail: "Customer not found" });
      json(res, 201, {
        id: id("cs"),
        token: id("tok"),
        customer_portal_url: `${self}/polar/portal?customer=${encodeURIComponent(body.external_customer_id)}`,
      });
    });
    return true;
  }
  if (req.method === "GET" && path === "/v1/subscriptions/") {
    const external = url.searchParams.get("external_customer_id");
    const items = [...subscriptions.values()].filter((s) => s.customer.external_id === external);
    json(res, 200, { items, pagination: { total_count: items.length, max_page: 1 } });
    return true;
  }
  m = path.match(/^\/v1\/subscriptions\/(sub_[0-9a-f]+)$/);
  if (req.method === "DELETE" && m) {
    const sub = subscriptions.get(m[1]);
    if (!sub) return (json(res, 404, { detail: "Not found" }), true);
    if (sub.status === "canceled") return (json(res, 403, { detail: "Already canceled" }), true);
    Object.assign(sub, { status: "canceled", ended_at: new Date().toISOString(), modified_at: new Date().toISOString() });
    revoked.push(sub.id);
    json(res, 200, sub);
    return true;
  }
  json(res, 404, { detail: "Not found" });
  return true;
}
