/*! Save to Lovewall · parse.js
 * Turns what collect.js read near the selection into a testimonial draft: { name, title, handle, source, source_url,
 * text }. Pure (no DOM, no chrome.*), so the popup, the service worker (importScripts) and Node tests share it. */
(function (root) {
  "use strict";

  // Same limits as the API, so a draft never fails validation on length.
  var MAX = { name: 80, title: 80, handle: 60, source: 32, text: 3000, url: 500 };

  var SITES = [
    { id: "x", source: "X", hosts: ["x.com", "twitter.com"] },
    { id: "linkedin", source: "LinkedIn", hosts: ["linkedin.com"] },
    { id: "g2", source: "G2", hosts: ["g2.com"] },
    { id: "producthunt", source: "Product Hunt", hosts: ["producthunt.com"] },
    { id: "reddit", source: "Reddit", hosts: ["reddit.com"] },
  ];

  // Query parameters that only track the click, per site ("*" everywhere).
  var TRACKING = {
    "*": /^(utm_[a-z_]+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|ref_url)$/i,
    x: /^(s|t|ref_src|ref_url)$/i,
    linkedin: /^(trk|trkInfo|lipi|rcm|trackingId|midToken|midSig|originalSubdomain)$/i,
    reddit: /^(share_id|context|rdt)$/i,
  };

  function str(v) {
    return typeof v === "string" ? v : "";
  }

  // At most `max` characters, never half an emoji.
  function cut(s, max) {
    if (!max || s.length <= max) return s;
    var out = s.slice(0, max);
    if (/[\ud800-\udbff]$/.test(out)) out = out.slice(0, -1);
    return out.trim();
  }

  // One line: no control, invisible or direction-changing characters, single spaces.
  function line(v, max) {
    var s = str(v)
      .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b\u200c\u200e\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cut(s, max);
  }

  // Non-empty, cleaned lines of a block of text (innerText keeps one element per line), without repeats.
  function lines(v) {
    var out = [];
    str(v)
      .split(/\r\n?|\n|\u2028|\u2029/)
      .forEach(function (l) {
        l = line(l);
        if (l && out[out.length - 1] !== l) out.push(l);
      });
    return out;
  }

  // Long text keeps its paragraphs: line breaks stay, runs of blank lines become one.
  function text(v) {
    var s = str(v)
      .replace(/\r\n?|\u2028|\u2029/g, "\n")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u00ad\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\ufeff]/g, "")
      .split("\n")
      .map(function (l) {
        return l.replace(/[ \t\u00a0]+/g, " ").trim();
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return cut(s, MAX.text);
  }

  // The host of a web page ("" for chrome://, file:, extension pages and junk).
  function hostOf(url) {
    try {
      var u = new URL(str(url));
      return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  }

  function siteOf(host) {
    for (var i = 0; i < SITES.length; i++) {
      for (var j = 0; j < SITES[i].hosts.length; j++) {
        var h = SITES[i].hosts[j];
        if (host === h || host.slice(-h.length - 1) === "." + h) return SITES[i];
      }
    }
    return null;
  }

  // An https link without credentials, fragment or click tracking; "" for anything else (javascript:, data:, http:).
  function httpsUrl(v, base, siteId) {
    var u;
    try {
      u = base ? new URL(str(v).trim(), base) : new URL(str(v).trim());
    } catch {
      return "";
    }
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return "";
    u.hash = "";
    var drop = [];
    u.searchParams.forEach(function (_, key) {
      if (TRACKING["*"].test(key) || (siteId && TRACKING[siteId] && TRACKING[siteId].test(key))) drop.push(key);
    });
    drop.forEach(function (key) {
      u.searchParams.delete(key);
    });
    var href = u.href.replace(/\?$/, "");
    return href.length <= MAX.url ? href : "";
  }

  // A person's name from a meta tag: not a link or a domain, not the site's own name.
  function personName(v, siteName) {
    var s = line(v);
    if (!s || /^https?:|^www\.|[/@]|^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s) || s.length > MAX.name) return "";
    if (siteName && s.toLowerCase() === siteName.toLowerCase()) return "";
    return s;
  }

  function parseX(c, raw, out) {
    var parts = lines(c.name);
    var handleLine = parts.filter(function (l) {
      return /^@[A-Za-z0-9_]{1,15}$/.test(l);
    })[0];
    if (handleLine) {
      out.handle = handleLine.slice(1);
      if (parts[0] !== handleLine) out.name = parts[0];
    } else {
      // All on one line: "Ada Lovelace@ada·Oct 26".
      var joined = parts.join(" ");
      var m = /@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/.exec(joined);
      if (m) {
        out.handle = m[1];
        out.name = line(joined.slice(0, m.index));
      }
    }
    var permalink = httpsUrl(c.permalink, raw.url, "x") || httpsUrl(raw.url, null, "x");
    var status = /^https:\/\/(?:[a-z]+\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/.exec(permalink);
    if (status) {
      out.source_url = status[0];
      if (!out.handle) out.handle = status[1];
    }
    if (!out.name) {
      // Page title on a post: "Ada Lovelace on X: "…" / X".
      var t = /^(?:\(\d+\)\s*)?(.+?) on (?:X|Twitter)\s*:/.exec(line(raw.title || (raw.meta && raw.meta.ogTitle)));
      if (t) out.name = t[1];
    }
  }

  // LinkedIn repeats the name for screen readers and appends the connection degree: "Jane DoeJane Doe • 2nd".
  function linkedinName(v) {
    var first = lines(v)[0] || "";
    first = first.replace(/\s*[•·]\s*.*$/, "").replace(/\s+(1st|2nd|3rd\+?|Author|Premium|Verified|Following)\b.*$/i, "");
    var half = Math.floor(first.length / 2);
    var rest = first.slice(half).trim();
    if (half > 0 && first.slice(0, half).trim() === rest) first = rest;
    return first.replace(/^View\s+(.+?)[’']s\s+profile$/i, "$1");
  }

  function parseLinkedIn(c, raw, out) {
    out.name = linkedinName(c.name);
    out.title = lines(c.title)[0] || "";
    var urn = line(c.urn);
    var post = /^urn:li:(activity|share|ugcPost):\d+$/.exec(urn);
    var comment = /^urn:li:comment:\((activity|ugcPost):(\d+),\d+\)$/.exec(urn);
    if (post) out.source_url = "https://www.linkedin.com/feed/update/" + urn + "/";
    else if (comment)
      out.source_url =
        "https://www.linkedin.com/feed/update/urn:li:" + comment[1] + ":" + comment[2] + "/?commentUrn=" + encodeURIComponent(urn);
  }

  function parseG2(c, raw, out) {
    var parts = lines(c.name);
    var name = parts[0] || "";
    // Anonymous reviews: "Verified User in Computer Software".
    var anon = /^(Verified User)\s+in\s+(.+)$/i.exec(name);
    if (anon) {
      out.name = "Verified User";
      out.title = anon[2];
    } else {
      out.name = name;
      out.title = lines(c.title)[0] || parts[1] || "";
    }
    out.source_url = httpsUrl(c.permalink, raw.url, "g2");
  }

  function parseProductHunt(c, raw, out) {
    out.name = lines(c.name)[0] || "";
    var h = /\/@([A-Za-z0-9_.-]{1,60})\/?$/.exec(str(c.handle).split(/[?#]/)[0]);
    if (h) out.handle = h[1];
    out.title = lines(c.title)[0] || "";
    out.source_url = httpsUrl(c.permalink, raw.url, "producthunt");
  }

  function parseReddit(c, raw, out) {
    var user = line(c.author).replace(/^\/?u\//i, "");
    if (/^[A-Za-z0-9_-]{2,40}$/.test(user) && !/^\[?deleted\]?$/i.test(user)) out.name = "u/" + user;
    out.source_url = httpsUrl(c.permalink, "https://www.reddit.com", "reddit");
  }

  function parse(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
    var c = raw.context && typeof raw.context === "object" ? raw.context : {};
    var host = hostOf(raw.url);
    var site = siteOf(host);
    var out = { name: "", title: "", handle: "", source: "", source_url: "", text: "" };

    if (site && site.id === "x") parseX(c, raw, out);
    else if (site && site.id === "linkedin") parseLinkedIn(c, raw, out);
    else if (site && site.id === "g2") parseG2(c, raw, out);
    else if (site && site.id === "producthunt") parseProductHunt(c, raw, out);
    else if (site && site.id === "reddit") parseReddit(c, raw, out);

    var siteName = line(meta.siteName);
    if (site) out.source = site.source;
    else out.source = cut(siteName, MAX.source) || cut(host, MAX.source);

    if (!out.name && !site) out.name = personName(meta.author, siteName) || personName(meta.articleAuthor, siteName);

    if (!out.source_url) {
      var page = httpsUrl(raw.url, null, site && site.id);
      var canonical = httpsUrl(raw.canonical, raw.url, site && site.id);
      out.source_url = canonical && hostOf(canonical) === host ? canonical : page;
    }

    out.text = text(raw.selection) || text(c.text);
    out.name = line(out.name, MAX.name);
    out.title = line(out.title, MAX.title);
    out.handle = line(out.handle, MAX.handle).replace(/^@+/, "");
    out.source = line(out.source, MAX.source);
    return out;
  }

  // Identifies what a draft was made from: the same page and selection give the same draft back.
  function draftKey(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    return str(raw.url) + "\n" + str(raw.selection).trim();
  }

  var api = { parse: parse, draftKey: draftKey, httpsUrl: httpsUrl, hostOf: hostOf, line: line, text: text, MAX: MAX };
  root.LovewallParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
