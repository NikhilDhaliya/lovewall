// Mock third parties for imports, mentions and media copies. The app sends every such request to
// <site>/import/<host>/<path> (IMPORT_TEST_ENDPOINT), so tests never reach a real service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTO = readFileSync(path.join(here, "..", "fixtures", "photo.png"));
// Just enough of an MP4 for the type check (an "ftyp" box), padded past the minimum size.
const MP4 = Buffer.concat([Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex"), Buffer.alloc(400)]);

const DAY = 86400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

// Sync test: the app with id 222222222 gains reviews when a test moves it to stage 2.
const stage = new Map();

function appEntries(app) {
  if (app === "111111111") {
    return [
      { id: "9001", name: "Priya Raman", title: "Love it", text: "Northwind Notes keeps my whole week in one place.", rating: 5, days: 2 },
      {
        id: "9002",
        name: "Tom Becker",
        title: "Solid",
        text: "Fast sync between my phone and laptop. Rarely think about it.",
        rating: 4,
        days: 5,
      },
      { id: "9003", name: "Ana Lima", title: "Meh", text: "Wish it had a dark icon.", rating: 3, days: 9 },
    ];
  }
  if (app === "222222222") {
    const base = [
      { id: "8001", name: "Kai Jensen", title: "Great", text: "Synced review one: the calendar view is lovely.", rating: 5, days: 10 },
      { id: "8002", name: "Lea Park", title: "Good", text: "Synced review two: the one the owner skipped.", rating: 4, days: 12 },
    ];
    if ((stage.get(app) ?? 1) < 2) return base;
    return [
      { id: "8003", name: "Omar Haddad", title: "Wow", text: "Fresh five-star review after connecting.", rating: 5, days: 0 },
      { id: "8004", name: "Ines Moreau", title: "Hmm", text: "Fresh two-star review that waits in the inbox.", rating: 2, days: 0 },
      ...base,
    ];
  }
  return [];
}

function appFeed(app, page) {
  const entries = page === 1 ? appEntries(app) : [];
  return {
    feed: {
      entry: entries.map((e) => ({
        author: { name: { label: e.name } },
        updated: { label: iso(e.days) },
        "im:rating": { label: String(e.rating) },
        id: { label: e.id },
        title: { label: e.title },
        content: { label: e.text, attributes: { type: "text" } },
      })),
    },
  };
}

const xmlEscape = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The XML flavour of the same feed (the app tries it first). App 111111111 answers it empty, so the JSON fallback runs.
function appXml(app, page) {
  const entries = page === 1 && app !== "111111111" ? appEntries(app) : [];
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns:im="http://itunes.apple.com/rss" xmlns="http://www.w3.org/2005/Atom">
<title>iTunes Store: Customer Reviews</title>${entries
    .map(
      (e) => `<entry><id>${e.id}</id><title>${xmlEscape(e.title)}</title><content type="text">${xmlEscape(e.text)}</content>
<im:rating>${e.rating}</im:rating><updated>${iso(e.days)}</updated><author><name>${xmlEscape(e.name)}</name><uri>https://itunes.apple.com/us/reviews/id1</uri></author>
<content type="html">&lt;table&gt;&lt;/table&gt;</content></entry>`,
    )
    .join("")}</feed>`;
}

const trustpilot = (reviews) =>
  `<!doctype html><html><head><title>Northwind Reviews | Read Customer Service Reviews of northwind.example</title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { businessUnit: { displayName: "Northwind" }, reviews } },
  })}</script></body></html>`;

const TRUSTPILOT_REVIEWS = [
  {
    id: "tp-0001",
    title: "Answered in minutes",
    text: "Northwind support answered in minutes &amp; fixed it.",
    rating: 5,
    dates: { publishedDate: iso(3) },
    consumer: { displayName: "Mira Okafor", imageUrl: "https://user-images.trustpilot.com/mock/73x73.png" },
  },
  {
    id: "tp-0002",
    title: "Good value",
    text: "Good value for a small team.",
    rating: 4,
    dates: { publishedDate: iso(6) },
    consumer: { displayName: "Jon Ellis" },
  },
];

const REDDIT_THREAD = [
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: "abc123",
            title: "Anyone using Northwind for notes?",
            selftext: "",
            author: "curious_cat",
            permalink: "/r/productivity/comments/abc123/anyone_using_northwind/",
            created_utc: Date.now() / 1000 - 4 * 86400,
          },
        },
      ],
    },
  },
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t1",
          data: {
            id: "c0ment1",
            body: "Switched to Northwind last year, never looked back.",
            author: "quiet_river",
            permalink: "/r/productivity/comments/abc123/anyone_using_northwind/c0ment1/",
            created_utc: Date.now() / 1000 - 3 * 86400,
          },
        },
      ],
    },
  },
];

const HN_ITEM = {
  id: 4242,
  type: "story",
  author: "founder",
  title: "Show HN: Northwind, notes that sync",
  text: null,
  created_at: iso(20),
  children: [
    {
      id: 4243,
      type: "comment",
      author: "pg_fan",
      text: "<p>Been using Northwind for a month. It&#x27;s quick.</p>",
      created_at: iso(19),
      children: [],
    },
    { id: 4244, type: "comment", author: "skeptic", text: "How is this different from the rest?", created_at: iso(19), children: [] },
  ],
};

const GOOGLE_PLACE = {
  id: "ChIJmockNorthwindCafe0001",
  displayName: { text: "Northwind Cafe" },
  formattedAddress: "1 Mock Street, Berlin",
  reviews: [
    {
      name: "places/ChIJmockNorthwindCafe0001/reviews/r1",
      rating: 5,
      text: { text: "Best flat white in Kreuzberg." },
      originalText: { text: "Best flat white in Kreuzberg." },
      authorAttribution: { displayName: "Lena Vogel", photoUri: "https://lh3.googleusercontent.com/a/mock-lena=s128" },
      publishTime: iso(4),
    },
    {
      name: "places/ChIJmockNorthwindCafe0001/reviews/r2",
      rating: 4,
      text: { text: "Cozy and quiet in the mornings." },
      authorAttribution: { displayName: "Marco Rossi" },
      publishTime: iso(8),
    },
  ],
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
  return true;
};

export function handle(req, res, url) {
  if (!url.pathname.startsWith("/import/")) return false;
  const rest = url.pathname.slice("/import/".length);
  const host = rest.split("/")[0];
  const p = `/${rest.split("/").slice(1).join("/")}`;
  const q = url.searchParams;

  if (host === "__stage") {
    stage.set(q.get("app") ?? "", Number(q.get("n") ?? 1));
    return json(res, 200, { ok: true });
  }

  // Media: any image path is the fixture photo, .mp4 a tiny MP4; "missing" is a 404.
  if (/missing/.test(p)) return json(res, 404, {});
  if (/\.mp4$/.test(p)) {
    res.writeHead(200, { "Content-Type": "video/mp4" });
    res.end(MP4);
    return true;
  }
  if (/\.(png|jpe?g|webp)$|=s\d+$|\/mock-|imagekit|attachments/.test(p) && !/api|rss|v1/.test(p)) {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(PHOTO);
    return true;
  }

  if (host === "itunes.apple.com") {
    const m = p.match(/customerreviews\/page=(\d+)\/id=(\d+)\/sortby=mostrecent\/(xml|json)/);
    // A slow store, to see the loading state.
    if (m?.[2] === "999999999") {
      setTimeout(() => json(res, 200, appFeed(m[2], 1)), 4000);
      return true;
    }
    if (m?.[3] === "xml") {
      res.writeHead(200, { "Content-Type": "text/xml; charset=UTF-8" });
      res.end(appXml(m[2], Number(m[1])));
      return true;
    }
    if (m) return json(res, 200, appFeed(m[2], Number(m[1])));
    if (p === "/lookup")
      return json(res, 200, { results: [{ trackName: q.get("id") === "222222222" ? "Northwind Calendar" : "Northwind Notes" }] });
  }

  if (host === "www.trustpilot.com" && p.startsWith("/review/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(trustpilot(q.get("page") ? [] : TRUSTPILOT_REVIEWS));
    return true;
  }

  // G2 answers servers with a bot wall, as the real one does.
  if (host === "www.g2.com") {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end('<html><head><title>g2.com</title></head><body><p id="cmsg">Please enable JS and disable any ad blocker</p></body></html>');
    return true;
  }

  if (host === "www.reddit.com") {
    if (p.startsWith("/search.json")) {
      return json(res, 200, {
        data: {
          children: [
            {
              kind: "t3",
              data: {
                id: "men01",
                title: "Northwind saved my semester",
                selftext: "Honestly Northwind is the only notes app that stuck.",
                author: "student_42",
                permalink: "/r/college/comments/men01/northwind_saved_my_semester/",
                created_utc: Date.now() / 1000 - 3600,
              },
            },
          ],
        },
      });
    }
    if (p.endsWith("/.json")) return json(res, 200, REDDIT_THREAD);
  }

  if (host === "hn.algolia.com") {
    if (p === "/api/v1/items/4242") return json(res, 200, HN_ITEM);
    if (p === "/api/v1/search_by_date") {
      return json(res, 200, {
        hits: [
          {
            objectID: "5151",
            author: "hn_reader",
            comment_text: "<p>Northwind is the first notes app my whole team actually uses.</p>",
            story_title: "Ask HN: Favorite notes app?",
            created_at: new Date(Date.now() - 1800_000).toISOString(),
          },
          // Matches loosely but doesn't contain the keyword: ignored.
          { objectID: "5152", author: "other", comment_text: "<p>Unrelated</p>", created_at: new Date().toISOString() },
        ],
      });
    }
  }

  if (host === "places.googleapis.com") {
    if (req.headers["x-goog-api-key"] !== "test-google-key") return json(res, 403, { error: { status: "PERMISSION_DENIED" } });
    if (p === "/v1/places:searchText" && req.method === "POST") return json(res, 200, { places: [{ id: GOOGLE_PLACE.id }] });
    if (p === `/v1/places/${GOOGLE_PLACE.id}`) return json(res, 200, GOOGLE_PLACE);
  }

  if (host === "www.youtube.com" && p === "/oembed") {
    return json(res, 200, {
      title: "Northwind in 60 seconds",
      author_name: "Desk Setups",
      author_url: "https://www.youtube.com/@desksetups",
      thumbnail_url: "https://i.ytimg.com/vi/mockvideo01/hqdefault.jpg",
    });
  }

  return json(res, 404, { error: "not mocked" });
}
