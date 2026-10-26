/*! Save to Lovewall · background.js (service worker)
 * Right-click "Save to Lovewall" on a selection: read the page under activeTab, keep a draft in session storage, open
 * the popup. The toolbar button opens the popup directly, which reads the page itself. */
importScripts("parse.js", "collect.js");

var MENU_ID = "lovewall-save";

chrome.runtime.onInstalled.addListener(function (details) {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: MENU_ID, title: "Save to Lovewall", contexts: ["selection"] });
  });
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== MENU_ID) return;
  saveSelection(info, tab);
});

async function saveSelection(info, tab) {
  var raw = null;
  if (tab && tab.id !== undefined && tab.id >= 0) {
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: globalThis.LovewallCollect,
      });
      raw = results && results[0] ? results[0].result : null;
    } catch {
      // Pages the extension may not read (the Web Store, chrome://): the selection text is still enough.
      raw = null;
    }
  }
  raw = raw || { url: info.frameUrl || info.pageUrl || "" };
  // The popup reads the page again and keeps this draft while the page and selection match.
  var key = globalThis.LovewallParse.draftKey(raw);
  // Chrome's selectionText flattens line breaks: only a fallback.
  if (!raw.selection) raw.selection = info.selectionText || "";
  var draft = {
    tabId: tab ? tab.id : -1,
    key: key,
    fields: Object.assign(globalThis.LovewallParse.parse(raw), { rating: 0 }),
    at: Date.now(),
  };
  await chrome.storage.session.set({ draft: draft });
  await openPopup();
}

async function openPopup() {
  try {
    await chrome.action.openPopup();
    return;
  } catch {
    // No focused window or an older Chrome: a small window instead.
  }
  await chrome.windows.create({ url: chrome.runtime.getURL("popup.html?window=1"), type: "popup", width: 380, height: 640, focused: true });
}
