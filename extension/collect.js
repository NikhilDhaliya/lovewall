/*! Save to Lovewall · collect.js
 * collect() runs inside the page through chrome.scripting.executeScript, so it must stay self-contained: no outer
 * variables, no helpers outside its body. It only reads plain strings near the selection; parse.js makes sense of
 * them. */
globalThis.LovewallCollect = function collect() {
  function clip(s, max) {
    return String(s || "").slice(0, max || 600);
  }
  function textOf(el, max) {
    return el ? clip(el.innerText || el.textContent, max) : "";
  }
  function attr(el, name) {
    return el ? clip(el.getAttribute(name)) : "";
  }
  function linkOf(el) {
    return el && el.href ? clip(String(el.href), 1000) : "";
  }
  function meta(selector) {
    return attr(document.querySelector(selector), "content");
  }

  var selection = "";
  var start = null;
  var sel = window.getSelection ? window.getSelection() : null;
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    selection = clip(sel.toString(), 12000);
    var node = sel.getRangeAt(0).commonAncestorContainer;
    start = node.nodeType === 1 ? node : node.parentElement;
  }
  var active = document.activeElement;
  if (!selection && active && /^(TEXTAREA|INPUT)$/.test(active.tagName) && typeof active.selectionStart === "number") {
    selection = clip(String(active.value).slice(active.selectionStart, active.selectionEnd), 12000);
    if (selection) start = active;
  }

  // The nearest ancestor of the selection that contains a match: the post or comment the selection belongs to.
  function near(selector, from) {
    for (var el = from || start, depth = 0; el && depth < 30; el = el.parentElement, depth++) {
      if (el.matches(selector)) return { box: el, hit: el };
      var hit = el.querySelector(selector);
      if (hit) return { box: el, hit: hit };
    }
    return null;
  }
  function closest(selector) {
    return start && start.closest ? start.closest(selector) : null;
  }

  var host = location.hostname.toLowerCase().replace(/^www\./, "");
  function on(domain) {
    return host === domain || host.slice(-domain.length - 1) === "." + domain;
  }

  var c = {};
  var found;
  if (on("x.com") || on("twitter.com")) {
    var tweet = closest('article[data-testid="tweet"]');
    if (!tweet && !selection) {
      // Toolbar on a post page: the post the address points at.
      var id = (/\/status\/(\d+)/.exec(location.pathname) || [])[1];
      var stamp = id && document.querySelector('article[data-testid="tweet"] a[href*="/status/' + id + '"] time');
      tweet = stamp ? stamp.closest("article") : null;
    }
    if (tweet) {
      // From the selection outwards, so a quoted post gives the quoted author.
      found = near('[data-testid="User-Name"]', start || tweet.querySelector('[data-testid="tweetText"]') || tweet);
      if (found) c.name = textOf(found.hit);
      var time = tweet.querySelector('a[href*="/status/"] time');
      c.permalink = linkOf(time && time.closest("a"));
      c.text = textOf(tweet.querySelector('[data-testid="tweetText"]'), 12000);
    }
  } else if (on("linkedin.com")) {
    found = near(
      ".comments-comment-meta__description-title, .comments-post-meta__name-text, .update-components-actor__title, .update-components-actor__name, .feed-shared-actor__name",
    );
    if (found) {
      // LinkedIn doubles names and headlines for screen readers; the aria-hidden copy is the visible one.
      var visible = function (el) {
        return el && (el.querySelector('[aria-hidden="true"]') || el);
      };
      c.name = textOf(visible(found.hit));
      c.title = textOf(
        visible(
          found.box.querySelector(
            ".comments-comment-meta__description-subtitle, .comments-post-meta__headline, .update-components-actor__description, .feed-shared-actor__description",
          ),
        ),
      );
    }
    var urnEl = closest('[data-id^="urn:li:comment"], [data-urn^="urn:li:"], [data-id^="urn:li:"]');
    c.urn = attr(urnEl, "data-urn") || attr(urnEl, "data-id");
  } else if (on("g2.com")) {
    found = near('[itemprop="author"], [data-testid="reviewer-name"], .reviewer-name, .link--header-color');
    if (found) {
      c.name = textOf(found.hit);
      c.title = textOf(found.box.querySelector('[itemprop="jobTitle"], [data-testid="reviewer-title"], .reviewer-title, .mt-4th'));
      c.permalink = linkOf(found.box.querySelector('a[href*="/reviews/"][href*="-review-"]'));
    }
  } else if (on("producthunt.com")) {
    found = near('a[href^="/@"], a[href*="producthunt.com/@"]');
    if (found) {
      var people = found.box.querySelectorAll('a[href^="/@"], a[href*="producthunt.com/@"]');
      for (var i = 0; i < people.length; i++) {
        if (textOf(people[i]).trim()) {
          c.name = textOf(people[i]);
          c.handle = attr(people[i], "href");
          break;
        }
      }
      c.title = textOf(found.box.querySelector('[data-test="user-headline"], [data-test="headline"]'));
    }
  } else if (on("reddit.com")) {
    var thing = closest("shreddit-comment, shreddit-post, .thing[data-author]") || (!selection && document.querySelector("shreddit-post"));
    if (thing) {
      c.author = attr(thing, "author") || attr(thing, "data-author");
      c.permalink = attr(thing, "permalink") || attr(thing, "data-permalink");
      c.text = textOf(thing.querySelector('[slot="text-body"], [slot="comment"]'), 12000);
    }
  }

  return {
    url: clip(location.href, 2000),
    title: clip(document.title, 300),
    selection: selection,
    canonical: linkOf(document.querySelector('link[rel="canonical"]')),
    meta: {
      siteName: meta('meta[property="og:site_name"]'),
      ogTitle: meta('meta[property="og:title"]'),
      author: meta('meta[name="author"]'),
      articleAuthor: meta('meta[property="article:author"]'),
    },
    context: c,
  };
};
