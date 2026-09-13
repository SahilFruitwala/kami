import { i as preferReadableImage, n as assertPublicHttpUrl, r as pickImageSrc, t as absoluteUrl } from "./image-url-69H7FrhR.mjs";
import { t as require_readability } from "../_libs/mozilla__readability.mjs";
import { t as parseHTML } from "../_libs/linkedom.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/extract.server-C27z0Q-W.js
var import_readability = require_readability();
var AMP = "&";
function xmlEscape(value) {
	return value.replaceAll("&", `${AMP}amp;`).replaceAll("<", `${AMP}lt;`).replaceAll(">", `${AMP}gt;`).replaceAll("\"", `${AMP}quot;`);
}
function decodeBasicEntities(value) {
	return value.replaceAll(`${AMP}nbsp;`, " ").replaceAll(`${AMP}amp;`, "&").replaceAll(`${AMP}lt;`, "<").replaceAll(`${AMP}gt;`, ">").replaceAll(`${AMP}#39;`, "'").replaceAll(`${AMP}apos;`, "'").replaceAll(`${AMP}quot;`, "\"");
}
function entityOf(entry) {
	if (!entry || typeof entry !== "object") return null;
	const rec = entry;
	const inner = rec.value && typeof rec.value === "object" ? rec.value : rec;
	return {
		type: typeof inner.type === "string" ? inner.type : void 0,
		data: inner.data && typeof inner.data === "object" ? inner.data : void 0
	};
}
function indexEntities(entityMap) {
	const out = {};
	for (const [k, v] of Object.entries(entityMap ?? {})) {
		const parsed = entityOf(v);
		if (!parsed) continue;
		const innerKey = v && typeof v === "object" && "key" in v && v.key != null ? String(v.key) : k;
		out[innerKey] = parsed;
	}
	return out;
}
function renderInline(text, styles, entityRanges, entities) {
	const opens = Array.from({ length: text.length + 1 }, () => []);
	const closes = Array.from({ length: text.length + 1 }, () => []);
	const mark = (start, end, open, close) => {
		const from = Math.max(0, Math.min(start, text.length));
		const to = Math.max(from, Math.min(end, text.length));
		if (to <= from) return;
		opens[from].push(open);
		closes[to].unshift(close);
	};
	for (const style of styles ?? []) {
		const start = style.offset ?? 0;
		const end = start + (style.length ?? 0);
		const name = (style.style || "").toUpperCase();
		if (name === "BOLD") mark(start, end, "<strong>", "</strong>");
		else if (name === "ITALIC") mark(start, end, "<em>", "</em>");
		else if (name === "UNDERLINE") mark(start, end, "<u>", "</u>");
		else if (name === "CODE" || name === "CODESTYLE") mark(start, end, "<code>", "</code>");
	}
	for (const range of entityRanges ?? []) {
		const ent = entities[String(range.key ?? "")];
		if (ent?.type === "LINK" && ent.data?.url) {
			const start = range.offset ?? 0;
			mark(start, start + (range.length ?? 0), `<a href="${xmlEscape(ent.data.url)}">`, "</a>");
		}
	}
	let out = "";
	for (let i = 0; i < text.length; i += 1) {
		out += closes[i].join("");
		out += opens[i].join("");
		out += xmlEscape(text[i] ?? "");
	}
	out += closes[text.length].join("");
	out += opens[text.length].join("");
	return out;
}
function mediaUrlFor(range, entities, mediaById) {
	const ent = entities[String(range?.key ?? "")];
	if (!ent) return null;
	if (ent.type === "DIVIDER") return "divider";
	const mediaId = ent.data?.mediaItems?.[0]?.mediaId;
	if (mediaId && mediaById.has(mediaId)) return mediaById.get(mediaId) ?? null;
	return null;
}
function xArticleBlocksToHtml(article) {
	const blocks = article.content?.blocks ?? [];
	const entities = indexEntities(article.content?.entityMap);
	const mediaById = /* @__PURE__ */ new Map();
	for (const media of article.media_entities ?? []) {
		const id = media.media_id;
		const url = media.media_info?.original_img_url;
		if (id && url) mediaById.set(id, url);
	}
	const parts = [];
	const cover = article.cover_media?.media_info?.original_img_url;
	if (cover) parts.push(`<figure><img src="${xmlEscape(cover)}" alt="${xmlEscape(article.title || "Cover")}"/></figure>`);
	let listTag = null;
	const listItems = [];
	const flushList = () => {
		if (!listTag || !listItems.length) {
			listTag = null;
			listItems.length = 0;
			return;
		}
		parts.push(`<${listTag}>${listItems.join("")}</${listTag}>`);
		listTag = null;
		listItems.length = 0;
	};
	for (const block of blocks) {
		const type = block.type || "unstyled";
		const text = block.text ?? "";
		const inline = renderInline(text, block.inlineStyleRanges, block.entityRanges, entities);
		if (type === "ordered-list-item" || type === "unordered-list-item") {
			const tag = type === "ordered-list-item" ? "ol" : "ul";
			if (listTag && listTag !== tag) flushList();
			listTag = tag;
			listItems.push(`<li>${inline}</li>`);
			continue;
		}
		flushList();
		if (type === "atomic") {
			const media = mediaUrlFor(block.entityRanges?.[0], entities, mediaById);
			if (media === "divider") parts.push("<hr/>");
			else if (media) parts.push(`<figure><img src="${xmlEscape(media)}" alt=""/></figure>`);
			continue;
		}
		if (!text.trim()) continue;
		if (type === "header-one") parts.push(`<h2>${inline}</h2>`);
		else if (type === "header-two") parts.push(`<h3>${inline}</h3>`);
		else if (type === "header-three" || type === "header-four") parts.push(`<h4>${inline}</h4>`);
		else if (type === "blockquote") parts.push(`<blockquote><p>${inline}</p></blockquote>`);
		else if (type === "code-block") parts.push(`<pre><code>${inline}</code></pre>`);
		else parts.push(`<p>${inline}</p>`);
	}
	flushList();
	return parts.join("");
}
function isBareXArticleLink(text) {
	const trimmed = text.trim();
	if (!trimmed) return false;
	return /^(https?:\/\/)?((www\.)?(x|twitter)\.com\/(?:i\/|[^/\s]+\/)article\/\d+|t\.co\/\w+)\/?$/i.test(trimmed);
}
var FETCH_TIMEOUT_MS = 12e3;
var MAX_HTML_BYTES = 2e6;
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
async function fetchText(url, accept, extraHeaders = {}) {
	const res = await fetch(url, {
		method: "GET",
		redirect: "follow",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {
			"user-agent": USER_AGENT,
			accept,
			"accept-language": "en-US,en;q=0.9",
			...extraHeaders
		}
	});
	if (!res.ok) throw new Error(`The page returned ${res.status}.`);
	const contentType = res.headers.get("content-type") ?? "";
	const buf = new Uint8Array(await res.arrayBuffer());
	if (buf.byteLength > MAX_HTML_BYTES) throw new Error("That page is too large to convert.");
	return {
		text: new TextDecoder("utf-8").decode(buf),
		finalUrl: res.url || url,
		contentType
	};
}
function classify(url) {
	const host = url.hostname.replace(/^www\./, "").toLowerCase();
	if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com" || host === "fxtwitter.com" || host === "vxtwitter.com") {
		const status = url.pathname.match(/\/status\/(\d+)/);
		if (status?.[1]) return {
			kind: "x-status",
			id: status[1],
			url
		};
		const article = url.pathname.match(/\/(?:i\/)?(?:[^/]+\/)?article\/(\d+)/) || url.pathname.match(/\/article\/(\d+)/);
		if (article?.[1]) return {
			kind: "x-article",
			id: article[1],
			url
		};
	}
	return {
		kind: "web",
		url
	};
}
function textFromHtml(html) {
	return decodeBasicEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function countWords(text) {
	if (!text) return 0;
	return text.split(/\s+/).filter(Boolean).length;
}
function excerptOf(text, max = 220) {
	if (text.length <= max) return text;
	const slice = text.slice(0, max);
	const cut = slice.lastIndexOf(" ");
	return `${(cut > 80 ? slice.slice(0, cut) : slice).trim()}…`;
}
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
	"P",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"BLOCKQUOTE",
	"UL",
	"OL",
	"LI",
	"STRONG",
	"EM",
	"B",
	"I",
	"A",
	"IMG",
	"FIGURE",
	"FIGCAPTION",
	"PRE",
	"CODE",
	"BR",
	"HR",
	"DIV",
	"SPAN",
	"TABLE",
	"THEAD",
	"TBODY",
	"TR",
	"TH",
	"TD",
	"SUP",
	"SUB"
]);
function sanitizeHtml(html, baseUrl) {
	const { document } = parseHTML(`<div id="root">${html}</div>`);
	const root = document.getElementById("root");
	if (!root) return "";
	const walk = (node) => {
		const children = Array.from(node.childNodes);
		for (const child of children) {
			if (child.nodeType === 8) {
				child.remove();
				continue;
			}
			if (child.nodeType !== 1) continue;
			const el = child;
			const tag = el.tagName.toUpperCase();
			if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "NOSCRIPT") {
				el.remove();
				continue;
			}
			walk(el);
			if (tag === "A" && (el.textContent || "").trim().toLowerCase() === "edit") {
				el.remove();
				continue;
			}
			if (!ALLOWED_TAGS.has(tag)) {
				const parent = el.parentNode;
				if (parent) {
					while (el.firstChild) parent.insertBefore(el.firstChild, el);
					el.remove();
				}
				continue;
			}
			const keep = /* @__PURE__ */ new Map();
			if (tag === "A") {
				const href = el.getAttribute("href");
				if (href) {
					const abs = absoluteUrl(href, baseUrl);
					if (abs) keep.set("href", abs);
				}
			}
			if (tag === "IMG") {
				const abs = pickImageSrc(el, baseUrl);
				if (!abs) {
					el.remove();
					continue;
				}
				keep.set("src", abs);
				const alt = el.getAttribute("alt");
				if (alt) keep.set("alt", alt);
			}
			for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
			for (const [k, v] of keep) el.setAttribute(k, v);
		}
	};
	walk(root);
	return root.innerHTML.trim();
}
function tweetTextToHtml(text, baseUrl) {
	return sanitizeHtml(xmlEscape(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`).replace(/(^|[\s])@([A-Za-z0-9_]+)/g, `$1<a href="https://x.com/$2">@$2</a>`).split(/\n{2,}/).map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`).join(""), baseUrl);
}
function formatTweetDate(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		const ms = value > 1e10 ? value : value * 1e3;
		return new Date(ms).toISOString();
	}
	if (typeof value === "string" && value.trim()) {
		const d = new Date(value);
		if (!Number.isNaN(d.getTime())) return d.toISOString();
	}
	return null;
}
function tweetToArticle(tweet, sourceUrl) {
	if (tweet.article?.content?.blocks?.length) {
		const html = xArticleBlocksToHtml(tweet.article);
		const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
		const author = tweet.author?.name ? `${tweet.author.name}${handle ? ` (${handle})` : ""}` : handle || "X";
		const canonical = tweet.url || sourceUrl;
		const cover = tweet.article.cover_media?.media_info?.original_img_url ?? null;
		return buildArticle({
			url: sourceUrl,
			canonicalUrl: canonical,
			title: tweet.article.title || "X article",
			author,
			siteName: "X",
			published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
			contentHtml: html,
			source: "x",
			heroImage: cover
		});
	}
	const text = (tweet.text || tweet.raw_text?.text || "").trim();
	if (!text || isBareXArticleLink(text)) return null;
	const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
	const author = tweet.author?.name ? `${tweet.author.name}${handle ? ` (${handle})` : ""}` : handle || "X";
	const canonical = tweet.url || sourceUrl;
	const photos = tweet.media?.photos ?? [];
	const figures = photos.map((photo) => {
		if (!photo.url) return "";
		const alt = xmlEscape(photo.altText || "Posted image");
		return `<figure><img src="${xmlEscape(photo.url)}" alt="${alt}"/></figure>`;
	}).join("");
	let quoteHtml = "";
	if (tweet.quote?.text) quoteHtml = `<blockquote><p><strong>${xmlEscape(tweet.quote.author?.screen_name ? `@${tweet.quote.author.screen_name}` : tweet.quote.author?.name || "quoted post")}</strong></p>${tweetTextToHtml(tweet.quote.text, canonical)}</blockquote>`;
	const contentHtml = sanitizeHtml(`${tweetTextToHtml(text, canonical)}${quoteHtml}${figures}`, canonical);
	const plain = textFromHtml(contentHtml);
	const words = countWords(plain);
	if (!plain) return null;
	return {
		url: sourceUrl,
		canonicalUrl: canonical,
		title: excerptOf(text.replace(/\s+/g, " "), 90),
		author,
		siteName: "X",
		published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
		excerpt: excerptOf(plain),
		contentHtml,
		wordCount: words,
		readingMinutes: Math.max(1, Math.round(words / 200)),
		source: "x",
		heroImage: photos[0]?.url ?? null
	};
}
async function extractTweet(id, sourceUrl) {
	const endpoints = [`https://api.fxtwitter.com/status/${id}`, `https://api.vxtwitter.com/Twitter/status/${id}`];
	for (const endpoint of endpoints) try {
		const { text } = await fetchText(endpoint, "application/json");
		const json = JSON.parse(text);
		if (json.tweet) {
			const article = tweetToArticle(json.tweet, sourceUrl);
			if (article) return article;
		}
		if (typeof json.text === "string" && json.text.trim()) {
			const article = tweetToArticle({
				text: json.text,
				url: json.tweetURL || sourceUrl,
				author: {
					name: json.user_name,
					screen_name: json.user_screen_name
				},
				created_at: json.date,
				media: { photos: (json.media_extended ?? []).filter((m) => m.type === "image" && m.url).map((m) => ({ url: m.url })) }
			}, sourceUrl);
			if (article) return article;
		}
	} catch {}
	try {
		const { text } = await fetchText(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(sourceUrl)}`, "application/json");
		const json = JSON.parse(text);
		if (json.html) {
			const { document } = parseHTML(`<div id="root">${json.html}</div>`);
			const plain = (document.getElementById("root")?.textContent ?? "").replace(/\s+/g, " ").trim();
			if (plain) {
				const contentHtml = tweetTextToHtml(plain, sourceUrl);
				const words = countWords(plain);
				return {
					url: sourceUrl,
					canonicalUrl: sourceUrl,
					title: excerptOf(plain, 90),
					author: json.author_name || "X",
					siteName: "X",
					published: null,
					excerpt: excerptOf(plain),
					contentHtml,
					wordCount: words,
					readingMinutes: Math.max(1, Math.round(words / 200)),
					source: "x",
					heroImage: null
				};
			}
		}
	} catch {}
	return null;
}
function metaContent(document, selectors) {
	for (const selector of selectors) {
		const el = document.querySelector(selector);
		const content = el?.getAttribute("content") || el?.getAttribute("href") || el?.textContent || "";
		if (content.trim()) return content.trim();
	}
	return "";
}
function extractJsonLd(document) {
	const scripts = Array.from(document.querySelectorAll("script[type=\"application/ld+json\"]"));
	for (const script of scripts) try {
		const raw = JSON.parse(script.textContent || "");
		const nodes = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];
		for (const node of nodes) {
			if (!node || typeof node !== "object") continue;
			const type = String(node["@type"] ?? "");
			if (!/Article|BlogPosting|NewsArticle|WebPage/i.test(type) && !node.headline) continue;
			const author = node.author;
			const authorName = typeof author === "string" ? author : Array.isArray(author) ? author.map((a) => a?.name).filter(Boolean).join(", ") : author?.name;
			const image = typeof node.image === "string" ? node.image : node.image?.url;
			return {
				title: node.headline || node.name,
				author: authorName,
				date: node.datePublished || node.dateCreated,
				image
			};
		}
	} catch {}
	return {};
}
function buildArticle(params) {
	const contentHtml = sanitizeHtml(params.contentHtml, params.canonicalUrl);
	const plain = textFromHtml(contentHtml);
	const words = countWords(plain);
	if (params.source !== "x" && words < 40) return null;
	if (!plain) return null;
	return {
		url: params.url,
		canonicalUrl: params.canonicalUrl,
		title: params.title.trim() || excerptOf(plain, 90),
		author: params.author.trim(),
		siteName: params.siteName.trim() || new URL(params.canonicalUrl).hostname.replace(/^www\./, ""),
		published: params.published,
		excerpt: excerptOf(plain),
		contentHtml,
		wordCount: words,
		readingMinutes: Math.max(1, Math.round(words / 200)),
		source: params.source,
		heroImage: params.heroImage ? preferReadableImage(params.heroImage) : null
	};
}
function readabilityFromHtml(html, pageUrl, source) {
	const { document } = parseHTML(html);
	const base = document.createElement("base");
	base.setAttribute("href", pageUrl);
	document.head?.appendChild(base);
	const ld = extractJsonLd(document);
	const ogTitle = metaContent(document, [
		"meta[property=\"og:title\"]",
		"meta[name=\"twitter:title\"]",
		"title"
	]);
	const ogSite = metaContent(document, ["meta[property=\"og:site_name\"]"]);
	const ogAuthor = metaContent(document, ["meta[name=\"author\"]", "meta[property=\"article:author\"]"]);
	const ogDate = metaContent(document, [
		"meta[property=\"article:published_time\"]",
		"meta[name=\"date\"]",
		"time[datetime]"
	]);
	const ogImage = metaContent(document, ["meta[property=\"og:image\"]", "meta[name=\"twitter:image\"]"]);
	let parsed = null;
	try {
		parsed = new import_readability.Readability(document, { charThreshold: 80 }).parse();
	} catch {
		parsed = null;
	}
	const contentHtml = parsed?.content || "";
	const title = (parsed?.title || ld.title || ogTitle || "").trim();
	const author = (parsed?.byline || ld.author || ogAuthor || "").trim();
	const published = formatTweetDate(ld.date || ogDate);
	const hero = ld.image || ogImage || null;
	return buildArticle({
		url: pageUrl,
		canonicalUrl: pageUrl,
		title,
		author,
		siteName: ogSite,
		published,
		contentHtml: contentHtml || (title ? `<p>${xmlEscape(textFromHtml(html).slice(0, 4e3))}</p>` : ""),
		source,
		heroImage: hero ? absoluteUrl(hero, pageUrl) : null
	});
}
function markdownToHtml(md) {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const out = [];
	let para = [];
	let list = [];
	const flushPara = () => {
		if (!para.length) return;
		out.push(`<p>${para.join("<br/>")}</p>`);
		para = [];
	};
	const flushList = () => {
		if (!list.length) return;
		out.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
		list = [];
	};
	const inline = (s) => xmlEscape(s).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img alt="$1" src="$2"/>`).replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			flushPara();
			flushList();
			continue;
		}
		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		if (heading) {
			flushPara();
			flushList();
			const level = heading[1].length;
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			continue;
		}
		if (/^>\s?/.test(line)) {
			flushPara();
			flushList();
			out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
			continue;
		}
		if (/^[-*]\s+/.test(line)) {
			flushPara();
			list.push(inline(line.replace(/^[-*]\s+/, "")));
			continue;
		}
		para.push(inline(line.trim()));
	}
	flushPara();
	flushList();
	return out.join("");
}
async function extractViaJina(url) {
	try {
		const { text } = await fetchText(`https://r.jina.ai/${url}`, "text/plain", { "X-Timeout": "15" });
		if (!text.trim()) return null;
		const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || "";
		const mdIndex = text.search(/Markdown Content:\s*/i);
		const html = markdownToHtml(mdIndex >= 0 ? text.slice(mdIndex).replace(/Markdown Content:\s*/i, "") : text);
		return buildArticle({
			url,
			canonicalUrl: url,
			title,
			author: "",
			siteName: new URL(url).hostname.replace(/^www\./, ""),
			published: null,
			contentHtml: html,
			source: "blog",
			heroImage: null
		});
	} catch {
		return null;
	}
}
async function extractViaGrok(html, pageUrl) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return null;
	const stripped = textFromHtml(html).slice(0, 12e3);
	if (stripped.length < 80) return null;
	try {
		const res = await fetch("https://api.x.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`
			},
			signal: AbortSignal.timeout(2e4),
			body: JSON.stringify({
				model: "grok-4.5",
				max_tokens: 2500,
				messages: [{
					role: "system",
					content: "Extract the main article from the page text. Return JSON only: {\"title\":\"\",\"author\":\"\",\"content_html\":\"\"}. content_html must be simple HTML using p, h2, h3, blockquote, ul, ol, li, strong, em, a. No scripts or classes."
				}, {
					role: "user",
					content: `URL: ${pageUrl}\n\n${stripped}`
				}]
			})
		});
		if (!res.ok) return null;
		const jsonMatch = ((await res.json()).choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;
		const parsed = JSON.parse(jsonMatch[0]);
		if (!parsed.content_html) return null;
		return buildArticle({
			url: pageUrl,
			canonicalUrl: pageUrl,
			title: parsed.title || "",
			author: parsed.author || "",
			siteName: new URL(pageUrl).hostname.replace(/^www\./, ""),
			published: null,
			contentHtml: parsed.content_html,
			source: "blog",
			heroImage: null
		});
	} catch {
		return null;
	}
}
async function extractArticleFromUrl(rawUrl) {
	let pageUrl;
	try {
		pageUrl = assertPublicHttpUrl(rawUrl);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Invalid URL."
		};
	}
	const classified = classify(pageUrl);
	if (classified.kind === "x-status" || classified.kind === "x-article") {
		const tweet = await extractTweet(classified.id, classified.url.href);
		if (tweet) return {
			ok: true,
			article: tweet
		};
	}
	let fetched = null;
	try {
		fetched = await fetchText(pageUrl.href, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
	} catch (err) {
		const viaJina = await extractViaJina(pageUrl.href);
		if (viaJina) return {
			ok: true,
			article: viaJina
		};
		return {
			ok: false,
			error: err instanceof Error ? `Could not reach that page. ${err.message}` : "Could not reach that page."
		};
	}
	const source = classified.kind === "web" ? "blog" : "x";
	const fromDom = readabilityFromHtml(fetched.text, fetched.finalUrl || pageUrl.href, source);
	if (fromDom) return {
		ok: true,
		article: fromDom
	};
	const viaJina = await extractViaJina(fetched.finalUrl || pageUrl.href);
	if (viaJina) return {
		ok: true,
		article: viaJina
	};
	const viaGrok = await extractViaGrok(fetched.text, fetched.finalUrl || pageUrl.href);
	if (viaGrok) return {
		ok: true,
		article: viaGrok
	};
	return {
		ok: false,
		error: classified.kind === "web" ? "Not enough readable text on that page. Try a public article, not a homepage or app screen." : "That post could not be read. It may be private, deleted, or behind a login."
	};
}
//#endregion
export { extractArticleFromUrl };
