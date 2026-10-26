/*! Lovewall embed loader · MIT (see LICENSE-embed in the repository) · github.com/NikhilDhaliya/lovewall */
(function (w, d) {
  if (w.Lovewall) return w.Lovewall.scan();
  var me = d.currentScript || [].slice.call(d.querySelectorAll('script[src*="/embed.js"]')).pop();
  var base = me ? new URL(me.src, location.href).origin : "";
  var frames = [];
  var queued = 0;

  function mount(el) {
    if (el.getAttribute("data-lovewall-ready")) return;
    var id = (el.getAttribute("data-lovewall") || "").replace(/[^A-Za-z0-9]/g, "");
    if (!id) return;
    el.setAttribute("data-lovewall-ready", "1");
    var f = d.createElement("iframe");
    f.src = base + "/embed/" + id;
    f.title = el.getAttribute("data-title") || "Testimonials";
    // Popups float over the page wherever the div sits, so they load right away.
    f.loading = el.hasAttribute("data-lovewall-float") ? "eager" : "lazy";
    f.allowFullscreen = true;
    f.setAttribute("allow", "fullscreen");
    f.setAttribute("scrolling", "no");
    f.style.cssText = "display:block;width:100%;height:1px;border:0;overflow:hidden;background:transparent;color-scheme:normal";
    el.appendChild(f);
    frames.push(f);
  }

  function scan() {
    queued = 0;
    var list = d.querySelectorAll("[data-lovewall]");
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }

  // Popup: a fixed iframe the size of the card, in a corner; hidden (and click-through) between cards.
  function float(f, m) {
    var s = f.style,
      pos = String(m.float.pos || ""),
      top = pos.indexOf("top") === 0,
      left = pos.indexOf("left") > 0,
      small = w.innerWidth < 640;
    s.position = "fixed";
    s.zIndex = "2147483000";
    s.width = small ? "100%" : "392px";
    s.maxWidth = "100%";
    s.height = Math.max(0, Math.min(m.height || 0, 600)) + "px";
    s.top = top ? "6px" : "auto";
    s.bottom = top ? "auto" : "6px";
    s.left = small ? "0" : left ? "6px" : "auto";
    s.right = small || left ? "auto" : "6px";
    s.visibility = m.show ? "visible" : "hidden";
    s.display = small && !m.float.phones ? "none" : "block";
  }

  // A lightbox inside the widget: the iframe covers the screen until it closes (its place in the page is kept).
  function modal(f, on) {
    if (on === !!f.lwModal) return;
    f.lwModal = on;
    if (on) {
      f.lwCss = f.style.cssText;
      f.parentNode.style.minHeight = f.offsetHeight + "px";
      f.style.cssText += ";position:fixed;top:0;left:0;width:100vw;height:100vh;max-width:none;z-index:2147483001;visibility:visible";
    } else {
      f.style.cssText = f.lwCss;
      f.parentNode.style.minHeight = "";
    }
  }

  // Google review stars: the widget hands over its JSON-LD, added once to this page's <head>.
  function stars(id, text) {
    id = String(id).replace(/[^A-Za-z0-9]/g, "");
    if (!id || d.querySelector('script[data-lovewall-ld="' + id + '"]')) return;
    try {
      var data = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (!data || data["@context"] !== "https://schema.org") return;
    var s = d.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-lovewall-ld", id);
    s.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
    d.head.appendChild(s);
  }

  // Each widget reports its size; the iframe follows, so there is never a scrollbar.
  w.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== base || !m || typeof m !== "object" || !m.lovewall) return;
    frames = frames.filter(function (f) { return f.isConnected; });
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.contentWindow !== e.source) continue;
      if (typeof m.ld === "string") stars(m.lovewall, m.ld);
      modal(f, !!m.modal);
      if (m.modal) continue;
      if (m.float) float(f, m);
      else if (typeof m.height === "number") {
        f.style.height = Math.max(0, Math.min(m.height, 30000)) + "px";
        if (m.inline && m.width) {
          f.style.width = m.width + "px";
          f.style.maxWidth = "100%";
          f.style.display = "inline-block";
          f.style.verticalAlign = "middle";
        }
      }
    }
  });

  w.Lovewall = { scan: scan };
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", scan);
  else scan();
  // Single-page apps add the div later: watch for it (batched per frame).
  if (w.MutationObserver) {
    new MutationObserver(function () {
      if (!queued) queued = (w.requestAnimationFrame || setTimeout)(scan);
    }).observe(d.documentElement, { childList: true, subtree: true });
  }
})(window, document);
