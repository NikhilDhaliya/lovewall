/*! Save to Lovewall · popup.js
 * The draft: from the context menu (session storage) or read from the active tab under activeTab. Edits are kept in
 * session storage until saved, so closing the popup loses nothing. */
(function () {
  "use strict";

  var P = globalThis.LovewallParse;
  var A = globalThis.LovewallApi;
  // A draft the context menu made this recently belongs to this popup, even if the page reads differently now.
  var FRESH_MS = 15000;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var form = $("form");
  var stars = $("stars");
  var asWindow = new URLSearchParams(location.search).has("window");
  if (asWindow) document.body.classList.add("as-window");

  var settings = null;
  var draft = null;
  var saving = false;
  var hoverStar = 0;
  var persistTimer = 0;

  $("settings").addEventListener("click", openOptions);
  $("setup-button").addEventListener("click", openOptions);
  $("done").addEventListener("click", function () {
    window.close();
  });
  $("unlink").addEventListener("click", function () {
    draft.fields.source_url = "";
    showLink("");
    persist();
    $("source").focus();
  });
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", onEdit);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") window.close();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !form.hidden) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Stars: native radios. Clicking the chosen star again, Backspace or "Clear" removes the rating.
  stars.addEventListener("change", function () {
    paintStars();
  });
  stars.addEventListener("mouseleave", function () {
    hoverStar = 0;
    paintStars();
  });
  stars.querySelectorAll("label").forEach(function (label, i) {
    label.addEventListener("mouseenter", function () {
      hoverStar = i + 1;
      paintStars();
    });
    label.addEventListener("click", function (e) {
      var input = $(label.htmlFor);
      if (input.checked) {
        e.preventDefault();
        clearRating();
      }
    });
  });
  stars.addEventListener("keydown", function (e) {
    if ((e.key === "Backspace" || e.key === "Delete") && e.target.name === "rating") {
      e.preventDefault();
      clearRating();
      $("star-1").focus();
    }
  });
  $("clear-rating").addEventListener("click", function () {
    clearRating();
    $("star-1").focus();
  });

  init();

  async function init() {
    settings = await A.getSettings();
    if (!settings.apiKey) return show("setup");
    $("space").textContent = settings.spaceName;
    draft = await loadDraft();
    fill(draft.fields);
    show("form");
    // Ready to type into the first empty field; a full draft saves with Ctrl/Cmd+Enter.
    var empty = ["text", "name"].filter(function (id) {
      return !$(id).value.trim();
    })[0];
    if (empty) $(empty).focus();
  }

  async function loadDraft() {
    var stored = (await chrome.storage.session.get("draft")).draft || null;
    if (asWindow && stored) return stored;
    var tab = null;
    var raw = null;
    try {
      tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
    } catch {
      tab = null;
    }
    if (tab && tab.id !== undefined) {
      try {
        var results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: globalThis.LovewallCollect });
        raw = results && results[0] ? results[0].result : null;
      } catch {
        raw = null; // a page the extension may not read
      }
    }
    var sameTab = stored && tab && stored.tabId === tab.id;
    if (sameTab && (!raw || stored.key === P.draftKey(raw) || Date.now() - stored.at < FRESH_MS)) return stored;
    raw = raw || { url: tab && tab.url };
    var fresh = { tabId: tab ? tab.id : -1, key: P.draftKey(raw), fields: Object.assign(P.parse(raw), { rating: 0 }), at: Date.now() };
    await chrome.storage.session.set({ draft: fresh });
    return fresh;
  }

  function fill(f) {
    $("text").value = f.text || "";
    $("name").value = f.name || "";
    $("title").value = f.title || "";
    $("source").value = f.source || "";
    $("handle").textContent = f.handle ? "@" + f.handle : "";
    var r = Number(f.rating) || 0;
    stars.querySelectorAll("input").forEach(function (input) {
      input.checked = Number(input.value) === r;
    });
    paintStars();
    showLink(f.source_url || "");
  }

  function showLink(url) {
    var safe = P.httpsUrl(url);
    $("link-row").hidden = !safe;
    $("link").href = safe || "#";
    $("link").textContent = safe.replace(/^https:\/\/(www\.)?/, "");
    $("link").title = safe;
  }

  function rating() {
    var checked = stars.querySelector("input:checked");
    return checked ? Number(checked.value) : 0;
  }

  function paintStars() {
    stars.dataset.show = String(hoverStar || rating());
    $("clear-rating").hidden = !rating();
  }

  function clearRating() {
    stars.querySelectorAll("input").forEach(function (input) {
      input.checked = false;
    });
    paintStars();
    onEdit();
  }

  function onEdit(e) {
    if (!draft) return;
    draft.fields = Object.assign(draft.fields, {
      text: $("text").value,
      name: $("name").value,
      title: $("title").value,
      source: $("source").value,
      rating: rating(),
    });
    if (e && e.target && e.target.removeAttribute) e.target.removeAttribute("aria-invalid");
    if (!saving) setStatus("");
    persist();
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      chrome.storage.session.set({ draft: draft });
    }, 250);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (saving) return;
    onEdit();
    var f = draft.fields;
    var body = { name: P.line(f.name, P.MAX.name), text: P.text(f.text), status: "approved" };
    if (!body.text) return invalid("text", "Add the text");
    if (!body.name) return invalid("name", "Add a name");
    var title = P.line(f.title, P.MAX.title);
    var handle = P.line(f.handle, P.MAX.handle);
    var source = P.line(f.source, P.MAX.source);
    var url = P.httpsUrl(f.source_url);
    if (title) body.title = title;
    if (handle) body.handle = handle;
    if (source) body.source = source;
    if (url) body.source_url = url;
    if (f.rating) body.rating = f.rating;

    setSaving(true);
    var res = await A.request(settings, "POST", "/testimonials", body);
    setSaving(false);
    if (res.ok) {
      clearTimeout(persistTimer);
      await chrome.storage.session.remove("draft");
      showSaved(res.data && res.data.data);
      return;
    }
    setStatus(A.messageFor(res, settings.appUrl), true);
  }

  function invalid(id, message) {
    $(id).setAttribute("aria-invalid", "true");
    $(id).focus();
    setStatus(message, true);
  }

  function setSaving(on) {
    saving = on;
    form.setAttribute("aria-busy", on ? "true" : "false");
    $("save").disabled = on;
    $("save").textContent = on ? "Saving…" : "Save";
    if (on) setStatus("");
  }

  function setStatus(message, isError) {
    var el = $("status");
    el.textContent = message;
    el.classList.toggle("error", !!isError);
  }

  function showSaved(t) {
    var inbox = A.safeLink(t && t.inbox_url);
    $("inbox").hidden = !inbox;
    if (inbox) $("inbox").href = inbox;
    $("saved-space").textContent = settings.spaceName;
    show("saved");
    $("saved-title").focus();
  }

  function show(view) {
    ["setup", "form", "saved"].forEach(function (id) {
      $(id).hidden = id !== view;
    });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    if (!asWindow) window.close();
  }
})();
