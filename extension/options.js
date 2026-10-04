const api = globalThis.browser ?? globalThis.chrome;
const DEFAULT_ORIGIN = "https://kami.sahilfruitwala.com";

const form = document.getElementById("form");
const input = document.getElementById("origin");
const status = document.getElementById("status");

async function load() {
  const { origin } = await api.storage.sync.get("origin");
  input.value = origin || DEFAULT_ORIGIN;
  const granted = await api.permissions.contains({ origins: [`${input.value}/*`] });
  if (!granted) status.textContent = "Click Save to allow handing pages to this KAMI.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let origin;
  try {
    origin = new URL(input.value.trim()).origin;
  } catch {
    status.textContent = "Enter a full URL, e.g. https://kami.example.com";
    return;
  }
  // Must be requested from this click handler (user gesture).
  const granted = await api.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    status.textContent = "Permission denied — the extension can't deliver pages to that address.";
    return;
  }
  await api.storage.sync.set({ origin });
  input.value = origin;
  status.textContent = "Saved. Click the KAMI button on any article to capture it.";
});

void load();
