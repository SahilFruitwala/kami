# Save to KAMI — browser extension

A toolbar button (and **Alt+Shift+K**) that captures the page you're reading
in your own browser and hands it to KAMI. Because the page is read from your
tab, it works behind bot walls and on posts you're signed in to (e.g. paid
Substack posts), and nothing travels in a URL, so long articles aren't cut off.

Right-click any link → **Save link to KAMI** saves it by URL instead.

## Install (unpacked)

**Chrome / Edge / Brave**

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.

**Firefox (121+)**

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pick `extension/manifest.json`.
3. Click the toolbar button once — the options page opens; press **Save**
   to grant access to your KAMI address.

## Self-hosting

The extension defaults to `https://kami.sahilfruitwala.com`. To point it at
your own deployment, open the extension's **Options**, enter your KAMI URL and
press **Save**; the browser asks for permission to hand pages to that address.

## How it works

1. `background.js` snapshots the active tab (`activeTab` + `scripting`),
   dropping scripts, styles and embeds.
2. It opens `<KAMI>/capture` and injects a tiny script that answers the page's
   `kami:ready` ping with the snapshot via `window.postMessage`.
3. `/capture` stashes it and routes to Home, which runs full server-side
   extraction (site rules + Readability) and saves the clean copy.

The protocol is defined in `src/lib/bookmarklet.ts`; keep `snapshot()` in
`background.js` in step with `SNAPSHOT_SRC` there.
