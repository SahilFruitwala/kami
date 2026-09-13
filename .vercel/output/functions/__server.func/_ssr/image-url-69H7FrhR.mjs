//#region node_modules/.nitro/vite/services/ssr/assets/image-url-69H7FrhR.js
var BLOCKED_HOSTS = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1",
	"[::1]"
]);
function isPrivateIPv4(host) {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (!m) return false;
	const oct = m.slice(1).map(Number);
	if (oct.some((n) => n > 255)) return false;
	const [a, b] = oct;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
}
function assertPublicHttpUrl(raw) {
	let url;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error("That does not look like a valid URL.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs can be saved.");
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address cannot be fetched.");
	if (isPrivateIPv4(host) || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) throw new Error("That address cannot be fetched.");
	return url;
}
function absoluteUrl(src, base) {
	try {
		const resolved = new URL(src.trim(), base);
		if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
		return resolved.href;
	} catch {
		return null;
	}
}
var JUNK = /enwiki-|wikipedia-wordmark|wikipedia-tagline|\/static\/images\/icons\/|1x1|pixel\.gif|spacer|doubleclick|scorecardresearch|facebook\.com\/tr|analytics|gravatar\.com\/avatar/i;
function isJunkImageUrl(url) {
	return JUNK.test(url);
}
function preferReadableImage(url) {
	try {
		const u = new URL(url);
		for (const key of [...u.searchParams.keys()]) if (key.startsWith("utm_")) u.searchParams.delete(key);
		if (u.hostname.endsWith("twimg.com")) {
			const name = u.searchParams.get("name");
			if (!name || name === "small" || name === "thumb" || name === "tiny") u.searchParams.set("name", "medium");
			if (!u.searchParams.get("format") && !/\.(jpg|jpeg|png|webp|gif)$/i.test(u.pathname)) u.searchParams.set("format", "jpg");
		}
		if (u.hostname.endsWith("wikimedia.org") || u.hostname.endsWith("wikipedia.org")) {
			u.pathname = u.pathname.replace(/\/(\d+)px-/g, (_m, n) => {
				const width = Number(n);
				if (width > 0 && width < 400) return "/640px-";
				return `/${n}px-`;
			});
			if (/\.svg$/i.test(u.pathname) && !u.pathname.includes("/thumb/")) {
				const file = u.pathname.split("/").pop() || "";
				const parts = u.pathname.split("/");
				const commonsIdx = parts.findIndex((p) => p === "commons" || p === "en");
				if (commonsIdx >= 0 && file) {
					const hashPath = parts.slice(commonsIdx + 1).join("/");
					u.hostname = u.hostname.includes("thumb.") ? u.hostname : "upload.wikimedia.org";
					u.pathname = `/wikipedia/commons/thumb/${hashPath}/800px-${file}.png`;
				}
			}
		}
		return u.href;
	} catch {
		return url;
	}
}
function consider(raw, baseUrl, baseScore, into) {
	if (!raw) return;
	for (const part of raw.split(",")) {
		const bits = part.trim().split(/\s+/);
		if (!bits[0]) continue;
		const abs = absoluteUrl(bits[0], baseUrl);
		if (!abs || abs.startsWith("data:") || isJunkImageUrl(abs)) continue;
		let extra = 0;
		const desc = bits[1] || "";
		if (desc.endsWith("w")) extra = parseInt(desc, 10) || 0;
		else if (desc.endsWith("x")) extra = Math.round((parseFloat(desc) || 1) * 400);
		into.push({
			url: abs,
			score: baseScore + extra
		});
	}
}
function pickImageSrc(el, baseUrl) {
	const scored = [];
	consider(el.getAttribute("srcset"), baseUrl, 200, scored);
	consider(el.getAttribute("data-srcset"), baseUrl, 150, scored);
	consider(el.getAttribute("data-src"), baseUrl, 80, scored);
	consider(el.getAttribute("data-original"), baseUrl, 80, scored);
	consider(el.getAttribute("data-lazy-src"), baseUrl, 70, scored);
	consider(el.getAttribute("data-image"), baseUrl, 60, scored);
	consider(el.getAttribute("src"), baseUrl, 10, scored);
	if (!scored.length) return null;
	scored.sort((a, b) => b.score - a.score);
	return preferReadableImage(scored[0].url);
}
function previewImageSrc(original) {
	if (!original || original.startsWith("data:") || original.startsWith("/api/img")) return original;
	return `/api/img?u=${encodeURIComponent(original)}`;
}
function rewriteHtmlImages(html) {
	return html.replace(/<img\b([^>]*?)>/gi, (_full, attrs) => {
		const srcMatch = /\ssrc\s*=\s*(["'])(.*?)\1/i.exec(` ${attrs}`);
		if (!srcMatch) return `<img${attrs}>`;
		return `<img src="${previewImageSrc(srcMatch[2])}" referrerpolicy="no-referrer" decoding="async"${attrs.replace(/\ssrc\s*=\s*(["']).*?\1/i, "")}>`;
	});
}
//#endregion
export { previewImageSrc as a, preferReadableImage as i, assertPublicHttpUrl as n, rewriteHtmlImages as o, pickImageSrc as r, absoluteUrl as t };
