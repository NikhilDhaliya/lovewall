/*! Save to Lovewall · api.js
 * Settings and calls to the Lovewall REST API (/api/v1). The extension only ever talks to the Lovewall address entered
 * in its settings; there is no default. */
(function (root) {
  "use strict";

  var TIMEOUT = 15000;

  // The origin of a Lovewall address ("wall.example.com", "https://x.com/app" → "https://x.com"); "" when it isn't one.
  // Plain http only for a Lovewall on this computer.
  function normalizeAppUrl(input) {
    var s = String(input || "").trim();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s) ? "http://" : "https://") + s;
    var u;
    try {
      u = new URL(s);
    } catch {
      return "";
    }
    if (u.username || u.password) return "";
    if (u.protocol === "https:" && u.hostname.indexOf(".") > 0) return u.origin;
    if (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return u.origin;
    return "";
  }

  // The host permission an app URL needs (match patterns ignore the port).
  function originPattern(appUrl) {
    var u = new URL(appUrl);
    return u.protocol + "//" + u.hostname + "/*";
  }

  function hostOf(appUrl) {
    try {
      return new URL(appUrl).host;
    } catch {
      return String(appUrl || "");
    }
  }

  // autoApprove is off unless turned on in the settings: saves wait in the inbox as new.
  function getSettings() {
    return chrome.storage.local.get(["appUrl", "apiKey", "spaceName", "autoApprove"]).then(function (s) {
      return { appUrl: s.appUrl || "", apiKey: s.apiKey || "", spaceName: s.spaceName || "", autoApprove: s.autoApprove === true };
    });
  }

  // Resolves to { ok, status, data, error, network }; never rejects.
  function request(settings, method, path, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, TIMEOUT);
    var init = {
      method: method,
      headers: { Authorization: "Bearer " + settings.apiKey, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(settings.appUrl + "/api/v1" + path, init)
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = null;
          }
          var error = !res.ok && data && data.error && typeof data.error === "object" ? data.error : null;
          return { ok: res.ok, status: res.status, data: res.ok ? data : null, error: error, network: false };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: null, error: null, network: true };
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  // A short line for a failed call.
  function messageFor(result, appUrl) {
    if (result.network) return "Can't reach " + hostOf(appUrl);
    var server = result.error && typeof result.error.message === "string" ? result.error.message.slice(0, 160) : "";
    switch (result.status) {
      case 401:
        return "Check your API key";
      case 403:
        return "This key is read-only";
      case 404:
        return "No Lovewall API at " + hostOf(appUrl);
      case 409:
        return "Already saved";
      case 429:
        return "Too many tries. Wait a minute.";
      case 400:
      case 422:
        return server || "Check the fields";
      default:
        return server || "Something went wrong (" + result.status + ")";
    }
  }

  // Only http(s) links from the server become hrefs.
  function safeLink(url) {
    try {
      var u = new URL(String(url || ""));
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
      return "";
    }
  }

  var api = {
    normalizeAppUrl: normalizeAppUrl,
    originPattern: originPattern,
    hostOf: hostOf,
    getSettings: getSettings,
    request: request,
    messageFor: messageFor,
    safeLink: safeLink,
  };
  root.LovewallApi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
