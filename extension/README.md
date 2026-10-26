# Save to Lovewall (Chrome extension)

Select praise on any page, right-click **Save to Lovewall**, check the draft, save. It lands in your Lovewall inbox as
new, with the page link as its source, and waits for you to approve it (turn on **Approve on save** in the settings
to skip that). The toolbar button (or Alt+Shift+L) does the same for the current page.

- Manifest V3, plain JS/HTML/CSS: no build step, no remote code, no frameworks.
- Talks only to the Lovewall address you enter in its settings (there is no default). Chrome asks for access to that
  one site when you save it. The API key stays in `chrome.storage.local`; drafts live in `chrome.storage.session` until
  saved.
- Reads a page only when you click: the menu item, the toolbar button or the shortcut (`activeTab`). No content
  scripts, nothing in the background.
- Pre-fills name, title, @handle and source on X, LinkedIn, G2, Product Hunt and Reddit; elsewhere the site name and
  author tags.

## Files

| File                          | What it does                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `manifest.json`               | Permissions: `activeTab`, `scripting`, `contextMenus`, `storage`; your Lovewall's host, asked for in the settings |
| `background.js`               | Service worker: the context menu, reads the page, keeps the draft, opens the popup                                |
| `collect.js`                  | `collect()`, injected into the page: raw strings near the selection                                               |
| `parse.js`                    | Pure: raw strings → `{ name, title, handle, source, source_url, text }` (tested in Node)                          |
| `api.js`                      | Settings and calls to `/api/v1`                                                                                   |
| `popup.html` / `popup.js`     | The draft form and its states                                                                                     |
| `options.html` / `options.js` | App URL, API key and **Approve on save** (off by default)                                                         |
| `ui.css`                      | The app's tokens, light and dark                                                                                  |

## Try it (load unpacked)

1. In Lovewall, create an API key with write access for the space you want to fill.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this `extension/` folder.
3. The settings page opens: enter your Lovewall address and the key, **Save**. Chrome asks once for access to that
   address. It shows the space name when the key works.
4. Select a review on any page, right-click **Save to Lovewall**.

Tests: `pnpm exec playwright test e2e/integrations-unit.spec.ts` (parse.js cases, collect.js on sample pages, and the
unpacked extension in headless Chrome with axe).

## Publish to the Chrome Web Store

1. Bump `version` in `manifest.json`, then run `pnpm extension:zip`. It writes
   `dist/lovewall-extension-<version>.zip`.
2. One time: register at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole)
   ($5 fee), and verify the contact email.
3. **New item** → upload the zip. Fill the listing:
   - Description: what it does in two lines (select, right-click, save to your Lovewall).
   - Category: Productivity. Language: English.
   - Icon: `icons/icon-128.png`. Screenshots: 1280×800 of the popup over a page and of the settings page.
4. **Privacy** tab:
   - Single purpose: "Save selected text from a web page as a testimonial in the user's own Lovewall."
   - Permissions: `activeTab` + `scripting` read the selection and the author near it when the user clicks;
     `contextMenus` adds the menu item; `storage` keeps the address, the API key, the approve setting and the draft;
     the one optional host the user grants in the settings (their Lovewall address) is where saves go.
   - Remote code: no.
   - Data use: "Website content" (the selected text and page link), sent only to the Lovewall address the user
     set, at the user's request. Not sold, not used for anything else. Privacy policy URL: Lovewall's privacy page.
5. Submit for review. Updates: bump the version, zip, upload under **Package**, submit.
