// Shared by every trigger and action: the API address, the Bearer header, readable errors, REST hooks.

// The connection's Lovewall address without a trailing slash ("testimonials.example.com" works too).
export function appUrl(bundle) {
  const raw = String(bundle.authData?.app_url || "")
    .trim()
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function apiUrl(bundle, path) {
  return `${appUrl(bundle)}/api/v1${path}`;
}

export function addBearer(request, z, bundle) {
  if (bundle.authData?.api_key) {
    request.headers = { ...request.headers, Authorization: `Bearer ${bundle.authData.api_key}`, Accept: "application/json" };
  }
  return request;
}

// Lovewall errors look like { error: { code, message } }: show the message, not a status code.
export function handleErrors(response, z) {
  if (response.status < 400 || response.request?.skipThrowForStatus) return response;
  let error = {};
  try {
    error = JSON.parse(response.content || "{}").error || {};
  } catch {
    error = {};
  }
  const message = error.message || `Lovewall answered ${response.status}`;
  if (response.status === 401) throw new z.errors.ExpiredAuthError(`${message}. Reconnect Lovewall with a valid API key.`);
  if (response.status === 403) throw new z.errors.Error(`${message}. Use an API key with write access.`, "Forbidden", 403);
  if (response.status === 429) throw new z.errors.ThrottledError(message, Number(response.getHeader?.("retry-after")) || 60);
  throw new z.errors.Error(message, error.code || "LovewallError", response.status);
}

// REST hooks: Zapier gives a target URL, Lovewall POSTs { type, timestamp, data: Testimonial } to it.
export function subscribeHook(event) {
  return async (z, bundle) => {
    const response = await z.request({ url: apiUrl(bundle, "/hooks"), method: "POST", body: { target_url: bundle.targetUrl, event } });
    return response.data.data;
  };
}

export async function unsubscribeHook(z, bundle) {
  const id = bundle.subscribeData?.id;
  if (!id) return {};
  const response = await z.request({ url: apiUrl(bundle, `/hooks/${encodeURIComponent(id)}`), method: "DELETE", skipThrowForStatus: true });
  // Already gone is fine.
  if (response.status === 404) return { id, deleted: true };
  return handleErrors(response, z).data.data;
}

export function hookPayload(z, bundle) {
  const testimonial = bundle.cleanedRequest?.data;
  return testimonial && testimonial.id ? [testimonial] : [];
}

// Sends only the fields that have a value.
export function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)),
  );
}
