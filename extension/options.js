/*! Save to Lovewall · options.js
 * App URL and API key. Save asks Chrome for access to that one site and checks the key with GET /space. "Approve on
 * save" (off by default) is kept as soon as it changes. */
(function () {
  "use strict";

  var A = globalThis.LovewallApi;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var form = $("form");
  var urlInput = $("app-url");
  var keyInput = $("api-key");
  var busy = false;

  urlInput.addEventListener("input", updateKeyLink);
  form.addEventListener("input", function (e) {
    e.target.removeAttribute("aria-invalid");
    if (!busy) setStatus("");
  });
  form.addEventListener("submit", onSubmit);
  $("disconnect").addEventListener("click", disconnect);
  $("auto-approve").addEventListener("change", function (e) {
    chrome.storage.local.set({ autoApprove: e.target.checked });
  });

  init();

  async function init() {
    var s = await A.getSettings();
    urlInput.value = s.appUrl;
    keyInput.value = s.apiKey;
    $("auto-approve").checked = s.autoApprove;
    updateKeyLink();
    $("disconnect").hidden = !s.apiKey;
    if (s.apiKey && s.spaceName) setStatus("Connected to " + s.spaceName, "ok");
    if (!s.appUrl) urlInput.focus();
    else if (!s.apiKey) keyInput.focus();
  }

  function updateKeyLink() {
    var appUrl = A.normalizeAppUrl(urlInput.value);
    $("get-key").hidden = !appUrl;
    $("get-key").href = appUrl ? appUrl + "/app" : "#";
  }

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    var appUrl = A.normalizeAppUrl(urlInput.value);
    var apiKey = keyInput.value.trim();
    if (!urlInput.value.trim()) return invalid(urlInput, "Add your Lovewall address");
    if (!appUrl) return invalid(urlInput, /^\s*http:/i.test(urlInput.value) ? "Use an https address" : "Enter a valid URL");
    if (!apiKey) return invalid(keyInput, "Add your API key");
    if (!/^lw_[A-Za-z0-9]+$/.test(apiKey)) return invalid(keyInput, "Keys start with lw_");

    // Ask while the click still counts as a user gesture: nothing awaited before this call.
    var pattern = A.originPattern(appUrl);
    var asked = chrome.permissions.request({ origins: [pattern] });
    setBusy(true);
    asked
      .catch(function () {
        return false;
      })
      .then(function (granted) {
        return granted ? check(appUrl, apiKey, pattern) : setStatus("Allow access to " + A.hostOf(appUrl) + " to connect", "error");
      })
      .finally(function () {
        setBusy(false);
      });
  }

  async function check(appUrl, apiKey, pattern) {
    setStatus("Checking…");
    var res = await A.request({ appUrl: appUrl, apiKey: apiKey }, "GET", "/space");
    if (!res.ok) {
      var field = res.status === 401 || res.status === 403 ? keyInput : res.network || res.status === 404 ? urlInput : null;
      if (field) field.setAttribute("aria-invalid", "true");
      setStatus(A.messageFor(res, appUrl), "error");
      return;
    }
    var space = (res.data && res.data.data) || {};
    var name = String(space.name || "your space").slice(0, 80);
    var old = await A.getSettings();
    await chrome.storage.local.set({ appUrl: appUrl, apiKey: apiKey, spaceName: name });
    // Let go of an address that is no longer used.
    var oldPattern = old.appUrl ? A.originPattern(old.appUrl) : pattern;
    if (oldPattern !== pattern) {
      chrome.permissions.remove({ origins: [oldPattern] }).catch(function () {});
    }
    urlInput.value = appUrl;
    urlInput.removeAttribute("aria-invalid");
    keyInput.removeAttribute("aria-invalid");
    $("disconnect").hidden = false;
    setStatus("Connected to " + name, "ok");
  }

  async function disconnect() {
    await chrome.storage.local.remove(["apiKey", "spaceName"]);
    keyInput.value = "";
    $("disconnect").hidden = true;
    setStatus("Disconnected");
    keyInput.focus();
  }

  function invalid(input, message) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    setStatus(message, "error");
  }

  function setBusy(on) {
    busy = on;
    $("save").disabled = on;
    form.setAttribute("aria-busy", on ? "true" : "false");
  }

  function setStatus(message, kind) {
    var el = $("status");
    el.textContent = message;
    el.classList.toggle("error", kind === "error");
    el.classList.toggle("ok", kind === "ok");
  }
})();
