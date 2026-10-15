// Save to KAMI — toolbar button / Alt+Shift+K.
// "Summarize page with KAMI" (page context menu / Alt+Shift+S) captures the
// same way but opens a quick AI summary first, with Save / Skip.
//
// 1. Snapshot the active tab's DOM (scripts/styles stripped) via activeTab.
// 2. Open `<KAMI>/capture` in a new tab.
// 3. Inject `deliver` into that tab; it answers the page's `kami:ready`
//    pings with the payload via same-window postMessage. Nothing travels in
//    a URL, so long articles aren't truncated.
//
// The protocol lives in src/lib/bookmarklet.ts — keep `snapshot` in step
// with SNAPSHOT_SRC there.

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULT_ORIGIN = "https://kami.sahilfruitwala.com";
const MAX_CAPTURE_HTML = 1_400_000;
const LOAD_TIMEOUT_MS = 30_000;

async function kamiOrigin() {
  const { origin } = await api.storage.sync.get("origin");
  return String(origin || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

/** Runs in the article tab. */
function snapshot(max) {
  const d = document.documentElement.cloneNode(true);
  d.querySelectorAll("script,style,noscript,iframe,link,template,object,embed").forEach((e) =>
    e.remove(),
  );
  let html = d.outerHTML;
  if (html.length > max) html = html.slice(0, max);
  return { title: document.title || "Untitled", url: location.href, html };
}

/** Runs in the KAMI `/capture` tab (isolated world). */
function deliver(payload) {
  const send = () => window.postMessage({ type: "kami:capture", payload }, location.origin);
  const onMessage = (event) => {
    if (event.source === window && event.data && event.data.type === "kami:ready") send();
  };
  window.addEventListener("message", onMessage);
  send();
  setTimeout(() => window.removeEventListener("message", onMessage), 30_000);
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      api.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("KAMI took too long to open."));
    }, LOAD_TIMEOUT_MS);
    function onUpdated(id, info) {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      api.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    api.tabs.onUpdated.addListener(onUpdated);
  });
}

async function flag(tabId, text, title) {
  try {
    await api.action.setBadgeBackgroundColor({ color: "#b3261e", tabId });
    await api.action.setBadgeText({ text, tabId });
    await api.action.setTitle({ title, tabId });
  } catch {
    // tab gone
  }
}

/** `intent` is "save" (default) or "peek" (summarize first, see /peek). */
async function capture(tab, intent = "save") {
  if (!tab || tab.id == null) return;
  const origin = await kamiOrigin();
  if (!(await api.permissions.contains({ origins: [`${origin}/*`] }))) {
    await api.runtime.openOptionsPage();
    return;
  }

  let payload;
  try {
    const [injection] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: snapshot,
      args: [MAX_CAPTURE_HTML],
    });
    payload = injection && injection.result;
  } catch {
    // Browser-internal pages, the extension store, PDFs, etc.
  }
  if (!payload || !payload.html) {
    await flag(
      tab.id,
      "!",
      "KAMI can't capture this page (browser pages and stores are off-limits).",
    );
    return;
  }

  const kamiTab = await api.tabs.create({
    url: `${origin}/capture?via=extension${intent === "peek" ? "&intent=peek" : ""}`,
    index: tab.index + 1,
  });
  try {
    await waitForLoad(kamiTab.id);
    // The captured page can be private (signed-in pages, paywalls): only hand
    // it over if the tab is still on KAMI's /capture — not a sign-in detour
    // or anywhere else it may have been redirected.
    const loaded = await api.tabs.get(kamiTab.id);
    let landed = null;
    try {
      landed = new URL(loaded.url || "");
    } catch {
      // unreadable URL → treat as not KAMI
    }
    if (!landed || landed.origin !== origin || landed.pathname !== "/capture") {
      throw new Error("KAMI didn't open its capture page (are you signed in?).");
    }
    await api.scripting.executeScript({
      target: { tabId: kamiTab.id },
      func: deliver,
      args: [payload],
    });
  } catch (err) {
    await flag(tab.id, "!", `KAMI capture failed: ${err instanceof Error ? err.message : err}`);
  }
}

api.action.onClicked.addListener((tab) => {
  void capture(tab);
});

api.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "kami-peek") return;
  const active = tab ?? (await api.tabs.query({ active: true, currentWindow: true }))[0];
  void capture(active, "peek");
});

// Right-click a link → save it by URL (server-side fetch, like the share sheet).
// Right-click a page → summarize it before saving.
api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: "kami-save-link",
    title: "Save link to KAMI",
    contexts: ["link"],
  });
  api.contextMenus.create({
    id: "kami-peek",
    title: "Summarize page with KAMI",
    contexts: ["page"],
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "kami-peek") {
    void capture(tab, "peek");
    return;
  }
  if (info.menuItemId !== "kami-save-link" || !info.linkUrl) return;
  const origin = await kamiOrigin();
  await api.tabs.create({
    url: `${origin}/share?url=${encodeURIComponent(info.linkUrl)}`,
    index: tab ? tab.index + 1 : undefined,
  });
});
