import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
import { a as previewImageSrc, o as rewriteHtmlImages } from "./image-url-69H7FrhR.mjs";
import { _ as ArrowRight, a as Square, c as Pause, d as Highlighter, f as Folder, g as BookMarked, h as BookOpen, i as Trash2, l as LoaderCircle, m as ExternalLink, n as Type, o as Plus, p as FolderPlus, s as Play, t as X, u as Inbox, v as ArrowLeft, y as Archive } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-fxEJuqsq.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide", {
	variants: { variant: {
		default: "bg-paper-warm text-ink-soft",
		ink: "bg-ink text-paper"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color,color,box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 active:not-disabled:scale-[0.96]", {
	variants: {
		variant: {
			default: "bg-ink text-paper shadow-border hover:bg-ink-soft",
			secondary: "bg-surface text-ink shadow-border hover:bg-paper",
			ghost: "text-ink hover:bg-paper-warm",
			outline: "bg-transparent text-ink shadow-border hover:bg-paper"
		},
		size: {
			default: "h-11 px-4",
			sm: "h-9 px-3 text-sm",
			lg: "h-12 px-5",
			icon: "size-11"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		"data-slot": "button",
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
function relativeTime(ts) {
	const delta = Date.now() - ts;
	const minutes = Math.round(delta / 6e4);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 14) return `${days}d ago`;
	return new Date(ts).toLocaleDateString(void 0, {
		month: "short",
		day: "numeric"
	});
}
function ArticleList({ items, emptyTitle, emptyCopy, onOpen, onRemove }) {
	if (items.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center gap-3 py-16 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookOpen, { className: "size-7 text-faint" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-2xl text-ink-soft italic",
				children: emptyTitle
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-sm text-sm leading-normal text-muted",
				children: emptyCopy
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "divide-y divide-line",
		children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "group flex items-stretch gap-3 py-4 sm:gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "flex min-w-0 flex-1 items-start gap-3 text-left sm:gap-4",
				onClick: () => onOpen(item),
				children: [item.heroImage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: previewImageSrc(item.heroImage),
					alt: "",
					className: "mt-0.5 size-16 shrink-0 rounded-md object-cover shadow-border sm:size-20"
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: item.source === "x" ? "X" : item.siteName || "Article" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-xs text-muted tabular-nums",
								children: [
									item.readingMinutes,
									" min · ",
									relativeTime(item.savedAt)
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-1.5 block font-display text-xl leading-snug tracking-tight text-ink",
							children: item.title
						}),
						item.excerpt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-1 line-clamp-2 block text-sm leading-normal text-ink-soft",
							children: item.excerpt
						}) : null,
						item.tags?.length || item.highlights?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "mt-2 flex flex-wrap gap-1.5",
							children: [(item.tags ?? []).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-paper-warm px-2 py-0.5 text-xs text-ink-soft",
								children: tag
							}, tag)), item.highlights?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-xs text-muted",
								children: [
									item.highlights.length,
									" highlight",
									item.highlights.length === 1 ? "" : "s"
								]
							}) : null]
						}) : null
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				size: "icon",
				className: "size-11 shrink-0 self-start text-muted opacity-70 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100",
				"aria-label": `Remove ${item.title}`,
				onClick: () => onRemove(item.id),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
			})]
		}, item.id))
	});
}
function Input({ className, type, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		type,
		"data-slot": "input",
		className: cn("flex h-12 w-full rounded-md bg-surface px-3.5 text-base text-ink shadow-border transition-[box-shadow] duration-[var(--motion-quick)] placeholder:text-muted file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25 disabled:cursor-not-allowed disabled:opacity-50", className),
		...props
	});
}
function articleIdFromUrl(url) {
	return url.replace(/#.*$/, "");
}
function uid() {
	return crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeTag(value) {
	return value.trim().replace(/\s+/g, " ").slice(0, 28);
}
function itemToArticle(item) {
	return {
		url: item.url,
		canonicalUrl: item.canonicalUrl || item.url,
		title: item.title,
		author: item.author,
		siteName: item.siteName,
		published: item.published,
		excerpt: item.excerpt,
		contentHtml: item.contentHtml,
		wordCount: item.wordCount,
		readingMinutes: item.readingMinutes,
		source: item.source,
		heroImage: item.heroImage
	};
}
function articleToItem(article, extras = {}) {
	const now = Date.now();
	return {
		id: articleIdFromUrl(article.canonicalUrl || article.url),
		url: article.url,
		canonicalUrl: article.canonicalUrl || article.url,
		title: article.title,
		author: article.author,
		siteName: article.siteName,
		source: article.source,
		wordCount: article.wordCount,
		readingMinutes: article.readingMinutes,
		excerpt: article.excerpt,
		contentHtml: article.contentHtml,
		heroImage: article.heroImage,
		published: article.published,
		savedAt: now,
		archived: false,
		tags: [],
		folderId: null,
		highlights: [],
		...extras
	};
}
function migrateItem(row) {
	if (!row?.url && !row?.id) return null;
	const url = row.url || row.id || "";
	const words = typeof row.wordCount === "number" ? row.wordCount : 0;
	const tags = Array.isArray(row.tags) ? row.tags.map((tag) => normalizeTag(String(tag))).filter(Boolean) : [];
	const highlights = Array.isArray(row.highlights) ? row.highlights.filter((h) => h && typeof h.text === "string" && h.text.trim()) : [];
	return {
		id: row.id || articleIdFromUrl(url),
		url,
		canonicalUrl: row.canonicalUrl || url,
		title: row.title || "Untitled",
		author: row.author || "",
		siteName: row.siteName || "",
		source: row.source === "x" ? "x" : "blog",
		wordCount: words,
		readingMinutes: row.readingMinutes || Math.max(1, Math.round(words / 200) || 1),
		excerpt: row.excerpt || "",
		contentHtml: row.contentHtml || "",
		heroImage: row.heroImage ?? null,
		published: row.published ?? null,
		savedAt: row.savedAt || row.preparedAt || Date.now(),
		archived: Boolean(row.archived),
		tags,
		folderId: row.folderId || null,
		highlights
	};
}
function mapItem(library, id, fn) {
	return library.map((row) => row.id === id ? fn(row) : row);
}
var useLibraryStore = create()(persist((set, get) => ({
	library: [],
	folders: [],
	openId: null,
	readerSize: "md",
	ttsRate: 1,
	ttsVoiceURI: "",
	upsertItem: (item) => set((state) => {
		const existing = state.library.find((row) => row.id === item.id || row.url === item.url);
		const merged = {
			...item,
			tags: existing?.tags?.length ? existing.tags : item.tags ?? [],
			folderId: existing?.folderId ?? item.folderId ?? null,
			highlights: existing?.highlights?.length ? existing.highlights : item.highlights ?? [],
			archived: existing?.archived ?? item.archived
		};
		return {
			library: [merged, ...state.library.filter((row) => row.id !== merged.id && row.url !== merged.url)].slice(0, 60),
			openId: merged.id
		};
	}),
	archiveItem: (id, archived) => set((state) => ({ library: mapItem(state.library, id, (row) => ({
		...row,
		archived
	})) })),
	removeItem: (id) => set((state) => ({
		library: state.library.filter((row) => row.id !== id),
		openId: state.openId === id ? null : state.openId
	})),
	setOpenId: (id) => set({ openId: id }),
	setReaderSize: (size) => set({ readerSize: size }),
	setTtsRate: (rate) => set({ ttsRate: Math.min(1.75, Math.max(.7, rate)) }),
	setTtsVoiceURI: (uri) => set({ ttsVoiceURI: uri }),
	addFolder: (name) => {
		const trimmed = name.trim().slice(0, 32);
		if (!trimmed) return "";
		const existing = get().folders.find((folder) => folder.name.toLowerCase() === trimmed.toLowerCase());
		if (existing) return existing.id;
		const id = uid();
		set((state) => ({ folders: [...state.folders, {
			id,
			name: trimmed
		}].slice(0, 24) }));
		return id;
	},
	renameFolder: (id, name) => {
		const trimmed = name.trim().slice(0, 32);
		if (!trimmed) return;
		set((state) => ({ folders: state.folders.map((folder) => folder.id === id ? {
			...folder,
			name: trimmed
		} : folder) }));
	},
	removeFolder: (id) => set((state) => ({
		folders: state.folders.filter((folder) => folder.id !== id),
		library: state.library.map((row) => row.folderId === id ? {
			...row,
			folderId: null
		} : row)
	})),
	setItemFolder: (itemId, folderId) => set((state) => ({ library: mapItem(state.library, itemId, (row) => ({
		...row,
		folderId
	})) })),
	addTag: (itemId, tag) => {
		const next = normalizeTag(tag);
		if (!next) return;
		set((state) => ({ library: mapItem(state.library, itemId, (row) => {
			if (row.tags.some((t) => t.toLowerCase() === next.toLowerCase())) return row;
			return {
				...row,
				tags: [...row.tags, next].slice(0, 12)
			};
		}) }));
	},
	removeTag: (itemId, tag) => set((state) => ({ library: mapItem(state.library, itemId, (row) => ({
		...row,
		tags: row.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
	})) })),
	addHighlight: (itemId, text) => {
		const cleaned = text.replace(/\s+/g, " ").trim();
		if (cleaned.length < 8) return null;
		const highlight = {
			id: uid(),
			text: cleaned.slice(0, 800),
			note: "",
			createdAt: Date.now()
		};
		set((state) => ({ library: mapItem(state.library, itemId, (row) => {
			if (row.highlights.some((h) => h.text === highlight.text)) return row;
			return {
				...row,
				highlights: [highlight, ...row.highlights].slice(0, 80)
			};
		}) }));
		return highlight;
	},
	removeHighlight: (itemId, highlightId) => set((state) => ({ library: mapItem(state.library, itemId, (row) => ({
		...row,
		highlights: row.highlights.filter((h) => h.id !== highlightId)
	})) })),
	setHighlightNote: (itemId, highlightId, note) => set((state) => ({ library: mapItem(state.library, itemId, (row) => ({
		...row,
		highlights: row.highlights.map((h) => h.id === highlightId ? {
			...h,
			note: note.slice(0, 280)
		} : h)
	})) })),
	clearLibrary: () => set({
		library: [],
		openId: null
	})
}), {
	name: "quarto-library",
	version: 5,
	migrate: (persisted) => {
		const raw = persisted || {};
		return {
			library: (raw.library || []).map(migrateItem).filter((row) => Boolean(row)),
			folders: Array.isArray(raw.folders) ? raw.folders.filter((f) => f?.id && f?.name) : [],
			openId: raw.openId ?? null,
			readerSize: raw.readerSize === "lg" ? "lg" : "md",
			ttsRate: typeof raw.ttsRate === "number" ? raw.ttsRate : 1,
			ttsVoiceURI: raw.ttsVoiceURI || ""
		};
	}
}));
function LibraryFilters({ folderFilter, tagFilter, onFolder, onTag }) {
	const folders = useLibraryStore((s) => s.folders);
	const library = useLibraryStore((s) => s.library);
	const addFolder = useLibraryStore((s) => s.addFolder);
	const removeFolder = useLibraryStore((s) => s.removeFolder);
	const [draft, setDraft] = (0, import_react.useState)("");
	const tags = Array.from(new Set(library.flatMap((item) => item.tags.map((tag) => tag)))).sort((a, b) => a.localeCompare(b));
	function createFolder() {
		const id = addFolder(draft);
		setDraft("");
		if (id) onFolder(id);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-6 space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
					active: folderFilter === "all",
					onClick: () => onFolder("all"),
					children: "All"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
					active: folderFilter === "none",
					onClick: () => onFolder("none"),
					children: "Unfiled"
				}),
				folders.map((folder) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
						active: folderFilter === folder.id,
						onClick: () => onFolder(folder.id),
						children: folder.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "ml-0.5 size-8 text-muted hover:text-ink",
						"aria-label": `Delete folder ${folder.name}`,
						onClick: () => {
							if (folderFilter === folder.id) onFolder("all");
							removeFolder(folder.id);
						},
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "mx-auto size-3.5" })
					})]
				}, folder.id)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					value: draft,
					onChange: (e) => setDraft(e.target.value),
					onKeyDown: (e) => {
						if (e.key !== "Enter") return;
						e.preventDefault();
						createFolder();
					},
					placeholder: "New folder",
					className: "h-11 w-36"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "icon",
					"aria-label": "Create folder",
					onClick: createFolder,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, { className: "size-4" })
				})
			]
		}), tags.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
				active: tagFilter === tag,
				onClick: () => onTag(tagFilter === tag ? null : tag),
				children: tag
			}, tag))
		}) : null]
	});
}
function FilterChip({ active, onClick, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: cn("h-11 rounded-full px-3 text-sm transition-colors duration-150", active ? "bg-ink text-paper" : "bg-paper-warm text-ink-soft hover:text-ink"),
		children
	});
}
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function textNodes$1(root) {
	const walker = root.ownerDocument.createTreeWalker(root, 4);
	const nodes = [];
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (!node.data.length) continue;
		if (node.parentElement?.closest("mark")) continue;
		nodes.push(node);
	}
	return nodes;
}
function wrapQuote(root, quote, id) {
	const nodes = textNodes$1(root);
	if (!nodes.length) return false;
	let concat = "";
	const index = [];
	for (const node of nodes) for (let i = 0; i < node.data.length; i += 1) {
		concat += node.data[i];
		index.push({
			node,
			offset: i
		});
	}
	const words = quote.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
	if (!words.length) return false;
	const match = concat.match(new RegExp(words.join("\\s+")));
	if (!match || match.index == null) return false;
	const from = match.index;
	const to = from + match[0].length;
	if (to <= from) return false;
	const slices = [];
	let current = null;
	for (let i = from; i < to; i += 1) {
		const point = index[i];
		if (!point) continue;
		if (!current || current.node !== point.node) {
			current = {
				node: point.node,
				from: point.offset,
				to: point.offset + 1
			};
			slices.push(current);
		} else current.to = point.offset + 1;
	}
	for (let i = slices.length - 1; i >= 0; i -= 1) {
		const slice = slices[i];
		if (!slice || slice.to <= slice.from) continue;
		const parent = slice.node.parentNode;
		if (!parent || parent.nodeName === "MARK") continue;
		const text = slice.node.data;
		const before = text.slice(0, slice.from);
		const mid = text.slice(slice.from, slice.to);
		const after = text.slice(slice.to);
		if (!mid) continue;
		const doc = slice.node.ownerDocument;
		const mark = doc.createElement("mark");
		mark.setAttribute("data-hid", id);
		mark.appendChild(doc.createTextNode(mid));
		const frag = doc.createDocumentFragment();
		if (before) frag.appendChild(doc.createTextNode(before));
		frag.appendChild(mark);
		if (after) frag.appendChild(doc.createTextNode(after));
		parent.replaceChild(frag, slice.node);
	}
	return slices.length > 0;
}
function applyHighlights(html, highlights) {
	if (!highlights.length || typeof DOMParser === "undefined") return html;
	const root = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html").getElementById("root");
	if (!root) return html;
	const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length);
	for (const highlight of sorted) {
		const quote = highlight.text.trim();
		if (quote.length < 8) continue;
		wrapQuote(root, quote, highlight.id);
	}
	return root.innerHTML;
}
function ttsAvailable() {
	return typeof window !== "undefined" && "speechSynthesis" in window;
}
var SKIP_VOICE = /compact|novelty|whisper|zarvox|bad news|good news|bells|boing|bubbles|cellos|deranged|hysterical|organ|pipe organ|princess|ralph|trinoids|albert|bahh|superstar|grandma|grandpa|flo|wobble|cellos/i;
var PREFERRED_VOICE = /samantha|daniel|karen|moira|rishi|fiona|veena|tessa|aria|jenny|guy|andrew|emma|sonia|google us english|google uk english female|neural/i;
function voiceLabel(voice) {
	let name = voice.name.replace(/^Google /i, "").replace(/^Microsoft /i, "").replace(/^Apple /i, "").replace(/ Online \(Natural\)/i, "").replace(/ \(Natural\)/i, "").replace(/ - English \(.*\)$/i, "").trim();
	const region = /en-GB/i.test(voice.lang) ? "UK" : /en-AU/i.test(voice.lang) ? "AU" : /en-IN/i.test(voice.lang) ? "IN" : /en-US/i.test(voice.lang) ? "US" : "";
	if (region && !name.includes(region) && name.length < 18) name = `${name} (${region})`;
	return name;
}
function scoreVoice(voice) {
	let score = 0;
	if (SKIP_VOICE.test(voice.name)) return -100;
	if (!/^en/i.test(voice.lang)) score -= 20;
	if (voice.localService) score += 6;
	if (/en-US/i.test(voice.lang)) score += 3;
	if (/en-GB/i.test(voice.lang)) score += 3;
	if (/en-AU|en-IN/i.test(voice.lang)) score += 2;
	if (PREFERRED_VOICE.test(voice.name)) score += 8;
	if (/neural|natural|premium|enhanced/i.test(voice.name)) score += 5;
	if (/google/i.test(voice.name) && /english/i.test(voice.name)) score += 4;
	if (/microsoft/i.test(voice.name) && /online|neural|aria|jenny/i.test(voice.name)) score += 4;
	if (/compact/i.test(voice.name)) score -= 8;
	return score;
}
function listVoices(keepURI = "") {
	if (!ttsAvailable()) return [];
	const all = window.speechSynthesis.getVoices();
	const ranked = all.filter((voice) => /^en/i.test(voice.lang) && scoreVoice(voice) > 0).sort((a, b) => scoreVoice(b) - scoreVoice(a));
	const picked = [];
	const seenLang = /* @__PURE__ */ new Set();
	const seenName = /* @__PURE__ */ new Set();
	for (const voice of ranked) {
		if (picked.length >= 4) break;
		const lang = voice.lang.slice(0, 5).toLowerCase();
		const label = voiceLabel(voice).toLowerCase();
		if (seenName.has(label)) continue;
		if (seenLang.has(lang) && picked.length >= 2) continue;
		seenLang.add(lang);
		seenName.add(label);
		picked.push(voice);
	}
	if (picked.length === 0 && ranked[0]) picked.push(ranked[0]);
	if (keepURI && !picked.some((voice) => voice.voiceURI === keepURI)) {
		const extra = all.find((voice) => voice.voiceURI === keepURI);
		if (extra) picked.push(extra);
	}
	return picked;
}
function pickVoice(preferredURI = "") {
	const voices = window.speechSynthesis.getVoices();
	if (!voices.length) return null;
	if (preferredURI) {
		const match = voices.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
		if (match) return match;
	}
	return voices.find((v) => /en-US/i.test(v.lang) && v.localService) || voices.find((v) => /^en/i.test(v.lang) && v.localService) || voices.find((v) => /en-US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || voices[0] || null;
}
function chunkText(text) {
	const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
	const chunks = [];
	let buf = "";
	for (const part of parts) {
		const piece = part.trim();
		if (!piece) continue;
		if ((buf + " " + piece).trim().length > 360) {
			if (buf) chunks.push(buf);
			buf = piece;
		} else buf = buf ? `${buf} ${piece}` : piece;
	}
	if (buf) chunks.push(buf);
	return chunks;
}
function speakArticle(text, options) {
	const synth = window.speechSynthesis;
	synth.cancel();
	synth.getVoices();
	const chunks = chunkText(text).slice(0, 100);
	const offsets = [];
	let running = 0;
	for (const chunk of chunks) {
		offsets.push(running);
		running += chunk.length + 1;
	}
	let index = 0;
	let stopped = false;
	let rate = options.rate;
	let voiceURI = options.voiceURI;
	const speakNext = () => {
		if (stopped || index >= chunks.length) {
			if (!stopped) {
				options.onWord?.({
					word: "",
					start: 0,
					end: 0
				});
				options.onStatus("idle");
			}
			return;
		}
		const chunk = chunks[index] ?? "";
		const utter = new SpeechSynthesisUtterance(chunk);
		const voice = pickVoice(voiceURI);
		if (voice) utter.voice = voice;
		utter.rate = rate;
		utter.pitch = 1;
		utter.onboundary = (event) => {
			if (stopped) return;
			if (event.name && event.name !== "word") return;
			const startInChunk = event.charIndex || 0;
			const rawLen = "charLength" in event ? Number(event.charLength) : 0;
			const guessed = chunk.slice(startInChunk).match(/^\S+/)?.[0].length ?? 1;
			const len = rawLen > 0 ? rawLen : guessed;
			const word = chunk.slice(startInChunk, startInChunk + len).trim();
			if (!word) return;
			const start = (offsets[index] ?? 0) + startInChunk;
			options.onWord?.({
				word,
				start,
				end: start + len
			});
		};
		utter.onend = () => {
			index += 1;
			speakNext();
		};
		utter.onerror = (event) => {
			const err = "error" in event ? String(event.error) : "";
			if (err === "interrupted" || err === "canceled") return;
			if (err === "not-allowed" || err === "synthesis-failed" || err === "synthesis-unavailable") {
				stopped = true;
				options.onWord?.({
					word: "",
					start: 0,
					end: 0
				});
				options.onStatus("idle");
				return;
			}
			index += 1;
			speakNext();
		};
		options.onStatus("playing");
		synth.speak(utter);
	};
	speakNext();
	return {
		stop: () => {
			stopped = true;
			synth.cancel();
			options.onWord?.({
				word: "",
				start: 0,
				end: 0
			});
			options.onStatus("idle");
		},
		pause: () => {
			synth.pause();
			options.onStatus("paused");
		},
		resume: () => {
			synth.resume();
			options.onStatus("playing");
		},
		setOptions: (next) => {
			if (typeof next.rate === "number") rate = next.rate;
			if (typeof next.voiceURI === "string") voiceURI = next.voiceURI;
		}
	};
}
function textNodes(root) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes = [];
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (node.data.length) nodes.push(node);
	}
	return nodes;
}
function collectSpokenText(root) {
	if (!root) return "";
	return textNodes(root).map((node) => node.data).join("");
}
function rangeFromOffsets(root, start, end) {
	const nodes = textNodes(root);
	let cursor = 0;
	let startNode = null;
	let startOff = 0;
	let endNode = null;
	let endOff = 0;
	for (const node of nodes) {
		const next = cursor + node.data.length;
		if (!startNode && start < next) {
			startNode = node;
			startOff = Math.max(0, start - cursor);
		}
		if (end <= next) {
			endNode = node;
			endOff = Math.max(0, end - cursor);
			break;
		}
		cursor = next;
	}
	if (!startNode) return null;
	const range = root.ownerDocument.createRange();
	try {
		range.setStart(startNode, Math.min(startOff, startNode.data.length));
		range.setEnd(endNode ?? startNode, Math.min(endOff || startOff + 1, (endNode ?? startNode).data.length));
		return range;
	} catch {
		return null;
	}
}
function paintSpokenWord(root, start, end) {
	clearSpokenWord();
	if (!root || end <= start) return;
	const range = rangeFromOffsets(root, start, end);
	if (!range) return;
	const HighlightCtor = window.Highlight;
	if (CSS.highlights && HighlightCtor) CSS.highlights.set("spoken", new HighlightCtor(range));
	const node = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
	const rect = range.getBoundingClientRect();
	if (!(rect.top >= 96 && rect.bottom <= window.innerHeight - 24)) node?.scrollIntoView({
		block: "center",
		behavior: "smooth"
	});
}
function clearSpokenWord() {
	CSS.highlights?.delete("spoken");
}
function OrganizeRow({ item }) {
	const folders = useLibraryStore((s) => s.folders);
	const addFolder = useLibraryStore((s) => s.addFolder);
	const setItemFolder = useLibraryStore((s) => s.setItemFolder);
	const addTag = useLibraryStore((s) => s.addTag);
	const removeTag = useLibraryStore((s) => s.removeTag);
	const [folderOpen, setFolderOpen] = (0, import_react.useState)(false);
	const [addingTag, setAddingTag] = (0, import_react.useState)(false);
	const [folderDraft, setFolderDraft] = (0, import_react.useState)("");
	const [tagDraft, setTagDraft] = (0, import_react.useState)("");
	const boxRef = (0, import_react.useRef)(null);
	const folder = folders.find((row) => row.id === item.folderId);
	(0, import_react.useEffect)(() => {
		if (!folderOpen && !addingTag) return;
		const onDoc = (event) => {
			if (!boxRef.current?.contains(event.target)) {
				setFolderOpen(false);
				setAddingTag(false);
			}
		};
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, [folderOpen, addingTag]);
	function createFolder() {
		const id = addFolder(folderDraft);
		if (id) setItemFolder(item.id, id);
		setFolderDraft("");
		setFolderOpen(false);
	}
	function submitTag() {
		addTag(item.id, tagDraft);
		setTagDraft("");
		setAddingTag(false);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: boxRef,
		className: "relative mt-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-1.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm", folder ? "bg-paper-warm text-ink" : "text-muted hover:bg-paper-warm hover:text-ink"),
					onClick: () => {
						setFolderOpen((open) => !open);
						setAddingTag(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, { className: "size-3.5" }), folder?.name ?? "File"]
				}),
				item.tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex h-9 items-center gap-1 rounded-full bg-paper-warm pl-3 pr-1 text-sm text-ink-soft",
					children: [tag, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "inline-flex size-7 items-center justify-center rounded-full hover:text-ink",
						"aria-label": `Remove tag ${tag}`,
						onClick: () => removeTag(item.id, tag),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-3" })
					})]
				}, tag)),
				addingTag ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					autoFocus: true,
					value: tagDraft,
					onChange: (e) => setTagDraft(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							submitTag();
						}
						if (e.key === "Escape") setAddingTag(false);
					},
					onBlur: () => {
						if (tagDraft.trim()) submitTag();
						else setAddingTag(false);
					},
					placeholder: "Tag name",
					className: "h-9 w-28 rounded-full bg-paper-warm px-3 text-sm text-ink outline-none placeholder:text-muted"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted hover:bg-paper-warm hover:text-ink",
					onClick: () => {
						setAddingTag(true);
						setFolderOpen(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3.5" }), "Tag"]
				})
			]
		}), folderOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "absolute left-0 z-10 mt-2 w-56 rounded-lg bg-surface p-2 shadow-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "flex h-10 w-full items-center rounded-md px-2 text-left text-sm hover:bg-paper-warm",
					onClick: () => {
						setItemFolder(item.id, null);
						setFolderOpen(false);
					},
					children: "Unfiled"
				}),
				folders.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: cn("flex h-10 w-full items-center rounded-md px-2 text-left text-sm hover:bg-paper-warm", row.id === item.folderId && "bg-paper-warm"),
					onClick: () => {
						setItemFolder(item.id, row.id);
						setFolderOpen(false);
					},
					children: row.name
				}, row.id)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 flex gap-1 border-t border-line pt-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: folderDraft,
						onChange: (e) => setFolderDraft(e.target.value),
						onKeyDown: (e) => {
							if (e.key !== "Enter") return;
							e.preventDefault();
							createFolder();
						},
						placeholder: "New folder",
						className: "h-10 min-w-0 flex-1 rounded-md bg-paper px-2 text-sm outline-none placeholder:text-muted"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "h-10 rounded-md px-2 text-sm text-ink",
						onClick: createFolder,
						children: "Add"
					})]
				})
			]
		}) : null]
	});
}
var RATES = [
	{
		value: .75,
		label: "0.75×"
	},
	{
		value: 1,
		label: "1×"
	},
	{
		value: 1.25,
		label: "1.25×"
	},
	{
		value: 1.5,
		label: "1.5×"
	}
];
var ReaderBody = (0, import_react.memo)(function ReaderBody({ html, large, onSelectEnd, onClick, bodyRef }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: bodyRef,
		className: cn("reader-body mt-8", large && "is-large"),
		onMouseUp: onSelectEnd,
		onTouchEnd: onSelectEnd,
		onClick,
		dangerouslySetInnerHTML: { __html: html }
	});
});
function selectionMenu() {
	const sel = window.getSelection();
	const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
	if (!sel || !sel.rangeCount || text.length < 8) return null;
	const range = sel.getRangeAt(0);
	const rect = range.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;
	const rects = [...range.getClientRects()].map((r) => ({
		top: r.top,
		left: r.left,
		width: r.width,
		height: r.height
	}));
	const above = rect.top - 48;
	const y = above < 64 ? rect.bottom + 8 : above;
	return {
		text,
		x: Math.min(window.innerWidth - 148, Math.max(12, rect.left + rect.width / 2 - 70)),
		y,
		rects
	};
}
function ReaderView({ item, article, readerSize, onBack, onArchive, onToggleSize }) {
	const bodyRef = (0, import_react.useRef)(null);
	const ttsRef = (0, import_react.useRef)(null);
	const [progress, setProgress] = (0, import_react.useState)(0);
	const [tts, setTts] = (0, import_react.useState)("idle");
	const [word, setWord] = (0, import_react.useState)("");
	const [menu, setMenu] = (0, import_react.useState)(null);
	const [voices, setVoices] = (0, import_react.useState)([]);
	const [listenOpen, setListenOpen] = (0, import_react.useState)(false);
	const canSpeak = ttsAvailable();
	const hasLeadImage = /<img\b/i.test(article.contentHtml.slice(0, 1200));
	const ttsRate = useLibraryStore((s) => s.ttsRate);
	const ttsVoiceURI = useLibraryStore((s) => s.ttsVoiceURI);
	const setTtsRate = useLibraryStore((s) => s.setTtsRate);
	const setTtsVoiceURI = useLibraryStore((s) => s.setTtsVoiceURI);
	const addHighlight = useLibraryStore((s) => s.addHighlight);
	const removeHighlight = useLibraryStore((s) => s.removeHighlight);
	const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);
	const html = (0, import_react.useMemo)(() => applyHighlights(rewriteHtmlImages(article.contentHtml), item.highlights), [article.contentHtml, item.highlights]);
	(0, import_react.useEffect)(() => {
		const onScroll = () => {
			const el = document.documentElement;
			const max = el.scrollHeight - el.clientHeight;
			setProgress(max <= 0 ? 0 : Math.min(1, el.scrollTop / max));
			setMenu((current) => current ? selectionMenu() : null);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [article.canonicalUrl]);
	(0, import_react.useEffect)(() => {
		const load = () => setVoices(listVoices(ttsVoiceURI));
		load();
		window.speechSynthesis?.addEventListener("voiceschanged", load);
		return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
	}, [ttsVoiceURI]);
	(0, import_react.useEffect)(() => {
		ttsRef.current?.setOptions({
			rate: ttsRate,
			voiceURI: ttsVoiceURI
		});
	}, [ttsRate, ttsVoiceURI]);
	(0, import_react.useEffect)(() => {
		return () => {
			ttsRef.current?.stop();
			ttsRef.current = null;
			clearSpokenWord();
		};
	}, [article.canonicalUrl]);
	function stopTts() {
		ttsRef.current?.stop();
		ttsRef.current = null;
		setTts("idle");
		setWord("");
		setListenOpen(false);
		clearSpokenWord();
	}
	function onSpokenWord(next) {
		setWord(next.word);
		paintSpokenWord(bodyRef.current, next.start, next.end);
	}
	function toggleListen() {
		if (!canSpeak) {
			toast.error("This browser cannot read aloud.");
			return;
		}
		if (tts === "playing") {
			ttsRef.current?.pause();
			return;
		}
		if (tts === "paused") {
			ttsRef.current?.resume();
			return;
		}
		try {
			const plain = collectSpokenText(bodyRef.current);
			if (!plain.trim()) {
				toast.error("Nothing to read in this article.");
				return;
			}
			setListenOpen(true);
			setWord("Listening");
			ttsRef.current = speakArticle(plain, {
				rate: ttsRate,
				voiceURI: ttsVoiceURI,
				onStatus: (status) => {
					setTts(status);
					if (status === "idle") setListenOpen(false);
				},
				onWord: onSpokenWord
			});
		} catch {
			toast.error("Could not start reading aloud.");
		}
	}
	const onSelectEnd = (0, import_react.useCallback)(() => {
		const sel = window.getSelection();
		const next = selectionMenu();
		if (!next || !bodyRef.current?.contains(sel?.anchorNode ?? null)) {
			setMenu(null);
			return;
		}
		setMenu(next);
	}, []);
	const onBodyClick = (0, import_react.useCallback)((event) => {
		if ((window.getSelection()?.toString().trim() || "").length >= 8) return;
		const mark = event.target.closest("mark");
		if (mark?.getAttribute("data-hid")) {
			removeHighlight(item.id, mark.getAttribute("data-hid") || "");
			return;
		}
		const link = event.target.closest("a");
		if (!link) return;
		event.preventDefault();
		const href = link.getAttribute("href");
		if (href && /^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
	}, [item.id, removeHighlight]);
	function saveHighlight() {
		if (!menu) return;
		addHighlight(item.id, menu.text);
		window.getSelection()?.removeAllRanges();
		setMenu(null);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"aria-hidden": true,
				className: "fixed inset-x-0 top-0 z-30 h-0.5 bg-line",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "h-full bg-ink transition-[width] duration-150",
					style: { width: `${Math.round(progress * 100)}%` }
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "ghost",
						className: "gap-2 px-3",
						onClick: () => {
							stopTts();
							onBack();
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "hidden sm:inline",
							children: "Library"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "ml-auto flex items-center gap-1",
						children: [
							canSpeak ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "ghost",
								className: "gap-2 px-3",
								onClick: toggleListen,
								"aria-label": tts === "playing" ? "Pause reading" : "Listen",
								children: [tts === "playing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: tts === "playing" ? "Pause" : tts === "paused" ? "Resume" : "Listen"
								})]
							}), tts !== "idle" || listenOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "ghost",
								size: "icon",
								"aria-label": "Stop reading",
								onClick: stopTts,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-3.5" })
							}) : null] }) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "ghost",
								size: "icon",
								"aria-label": readerSize === "lg" ? "Smaller type" : "Larger type",
								onClick: onToggleSize,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Type, { className: "size-4" })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "ghost",
								className: "gap-2 px-3",
								onClick: onArchive,
								children: [item.archived ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inbox, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Archive, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: item.archived ? "Inbox" : "Archive"
								})]
							})
						]
					})]
				}), tts !== "idle" || listenOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 pb-3 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "min-w-0 flex-1 font-display text-2xl leading-tight tracking-tight text-ink",
							children: word || (tts === "paused" ? "Paused" : "Listening")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "sr-only",
							htmlFor: "tts-voice",
							children: "Voice"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							id: "tts-voice",
							className: "h-11 max-w-40 rounded-md bg-surface px-2 text-sm text-ink shadow-border",
							value: ttsVoiceURI,
							onChange: (e) => setTtsVoiceURI(e.target.value),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "Default voice"
							}), voices.map((voice) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: voice.voiceURI,
								children: voiceLabel(voice)
							}, voice.voiceURI))]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "sr-only",
							htmlFor: "tts-rate",
							children: "Speed"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							id: "tts-rate",
							className: "h-11 rounded-md bg-surface px-2 text-sm text-ink shadow-border",
							value: String(ttsRate),
							onChange: (e) => setTtsRate(Number(e.target.value)),
							children: RATES.map((rate) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: rate.value,
								children: rate.label
							}, rate.value))
						})
					]
				}) : null]
			}),
			menu ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [menu.rects.map((rect, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"aria-hidden": true,
				className: "sel-ghost",
				style: {
					top: rect.top,
					left: rect.left,
					width: rect.width,
					height: rect.height
				}
			}, i)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"data-highlight-menu": true,
				className: "fixed z-40",
				style: {
					left: menu.x,
					top: menu.y
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					size: "sm",
					className: "gap-2 shadow-border",
					onMouseDown: (e) => e.preventDefault(),
					onClick: saveHighlight,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Highlighter, { className: "size-3.5" }), "Highlight"]
				})
			})] }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs font-medium tracking-wide text-muted",
						children: [[article.source === "x" ? "X" : article.siteName, article.author].filter(Boolean).join(" · "), ` · ${article.readingMinutes} min`]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl",
						children: article.title
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrganizeRow, { item }),
					article.heroImage && !hasLeadImage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: previewImageSrc(article.heroImage),
						alt: "",
						className: "mt-8 w-full rounded-lg object-cover shadow-border"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReaderBody, {
						html,
						large: readerSize === "lg",
						onSelectEnd,
						onClick: onBodyClick,
						bodyRef
					}),
					item.highlights.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-14 border-t border-line pt-8",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "Highlights"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-4",
							children: item.highlights.map((highlight) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "rounded-md bg-surface p-3 shadow-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-display text-base leading-normal italic text-ink-soft",
										children: highlight.text
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: highlight.note,
										onChange: (e) => setHighlightNote(item.id, highlight.id, e.target.value),
										placeholder: "Add a note",
										className: "mt-2"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "mt-2 text-xs text-muted underline decoration-faint underline-offset-2",
										onClick: () => removeHighlight(item.id, highlight.id),
										children: "Remove"
									})
								]
							}, highlight.id))
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-12 text-sm text-muted",
						children: "Select a passage to highlight it."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-10 flex items-center gap-2 text-sm text-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "size-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: article.canonicalUrl || article.url,
							target: "_blank",
							rel: "noreferrer",
							className: "underline decoration-faint underline-offset-2 hover:text-ink",
							children: "View original"
						})]
					})
				]
			})
		]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var urlInput = object({ url: string().trim().min(4, "Paste a URL first.") });
