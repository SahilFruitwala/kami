import { i as preferReadableImage, n as assertPublicHttpUrl } from "./image-url-69H7FrhR.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fetch-image.server-C4iEdO8H.js
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var FETCH_TIMEOUT_MS = 12e3;
var MAX_IMAGE_BYTES = 12e5;
function refererFor(url) {
	const host = url.hostname;
	if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) return "https://en.wikipedia.org/";
	if (host.endsWith("twimg.com") || host.endsWith("twitter.com") || host === "x.com" || host.endsWith(".x.com")) return "https://x.com/";
	if (host.endsWith("substackcdn.com") || host.endsWith("substack.com")) return "https://substack.com/";
	if (host.endsWith("medium.com") || host.endsWith("medium.com")) return "https://medium.com/";
	return `${url.protocol}//${url.host}/`;
}
async function fetchImageBytes(rawUrl) {
	let original;
	try {
		original = assertPublicHttpUrl(rawUrl);
	} catch {
		return {
			ok: false,
			error: "invalid image url",
			status: 400
		};
	}
	const upgraded = preferReadableImage(original.href);
	const candidates = upgraded === original.href ? [original.href] : [upgraded, original.href];
	let last = {
		ok: false,
		error: "could not fetch image",
		status: 502
	};
	for (const href of candidates) {
		last = await getImage(href);
		if (last.ok) return last;
	}
	return last;
}
async function getImage(href) {
	let parsed;
	try {
		parsed = assertPublicHttpUrl(href);
	} catch {
		return {
			ok: false,
			error: "invalid image url",
			status: 400
		};
	}
	try {
		const res = await fetch(parsed.href, {
			method: "GET",
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"user-agent": USER_AGENT,
				accept: "image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.4,*/*;q=0.1",
				referer: refererFor(parsed)
			}
		});
		if (!res.ok) return {
			ok: false,
			error: `upstream ${res.status}`,
			status: res.status === 404 ? 404 : 502
		};
		const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
		if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") return {
			ok: false,
			error: "not an image",
			status: 415
		};
		const bytes = new Uint8Array(await res.arrayBuffer());
		if (bytes.byteLength === 0) return {
			ok: false,
			error: "empty image",
			status: 502
		};
		if (bytes.byteLength > MAX_IMAGE_BYTES) return {
			ok: false,
			error: "image too large",
			status: 413
		};
		return {
			ok: true,
			bytes,
			mime: sniffMime(bytes, mime)
		};
	} catch {
		return {
			ok: false,
			error: "could not fetch image",
			status: 502
		};
	}
}
function sniffMime(bytes, fallback) {
	if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80) return "image/png";
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
	if (bytes.length >= 6 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return "image/gif";
	if (bytes.length >= 12 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
	const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
	if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
	if (fallback.startsWith("image/")) return fallback;
	return "image/jpeg";
}
//#endregion
export { fetchImageBytes };