var extractArticle = createServerFn({ method: "POST" }).validator((input) => urlInput.parse(input)).handler(createSsrRpc("5710449ee1ab2b93c2de9f0d8620a25580df924d9665549669b1829113764dd3"));
var DRAFT_KEY = "quarto-draft-url";
function normalizeSourceUrl(raw) {
	let value = raw.trim().replace(/[<>"]/g, "");
	if (!value) return "";
	value = value.split(/\s+/)[0] ?? "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.startsWith("//")) return `https:${value}`;
	if (/^(www\.|x\.com\/|twitter\.com\/|en\.wikipedia\.org\/)/i.test(value) || /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(value)) return `https://${value}`;
	return value;
}
function readDraftUrl() {
	try {
		return sessionStorage.getItem(DRAFT_KEY) || "";
	} catch {
		return "";
	}
}
function writeDraftUrl(url) {
	try {
		if (url) sessionStorage.setItem(DRAFT_KEY, url);
		else sessionStorage.removeItem(DRAFT_KEY);
	} catch {}
}
var SAMPLES = [
	{
		label: "Wikipedia",
		url: "https://en.wikipedia.org/wiki/Read-it-later"
	},
	{
		label: "Essay",
		url: "http://www.paulgraham.com/ds.html"
	},
	{
		label: "X article",
		url: "https://x.com/VibeMarketer_/article/2093330541177352217"
	}
];
function Home() {
	const [url, setUrl] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [tab, setTab] = (0, import_react.useState)("inbox");
	const [folderFilter, setFolderFilter] = (0, import_react.useState)("all");
	const [tagFilter, setTagFilter] = (0, import_react.useState)(null);
	const booted = (0, import_react.useRef)(false);
	const inFlight = (0, import_react.useRef)(null);
	const library = useLibraryStore((s) => s.library);
	const openId = useLibraryStore((s) => s.openId);
	const readerSize = useLibraryStore((s) => s.readerSize);
	const upsertItem = useLibraryStore((s) => s.upsertItem);
	const archiveItem = useLibraryStore((s) => s.archiveItem);
	const removeItem = useLibraryStore((s) => s.removeItem);
	const setOpenId = useLibraryStore((s) => s.setOpenId);
	const setReaderSize = useLibraryStore((s) => s.setReaderSize);
	const openItem = (0, import_react.useMemo)(() => library.find((row) => row.id === openId) ?? null, [library, openId]);
	const article = openItem && openItem.contentHtml ? itemToArticle(openItem) : null;
	const inbox = (0, import_react.useMemo)(() => library.filter((row) => !row.archived), [library]);
	const archived = (0, import_react.useMemo)(() => library.filter((row) => row.archived), [library]);
	const visible = (0, import_react.useMemo)(() => {
		return (tab === "archive" ? archived : inbox).filter((row) => {
			if (folderFilter === "none" && row.folderId) return false;
			if (folderFilter !== "all" && folderFilter !== "none" && row.folderId !== folderFilter) return false;
			if (tagFilter && !(row.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
			return true;
		});
	}, [
		tab,
		archived,
		inbox,
		folderFilter,
		tagFilter
	]);
	async function save(nextUrl = url, thenOpen = true) {
		const trimmed = normalizeSourceUrl(nextUrl);
		if (!trimmed) {
			setError("Paste a blog or X URL first.");
			return;
		}
		if (inFlight.current === trimmed && busy) return;
		setUrl(trimmed);
		writeDraftUrl(trimmed);
		inFlight.current = trimmed;
		setBusy(true);
		setError("");
		try {
			const result = await extractArticle({ data: { url: trimmed } });
			if (inFlight.current !== trimmed) return;
			if (!result.ok) {
				setError(result.error);
				return;
			}
			upsertItem(articleToItem(result.article));
			writeDraftUrl("");
			setUrl("");
			if (!thenOpen) setOpenId(null);
			else toast.success("Saved to your list");
		} catch {
			if (inFlight.current !== trimmed) return;
			setError("Something went wrong while reading that page. Try again.");
		} finally {
			if (inFlight.current === trimmed) {
				inFlight.current = null;
				setBusy(false);
			}
		}
	}
	async function openItemOrFetch(item) {
		if (item.contentHtml) {
			setOpenId(item.id);
			return;
		}
		setOpenId(item.id);
		await save(item.url, true);
	}
	(0, import_react.useEffect)(() => {
		if (booted.current) return;
		booted.current = true;
		const draft = readDraftUrl();
		if (draft && !openId) {
			setUrl(draft);
			save(draft, true);
		}
	}, []);
	if (article && openItem) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReaderView, {
		item: openItem,
		article,
		readerSize,
		onBack: () => setOpenId(null),
		onArchive: () => {
			archiveItem(openItem.id, !openItem.archived);
			if (!openItem.archived) {
				setOpenId(null);
				toast.success("Archived");
			} else toast.success("Moved to inbox");
		},
		onToggleSize: () => setReaderSize(readerSize === "lg" ? "md" : "lg")
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative min-h-dvh overflow-x-hidden",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"aria-hidden": true,
				className: "pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper-warm)_70%,transparent),transparent)]"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex size-8 items-center justify-center rounded-md bg-ink text-paper",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookMarked, { className: "size-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-semibold tracking-tight",
						children: "Quarto"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "hidden text-xs text-muted sm:block",
						children: "Save & read later"
					})] })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "stagger-in pt-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted",
								children: "Save blogs and X articles. Read them later."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "mt-3 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl",
								children: "Your quiet reading list."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 max-w-lg text-base leading-normal text-ink-soft",
								children: "Paste a link, strip the clutter, and keep a clean copy on this device — with tags, folders, highlights, and listen mode."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-8",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
										htmlFor: "source-url",
										className: "sr-only",
										children: "Article URL"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex flex-col gap-2 sm:flex-row sm:items-stretch",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											id: "source-url",
											type: "text",
											inputMode: "url",
											autoCapitalize: "off",
											autoCorrect: "off",
											autoComplete: "off",
											spellCheck: false,
											placeholder: "Paste a blog or X URL",
											value: url,
											onChange: (e) => {
												setUrl(e.target.value);
												setError("");
											},
											onPaste: (e) => {
												const pasted = e.clipboardData.getData("text");
												if (!pasted) return;
												e.preventDefault();
												const next = normalizeSourceUrl(pasted);
												setUrl(next);
												writeDraftUrl(next);
												setError("");
												save(next, true);
											},
											onKeyDown: (e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												save();
											},
											className: "sm:flex-1"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											type: "button",
											className: "sm:w-32",
											disabled: busy,
											onClick: () => void save(),
											children: busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["Save", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" })] })
										})]
									}),
									error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-sm text-danger",
										role: "alert",
										children: error
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-sm text-muted",
										children: "Public pages only. Your list stays on this device."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-muted",
									children: "Try"
								}), SAMPLES.map((sample) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "h-11 rounded-full bg-paper-warm px-3 text-sm text-ink-soft transition-colors duration-150 hover:bg-line hover:text-ink",
									onClick: () => void save(sample.url, true),
									children: sample.label
								}, sample.url))]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-10 flex items-center gap-1 border-b border-line",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cn("flex h-11 items-center gap-2 px-3 text-sm", tab === "inbox" ? "border-b-2 border-ink text-ink" : "text-muted"),
							onClick: () => setTab("inbox"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inbox, { className: "size-4" }),
								"Inbox",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-muted",
									children: inbox.length
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cn("flex h-11 items-center gap-2 px-3 text-sm", tab === "archive" ? "border-b-2 border-ink text-ink" : "text-muted"),
							onClick: () => setTab("archive"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Archive, { className: "size-4" }),
								"Archive",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-muted",
									children: archived.length
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LibraryFilters, {
						folderFilter,
						tagFilter,
						onFolder: setFolderFilter,
						onTag: setTagFilter
					}),
					busy && !openId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-6 text-sm text-muted",
						children: "Saving a clean copy…"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArticleList, {
						items: visible,
						emptyTitle: tab === "archive" ? "Nothing archived" : "Your inbox is empty",
						emptyCopy: tab === "archive" ? "Archive a piece after you finish it. It will wait here." : "Paste a URL above to save a blog or X article for later.",
						onOpen: (item) => void openItemOrFetch(item),
						onRemove: removeItem
					})
				]
			})
		]
	});
}
//#endregion
export { Home as component };
