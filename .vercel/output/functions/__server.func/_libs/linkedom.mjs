import { a as __toCommonJS, n as __esmMin, o as __toESM, r as __exportAll, t as __commonJSMin } from "../_runtime.mjs";
import { t as esm_exports } from "./htmlparser2.mjs";
import { n as is, t as compile } from "./css-select+[...].mjs";
import { t as require_lib } from "./cssom.mjs";
//#region node_modules/linkedom/esm/shared/symbols.js
var CHANGED = Symbol("changed");
var CLASS_LIST = Symbol("classList");
var CUSTOM_ELEMENTS = Symbol("CustomElements");
var CONTENT = Symbol("content");
var DATASET = Symbol("dataset");
var DOCTYPE = Symbol("doctype");
var DOM_PARSER = Symbol("DOMParser");
var END = Symbol("end");
var EVENT_TARGET = Symbol("EventTarget");
var GLOBALS = Symbol("globals");
var IMAGE = Symbol("image");
var MIME = Symbol("mime");
var MUTATION_OBSERVER = Symbol("MutationObserver");
var NEXT = Symbol("next");
var OWNER_ELEMENT = Symbol("ownerElement");
var PREV = Symbol("prev");
var PRIVATE = Symbol("private");
var SHEET = Symbol("sheet");
var START = Symbol("start");
var STYLE = Symbol("style");
var UPGRADE = Symbol("upgrade");
var VALUE = Symbol("value");
//#endregion
//#region node_modules/linkedom/esm/shared/constants.js
var BLOCK_ELEMENTS = /* @__PURE__ */ new Set([
	"ARTICLE",
	"ASIDE",
	"BLOCKQUOTE",
	"BODY",
	"BR",
	"BUTTON",
	"CANVAS",
	"CAPTION",
	"COL",
	"COLGROUP",
	"DD",
	"DIV",
	"DL",
	"DT",
	"EMBED",
	"FIELDSET",
	"FIGCAPTION",
	"FIGURE",
	"FOOTER",
	"FORM",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"LI",
	"UL",
	"OL",
	"P"
]);
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
//#endregion
//#region node_modules/linkedom/esm/shared/object.js
var { assign, create: create$1, defineProperties, entries, getOwnPropertyDescriptors, keys, setPrototypeOf } = Object;
//#endregion
//#region node_modules/linkedom/esm/shared/utils.js
var $String = String;
var getEnd = (node) => node.nodeType === 1 ? node[END] : node;
var ignoreCase = ({ ownerDocument }) => ownerDocument[MIME].ignoreCase;
var knownAdjacent = (prev, next) => {
	prev[NEXT] = next;
	next[PREV] = prev;
};
var knownBoundaries = (prev, current, next) => {
	knownAdjacent(prev, current);
	knownAdjacent(getEnd(current), next);
};
var knownSegment = (prev, start, end, next) => {
	knownAdjacent(prev, start);
	knownAdjacent(getEnd(end), next);
};
var knownSiblings = (prev, current, next) => {
	knownAdjacent(prev, current);
	knownAdjacent(current, next);
};
var localCase = ({ localName, ownerDocument }) => {
	return ownerDocument[MIME].ignoreCase ? localName.toUpperCase() : localName;
};
var setAdjacent = (prev, next) => {
	if (prev) prev[NEXT] = next;
	if (next) next[PREV] = prev;
};
/**
* @param {import("../interface/document.js").Document} ownerDocument
* @param {string} html
* @return {import("../interface/document-fragment.js").DocumentFragment}
*/
var htmlToFragment = (ownerDocument, html) => {
	const fragment = ownerDocument.createDocumentFragment();
	const elem = ownerDocument.createElement("");
	elem.innerHTML = html;
	const { firstChild, lastChild } = elem;
	if (firstChild) {
		knownSegment(fragment, firstChild, lastChild, fragment[END]);
		let child = firstChild;
		do
			child.parentNode = fragment;
		while (child !== lastChild && (child = getEnd(child)[NEXT]));
	}
	return fragment;
};
//#endregion
//#region node_modules/linkedom/esm/shared/shadow-roots.js
var shadowRoots = /* @__PURE__ */ new WeakMap();
//#endregion
//#region node_modules/linkedom/esm/interface/custom-element-registry.js
var reactive = false;
var Classes = /* @__PURE__ */ new WeakMap();
var customElements = /* @__PURE__ */ new WeakMap();
var attributeChangedCallback$1 = (element, attributeName, oldValue, newValue) => {
	if (reactive && customElements.has(element) && element.attributeChangedCallback && element.constructor.observedAttributes.includes(attributeName)) element.attributeChangedCallback(attributeName, oldValue, newValue);
};
var createTrigger = (method, isConnected) => (element) => {
	if (customElements.has(element)) {
		const info = customElements.get(element);
		if (info.connected !== isConnected && element.isConnected === isConnected) {
			info.connected = isConnected;
			if (method in element) element[method]();
		}
	}
};
var triggerConnected = createTrigger("connectedCallback", true);
var connectedCallback = (element) => {
	if (reactive) {
		triggerConnected(element);
		if (shadowRoots.has(element)) element = shadowRoots.get(element).shadowRoot;
		let { [NEXT]: next, [END]: end } = element;
		while (next !== end) {
			if (next.nodeType === 1) triggerConnected(next);
			next = next[NEXT];
		}
	}
};
var triggerDisconnected = createTrigger("disconnectedCallback", false);
var disconnectedCallback = (element) => {
	if (reactive) {
		triggerDisconnected(element);
		if (shadowRoots.has(element)) element = shadowRoots.get(element).shadowRoot;
		let { [NEXT]: next, [END]: end } = element;
		while (next !== end) {
			if (next.nodeType === 1) triggerDisconnected(next);
			next = next[NEXT];
		}
	}
};
/**
* @implements globalThis.CustomElementRegistry
*/
var CustomElementRegistry = class {
	/**
	* @param {Document} ownerDocument
	*/
	constructor(ownerDocument) {
		/**
		* @private
		*/
		this.ownerDocument = ownerDocument;
		/**
		* @private
		*/
		this.registry = /* @__PURE__ */ new Map();
		/**
		* @private
		*/
		this.waiting = /* @__PURE__ */ new Map();
		/**
		* @private
		*/
		this.active = false;
	}
	/**
	* @param {string} localName the custom element definition name
	* @param {Function} Class the custom element **Class** definition
	* @param {object?} options the optional object with an `extends` property
	*/
	define(localName, Class, options = {}) {
		const { ownerDocument, registry, waiting } = this;
		if (registry.has(localName)) throw new Error("unable to redefine " + localName);
		if (Classes.has(Class)) throw new Error("unable to redefine the same class: " + Class);
		this.active = reactive = true;
		const { extends: extend } = options;
		Classes.set(Class, {
			ownerDocument,
			options: { is: extend ? localName : "" },
			localName: extend || localName
		});
		const check = extend ? (element) => {
			return element.localName === extend && element.getAttribute("is") === localName;
		} : (element) => element.localName === localName;
		registry.set(localName, {
			Class,
			check
		});
		if (waiting.has(localName)) {
			for (const resolve of waiting.get(localName)) resolve(Class);
			waiting.delete(localName);
		}
		ownerDocument.querySelectorAll(extend ? `${extend}[is="${localName}"]` : localName).forEach(this.upgrade, this);
	}
	/**
	* @param {Element} element
	*/
	upgrade(element) {
		if (customElements.has(element)) return;
		const { ownerDocument, registry } = this;
		const ce = element.getAttribute("is") || element.localName;
		if (registry.has(ce)) {
			const { Class, check } = registry.get(ce);
			if (check(element)) {
				const { attributes, isConnected } = element;
				for (const attr of attributes) element.removeAttributeNode(attr);
				const values = entries(element);
				for (const [key] of values) delete element[key];
				setPrototypeOf(element, Class.prototype);
				ownerDocument[UPGRADE] = {
					element,
					values
				};
				new Class(ownerDocument, ce);
				customElements.set(element, { connected: isConnected });
				for (const attr of attributes) element.setAttributeNode(attr);
				if (isConnected && element.connectedCallback) element.connectedCallback();
			}
		}
	}
	/**
	* @param {string} localName the custom element definition name
	*/
	whenDefined(localName) {
		const { registry, waiting } = this;
		return new Promise((resolve) => {
			if (registry.has(localName)) resolve(registry.get(localName).Class);
			else {
				if (!waiting.has(localName)) waiting.set(localName, []);
				waiting.get(localName).push(resolve);
			}
		});
	}
	/**
	* @param {string} localName the custom element definition name
	* @returns {Function?} the custom element **Class**, if any
	*/
	get(localName) {
		const info = this.registry.get(localName);
		return info && info.Class;
	}
	/**
	* @param {Function} Class **Class** of custom element
	* @returns {string?} found tag name or null
	*/
	getName(Class) {
		if (Classes.has(Class)) {
			const { localName } = Classes.get(Class);
			return localName;
		}
		return null;
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/parse-from-string.js
var { Parser } = esm_exports;
var append = (self, node, active) => {
	const end = self[END];
	node.parentNode = self;
	knownBoundaries(end[PREV], node, end);
	if (active && node.nodeType === 1) connectedCallback(node);
	return node;
};
var attribute = (element, end, attribute, value, active) => {
	attribute[VALUE] = value;
	attribute.ownerElement = element;
	knownSiblings(end[PREV], attribute, end);
	if (attribute.name === "class") element.className = value;
	if (active) attributeChangedCallback$1(element, attribute.name, null, value);
};
var parseFromString = (document, isHTML, markupLanguage) => {
	const { active, registry } = document[CUSTOM_ELEMENTS];
	let node = document;
	let ownerSVGElement = null;
	let parsingCData = false;
	const content = new Parser({
		onprocessinginstruction(name, data) {
			if (name.toLowerCase() === "!doctype") document.doctype = data.slice(name.length).trim();
		},
		onopentag(name, attributes) {
			let create = true;
			if (isHTML) {
				if (ownerSVGElement) {
					node = append(node, document.createElementNS(SVG_NAMESPACE, name), active);
					node.ownerSVGElement = ownerSVGElement;
					create = false;
				} else if (name === "svg" || name === "SVG") {
					ownerSVGElement = document.createElementNS(SVG_NAMESPACE, name);
					node = append(node, ownerSVGElement, active);
					create = false;
				} else if (active) {
					const ce = name.includes("-") ? name : attributes.is || "";
					if (ce && registry.has(ce)) {
						const { Class } = registry.get(ce);
						node = append(node, new Class(), active);
						delete attributes.is;
						create = false;
					}
				}
			}
			if (create) node = append(node, document.createElement(name), false);
			let end = node[END];
			for (const name of keys(attributes)) attribute(node, end, document.createAttribute(name), attributes[name], active);
		},
		oncomment(data) {
			append(node, document.createComment(data), active);
		},
		ontext(text) {
			if (parsingCData) append(node, document.createCDATASection(text), active);
			else append(node, document.createTextNode(text), active);
		},
		oncdatastart() {
			parsingCData = true;
		},
		oncdataend() {
			parsingCData = false;
		},
		onclosetag() {
			if (isHTML && node === ownerSVGElement) ownerSVGElement = null;
			node = node.parentNode;
		}
	}, {
		lowerCaseAttributeNames: false,
		decodeEntities: true,
		xmlMode: !isHTML
	});
	content.write(markupLanguage);
	content.end();
	return document;
};
//#endregion
//#region node_modules/linkedom/esm/shared/register-html-class.js
var htmlClasses = /* @__PURE__ */ new Map();
var registerHTMLClass = (names, Class) => {
	for (const name of [].concat(names)) {
		htmlClasses.set(name, Class);
		htmlClasses.set(name.toUpperCase(), Class);
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/jsdon.js
var loopSegment = ({ [NEXT]: next, [END]: end }, json) => {
	while (next !== end) {
		switch (next.nodeType) {
			case 2:
				attrAsJSON(next, json);
				break;
			case 3:
			case 8:
			case 4:
				characterDataAsJSON(next, json);
				break;
			case 1:
				elementAsJSON(next, json);
				next = getEnd(next);
				break;
			case 10: documentTypeAsJSON(next, json);
		}
		next = next[NEXT];
	}
	const last = json.length - 1;
	const value = json[last];
	if (typeof value === "number" && value < 0) json[last] += -1;
	else json.push(-1);
};
var attrAsJSON = (attr, json) => {
	json.push(2, attr.name);
	const value = attr[VALUE].trim();
	if (value) json.push(value);
};
var characterDataAsJSON = (node, json) => {
	const value = node[VALUE];
	if (value.trim()) json.push(node.nodeType, value);
};
var nonElementAsJSON = (node, json) => {
	json.push(node.nodeType);
	loopSegment(node, json);
};
var documentTypeAsJSON = ({ name, publicId, systemId }, json) => {
	json.push(10, name);
	if (publicId) json.push(publicId);
	if (systemId) json.push(systemId);
};
var elementAsJSON = (element, json) => {
	json.push(1, element.localName);
	loopSegment(element, json);
};
//#endregion
//#region node_modules/linkedom/esm/interface/mutation-observer.js
var createRecord = (type, target, element, addedNodes, removedNodes, attributeName, oldValue) => ({
	type,
	target,
	addedNodes,
	removedNodes,
	attributeName,
	oldValue,
	previousSibling: element?.previousSibling || null,
	nextSibling: element?.nextSibling || null
});
var queueAttribute = (observer, target, attributeName, attributeFilter, attributeOldValue, oldValue) => {
	if (!attributeFilter || attributeFilter.includes(attributeName)) {
		const { callback, records, scheduled } = observer;
		records.push(createRecord("attributes", target, null, [], [], attributeName, attributeOldValue ? oldValue : void 0));
		if (!scheduled) {
			observer.scheduled = true;
			Promise.resolve().then(() => {
				observer.scheduled = false;
				callback(records.splice(0), observer);
			});
		}
	}
};
var attributeChangedCallback = (element, attributeName, oldValue) => {
	const { ownerDocument } = element;
	const { active, observers } = ownerDocument[MUTATION_OBSERVER];
	if (active) {
		for (const observer of observers) for (const [target, { childList, subtree, attributes, attributeFilter, attributeOldValue }] of observer.nodes) if (childList) {
			if (subtree && (target === ownerDocument || target.contains(element)) || !subtree && target.children.includes(element)) {
				queueAttribute(observer, element, attributeName, attributeFilter, attributeOldValue, oldValue);
				break;
			}
		} else if (attributes && target === element) {
			queueAttribute(observer, element, attributeName, attributeFilter, attributeOldValue, oldValue);
			break;
		}
	}
};
var moCallback = (element, parentNode) => {
	const { ownerDocument } = element;
	const { active, observers } = ownerDocument[MUTATION_OBSERVER];
	if (active) {
		for (const observer of observers) for (const [target, { subtree, childList, characterData }] of observer.nodes) if (childList) {
			if (parentNode && (target === parentNode || subtree && target.contains(parentNode)) || !parentNode && (subtree && (target === ownerDocument || /* c8 ignore next */ target.contains(element)) || !subtree && target[characterData ? "childNodes" : "children"].includes(element))) {
				const { callback, records, scheduled } = observer;
				records.push(createRecord("childList", target, element, parentNode ? [] : [element], parentNode ? [element] : []));
				if (!scheduled) {
					observer.scheduled = true;
					Promise.resolve().then(() => {
						observer.scheduled = false;
						callback(records.splice(0), observer);
					});
				}
				break;
			}
		}
	}
};
var MutationObserverClass = class {
	constructor(ownerDocument) {
		const observers = /* @__PURE__ */ new Set();
		this.observers = observers;
		this.active = false;
		/**
		* @implements globalThis.MutationObserver
		*/
		this.class = class MutationObserver {
			constructor(callback) {
				/**
				* @private
				*/
				this.callback = callback;
				/**
				* @private
				*/
				this.nodes = /* @__PURE__ */ new Map();
				/**
				* @private
				*/
				this.records = [];
				/**
				* @private
				*/
				this.scheduled = false;
			}
			disconnect() {
				this.records.splice(0);
				this.nodes.clear();
				observers.delete(this);
				ownerDocument[MUTATION_OBSERVER].active = !!observers.size;
			}
			/**
			* @param {Element} target
			* @param {MutationObserverInit} options
			*/
			observe(target, options = {
				subtree: false,
				childList: false,
				attributes: false,
				attributeFilter: null,
				attributeOldValue: false,
				characterData: false
			}) {
				if ("attributeOldValue" in options || "attributeFilter" in options) options.attributes = true;
				options.childList = !!options.childList;
				options.subtree = !!options.subtree;
				this.nodes.set(target, options);
				observers.add(this);
				ownerDocument[MUTATION_OBSERVER].active = true;
			}
			/**
			* @returns {MutationRecord[]}
			*/
			takeRecords() {
				return this.records.splice(0);
			}
		};
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/attributes.js
var emptyAttributes = /* @__PURE__ */ new Set([
	"allowfullscreen",
	"allowpaymentrequest",
	"async",
	"autofocus",
	"autoplay",
	"checked",
	"class",
	"contenteditable",
	"controls",
	"default",
	"defer",
	"disabled",
	"draggable",
	"formnovalidate",
	"hidden",
	"id",
	"ismap",
	"itemscope",
	"loop",
	"multiple",
	"muted",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"selected",
	"style",
	"truespeed"
]);
var setAttribute = (element, attribute) => {
	const { [VALUE]: value, name } = attribute;
	attribute.ownerElement = element;
	knownSiblings(element, attribute, element[NEXT]);
	if (name === "class") element.className = value;
	attributeChangedCallback(element, name, null);
	attributeChangedCallback$1(element, name, null, value);
};
var removeAttribute = (element, attribute) => {
	const { [VALUE]: value, name } = attribute;
	knownAdjacent(attribute[PREV], attribute[NEXT]);
	attribute.ownerElement = attribute[PREV] = attribute[NEXT] = null;
	if (name === "class") element[CLASS_LIST] = null;
	attributeChangedCallback(element, name, value);
	attributeChangedCallback$1(element, name, value, null);
};
var booleanAttribute = {
	get(element, name) {
		return element.hasAttribute(name);
	},
	set(element, name, value) {
		if (value) element.setAttribute(name, "");
		else element.removeAttribute(name);
	}
};
var numericAttribute = {
	get(element, name) {
		return parseFloat(element.getAttribute(name) || 0);
	},
	set(element, name, value) {
		element.setAttribute(name, value);
	}
};
var stringAttribute = {
	get(element, name) {
		return element.getAttribute(name) || "";
	},
	set(element, name, value) {
		element.setAttribute(name, value);
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/event-target.js
var wm = /* @__PURE__ */ new WeakMap();
function dispatch(event, listener) {
	if (typeof listener === "function") listener.call(event.target, event);
	else listener.handleEvent(event);
	return event._stopImmediatePropagationFlag;
}
function invokeListeners({ currentTarget, target }) {
	const map = wm.get(currentTarget);
	if (map && map.has(this.type)) {
		const listeners = map.get(this.type);
		if (currentTarget === target) this.eventPhase = this.AT_TARGET;
		else this.eventPhase = this.BUBBLING_PHASE;
		this.currentTarget = currentTarget;
		this.target = target;
		for (const [listener, options] of listeners) {
			if (options && options.once) listeners.delete(listener);
			if (dispatch(this, listener)) break;
		}
		delete this.currentTarget;
		delete this.target;
		return this.cancelBubble;
	}
}
/**
* @implements globalThis.EventTarget
*/
var DOMEventTarget = class {
	constructor() {
		wm.set(this, /* @__PURE__ */ new Map());
	}
	/**
	* @protected
	*/
	_getParent() {
		return null;
	}
	addEventListener(type, listener, options) {
		const map = wm.get(this);
		if (!map.has(type)) map.set(type, /* @__PURE__ */ new Map());
		map.get(type).set(listener, options);
	}
	removeEventListener(type, listener) {
		const map = wm.get(this);
		if (map.has(type)) {
			const listeners = map.get(type);
			if (listeners.delete(listener) && !listeners.size) map.delete(type);
		}
	}
	dispatchEvent(event) {
		let node = this;
		event.eventPhase = event.CAPTURING_PHASE;
		while (node) {
			if (node.dispatchEvent) event._path.push({
				currentTarget: node,
				target: this
			});
			node = event.bubbles && node._getParent && node._getParent();
		}
		event._path.some(invokeListeners, event);
		event._path = [];
		event.eventPhase = event.NONE;
		return !event.defaultPrevented;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/node-list.js
/**
* @implements globalThis.NodeList
*/
var NodeList = class extends Array {
	item(i) {
		return i < this.length ? this[i] : null;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/node.js
var getParentNodeCount = ({ parentNode }) => {
	let count = 0;
	while (parentNode) {
		count++;
		parentNode = parentNode.parentNode;
	}
	return count;
};
/**
* @implements globalThis.Node
*/
var Node$1 = class extends DOMEventTarget {
	static get ELEMENT_NODE() {
		return 1;
	}
	static get ATTRIBUTE_NODE() {
		return 2;
	}
	static get TEXT_NODE() {
		return 3;
	}
	static get CDATA_SECTION_NODE() {
		return 4;
	}
	static get COMMENT_NODE() {
		return 8;
	}
	static get DOCUMENT_NODE() {
		return 9;
	}
	static get DOCUMENT_FRAGMENT_NODE() {
		return 11;
	}
	static get DOCUMENT_TYPE_NODE() {
		return 10;
	}
	constructor(ownerDocument, localName, nodeType) {
		super();
		this.ownerDocument = ownerDocument;
		this.localName = localName;
		this.nodeType = nodeType;
		this.parentNode = null;
		this[NEXT] = null;
		this[PREV] = null;
	}
	get ELEMENT_NODE() {
		return 1;
	}
	get ATTRIBUTE_NODE() {
		return 2;
	}
	get TEXT_NODE() {
		return 3;
	}
	get CDATA_SECTION_NODE() {
		return 4;
	}
	get COMMENT_NODE() {
		return 8;
	}
	get DOCUMENT_NODE() {
		return 9;
	}
	get DOCUMENT_FRAGMENT_NODE() {
		return 11;
	}
	get DOCUMENT_TYPE_NODE() {
		return 10;
	}
	get baseURI() {
		const ownerDocument = this.nodeType === 9 ? this : this.ownerDocument;
		if (ownerDocument) {
			const base = ownerDocument.querySelector("base");
			if (base) return base.getAttribute("href");
			const { location } = ownerDocument.defaultView;
			if (location) return location.href;
		}
		return null;
	}
	/* c8 ignore start */
	get isConnected() {
		return false;
	}
	get nodeName() {
		return this.localName;
	}
	get parentElement() {
		return null;
	}
	get previousSibling() {
		return null;
	}
	get previousElementSibling() {
		return null;
	}
	get nextSibling() {
		return null;
	}
	get nextElementSibling() {
		return null;
	}
	get childNodes() {
		return new NodeList();
	}
	get firstChild() {
		return null;
	}
	get lastChild() {
		return null;
	}
	get nodeValue() {
		return null;
	}
	set nodeValue(value) {}
	get textContent() {
		return null;
	}
	set textContent(value) {}
	normalize() {}
	cloneNode() {
		return null;
	}
	contains() {
		return false;
	}
	/**
	* Inserts a node before a reference node as a child of this parent node.
	* @param {Node} newNode The node to be inserted.
	* @param {Node} referenceNode The node before which newNode is inserted. If this is null, then newNode is inserted at the end of node's child nodes.
	* @returns The added child
	*/
	insertBefore(newNode, referenceNode) {
		return newNode;
	}
	/**
	* Adds a node to the end of the list of children of this node.
	* @param {Node} child The node to append to the given parent node.
	* @returns The appended child.
	*/
	appendChild(child) {
		return child;
	}
	/**
	* Replaces a child node within this node
	* @param {Node} newChild The new node to replace oldChild.
	* @param {Node} oldChild The child to be replaced.
	* @returns The replaced Node. This is the same node as oldChild.
	*/
	replaceChild(newChild, oldChild) {
		return oldChild;
	}
	/**
	* Removes a child node from the DOM.
	* @param {Node} child A Node that is the child node to be removed from the DOM.
	* @returns The removed node.
	*/
	removeChild(child) {
		return child;
	}
	toString() {
		return "";
	}
	/* c8 ignore stop */
	hasChildNodes() {
		return !!this.lastChild;
	}
	isSameNode(node) {
		return this === node;
	}
	compareDocumentPosition(target) {
		let result = 0;
		if (this !== target) {
			let self = getParentNodeCount(this);
			let other = getParentNodeCount(target);
			if (self < other) {
				result += 4;
				if (this.contains(target)) result += 16;
			} else if (other < self) {
				result += 2;
				if (target.contains(this)) result += 8;
			} else if (self && other) {
				const { childNodes } = this.parentNode;
				if (childNodes.indexOf(this) < childNodes.indexOf(target)) result += 4;
				else result += 2;
			}
			if (!self || !other) {
				result += 32;
				result += 1;
			}
		}
		return result;
	}
	isEqualNode(node) {
		if (this === node) return true;
		if (this.nodeType === node.nodeType) {
			switch (this.nodeType) {
				case 9:
				case 11: {
					const aNodes = this.childNodes;
					const bNodes = node.childNodes;
					return aNodes.length === bNodes.length && aNodes.every((node, i) => node.isEqualNode(bNodes[i]));
				}
			}
			return this.toString() === node.toString();
		}
		return false;
	}
	/**
	* @protected
	*/
	_getParent() {
		return this.parentNode;
	}
	/**
	* Calling it on an element inside a standard web page will return an HTMLDocument object representing the entire page (or <iframe>).
	* Calling it on an element inside a shadow DOM will return the associated ShadowRoot.
	* @return {ShadowRoot | HTMLDocument}
	*/
	getRootNode() {
		let root = this;
		while (root.parentNode) root = root.parentNode;
		return root;
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/text-escaper.js
var { replace } = "";
var ca = /[<>&\xA0]/g;
var esca = {
	"\xA0": "&#160;",
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;"
};
var pe = (m) => esca[m];
/**
* Safely escape HTML entities such as `&`, `<`, `>` only.
* @param {string} es the input to safely escape
* @returns {string} the escaped input, and it **throws** an error if
*  the input type is unexpected, except for boolean and numbers,
*  converted as string.
*/
var escape = (es) => replace.call(es, ca, pe);
//#endregion
//#region node_modules/linkedom/esm/interface/attr.js
var QUOTE = /"/g;
/**
* @implements globalThis.Attr
*/
var Attr$1 = class Attr$1 extends Node$1 {
	constructor(ownerDocument, name, value = "") {
		super(ownerDocument, name, 2);
		this.ownerElement = null;
		this.name = $String(name);
		this[VALUE] = $String(value);
		this[CHANGED] = false;
	}
	get value() {
		return this[VALUE];
	}
	set value(newValue) {
		const { [VALUE]: oldValue, name, ownerElement } = this;
		this[VALUE] = $String(newValue);
		this[CHANGED] = true;
		if (ownerElement) {
			attributeChangedCallback(ownerElement, name, oldValue);
			attributeChangedCallback$1(ownerElement, name, oldValue, this[VALUE]);
		}
	}
	cloneNode() {
		const { ownerDocument, name, [VALUE]: value } = this;
		return new Attr$1(ownerDocument, name, value);
	}
	toString() {
		const { name, [VALUE]: value } = this;
		if (emptyAttributes.has(name) && !value) return ignoreCase(this) ? name : `${name}=""`;
		return `${name}="${(ignoreCase(this) ? value : escape(value)).replace(QUOTE, "&quot;")}"`;
	}
	toJSON() {
		const json = [];
		attrAsJSON(this, json);
		return json;
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/node.js
var isConnected = ({ ownerDocument, parentNode }) => {
	while (parentNode) {
		if (parentNode === ownerDocument) return true;
		parentNode = parentNode.parentNode || parentNode.host;
	}
	return false;
};
var parentElement = ({ parentNode }) => {
	if (parentNode) switch (parentNode.nodeType) {
		case 9:
		case 11: return null;
	}
	return parentNode;
};
var previousSibling = ({ [PREV]: prev }) => {
	switch (prev ? prev.nodeType : 0) {
		case -1: return prev[START];
		case 3:
		case 8:
		case 4: return prev;
	}
	return null;
};
var nextSibling = (node) => {
	const next = getEnd(node)[NEXT];
	return next && (next.nodeType === -1 ? null : next);
};
//#endregion
//#region node_modules/linkedom/esm/mixin/non-document-type-child-node.js
var nextElementSibling = (node) => {
	let next = nextSibling(node);
	while (next && next.nodeType !== 1) next = nextSibling(next);
	return next;
};
var previousElementSibling = (node) => {
	let prev = previousSibling(node);
	while (prev && prev.nodeType !== 1) prev = previousSibling(prev);
	return prev;
};
//#endregion
//#region node_modules/linkedom/esm/mixin/child-node.js
var asFragment = (ownerDocument, nodes) => {
	const fragment = ownerDocument.createDocumentFragment();
	fragment.append(...nodes);
	return fragment;
};
var before = (node, nodes) => {
	const { ownerDocument, parentNode } = node;
	if (parentNode) parentNode.insertBefore(asFragment(ownerDocument, nodes), node);
};
var after = (node, nodes) => {
	const { ownerDocument, parentNode } = node;
	if (parentNode) parentNode.insertBefore(asFragment(ownerDocument, nodes), getEnd(node)[NEXT]);
};
var replaceWith = (node, nodes) => {
	const { ownerDocument, parentNode } = node;
	if (parentNode) {
		if (nodes.includes(node)) replaceWith(node, [node = node.cloneNode()]);
		parentNode.insertBefore(asFragment(ownerDocument, nodes), node);
		node.remove();
	}
};
var remove = (prev, current, next) => {
	const { parentNode, nodeType } = current;
	if (prev || next) {
		setAdjacent(prev, next);
		current[PREV] = null;
		getEnd(current)[NEXT] = null;
	}
	if (parentNode) {
		current.parentNode = null;
		moCallback(current, parentNode);
		if (nodeType === 1) disconnectedCallback(current);
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/character-data.js
/**
* @implements globalThis.CharacterData
*/
var CharacterData$1 = class extends Node$1 {
	constructor(ownerDocument, localName, nodeType, data) {
		super(ownerDocument, localName, nodeType);
		this[VALUE] = $String(data);
	}
	get isConnected() {
		return isConnected(this);
	}
	get parentElement() {
		return parentElement(this);
	}
	get previousSibling() {
		return previousSibling(this);
	}
	get nextSibling() {
		return nextSibling(this);
	}
	get previousElementSibling() {
		return previousElementSibling(this);
	}
	get nextElementSibling() {
		return nextElementSibling(this);
	}
	before(...nodes) {
		before(this, nodes);
	}
	after(...nodes) {
		after(this, nodes);
	}
	replaceWith(...nodes) {
		replaceWith(this, nodes);
	}
	remove() {
		remove(this[PREV], this, this[NEXT]);
	}
	/* c8 ignore start */
	get data() {
		return this[VALUE];
	}
	set data(value) {
		this[VALUE] = $String(value);
		moCallback(this, this.parentNode);
	}
	get nodeValue() {
		return this.data;
	}
	set nodeValue(value) {
		this.data = value;
	}
	get textContent() {
		return this.data;
	}
	set textContent(value) {
		this.data = value;
	}
	get length() {
		return this.data.length;
	}
	substringData(offset, count) {
		return this.data.substr(offset, count);
	}
	appendData(data) {
		this.data += data;
	}
	insertData(offset, data) {
		const { data: t } = this;
		this.data = t.slice(0, offset) + data + t.slice(offset);
	}
	deleteData(offset, count) {
		const { data: t } = this;
		this.data = t.slice(0, offset) + t.slice(offset + count);
	}
	replaceData(offset, count, data) {
		const { data: t } = this;
		this.data = t.slice(0, offset) + data + t.slice(offset + count);
	}
	/* c8 ignore stop */
	toJSON() {
		const json = [];
		characterDataAsJSON(this, json);
		return json;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/cdata-section.js
/**
* @implements globalThis.CDATASection
*/
var CDATASection$1 = class CDATASection$1 extends CharacterData$1 {
	constructor(ownerDocument, data = "") {
		super(ownerDocument, "#cdatasection", 4, data);
	}
	cloneNode() {
		const { ownerDocument, [VALUE]: data } = this;
		return new CDATASection$1(ownerDocument, data);
	}
	toString() {
		return `<![CDATA[${this[VALUE]}]]>`;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/comment.js
/**
* @implements globalThis.Comment
*/
var Comment$1 = class Comment$1 extends CharacterData$1 {
	constructor(ownerDocument, data = "") {
		super(ownerDocument, "#comment", 8, data);
	}
	cloneNode() {
		const { ownerDocument, [VALUE]: data } = this;
		return new Comment$1(ownerDocument, data);
	}
	toString() {
		return `<!--${this[VALUE]}-->`;
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/matches.js
var { isArray } = Array;
/* c8 ignore start */
var isTag = ({ nodeType }) => nodeType === 1;
var existsOne = (test, elements) => elements.some((element) => isTag(element) && (test(element) || existsOne(test, getChildren(element))));
var getAttributeValue = (element, name) => name === "class" ? element.classList.value : element.getAttribute(name);
var getChildren = ({ childNodes }) => childNodes;
var getName = (element) => {
	const { localName } = element;
	return ignoreCase(element) ? localName.toLowerCase() : localName;
};
var getParent = ({ parentNode }) => parentNode;
var getSiblings = (element) => {
	const { parentNode } = element;
	return parentNode ? getChildren(parentNode) : element;
};
var getText = (node) => {
	if (isArray(node)) return node.map(getText).join("");
	if (isTag(node)) return getText(getChildren(node));
	if (node.nodeType === 3) return node.data;
	return "";
};
var hasAttrib = (element, name) => element.hasAttribute(name);
var removeSubsets = (nodes) => {
	let { length } = nodes;
	while (length--) {
		const node = nodes[length];
		if (length && -1 < nodes.lastIndexOf(node, length - 1)) {
			nodes.splice(length, 1);
			continue;
		}
		for (let { parentNode } = node; parentNode; parentNode = parentNode.parentNode) if (nodes.includes(parentNode)) {
			nodes.splice(length, 1);
			break;
		}
	}
	return nodes;
};
var findAll = (test, nodes) => {
	const matches = [];
	for (const node of nodes) if (isTag(node)) {
		if (test(node)) matches.push(node);
		matches.push(...findAll(test, getChildren(node)));
	}
	return matches;
};
var findOne = (test, nodes) => {
	for (let node of nodes) if (test(node) || (node = findOne(test, getChildren(node)))) return node;
	return null;
};
/* c8 ignore stop */
var adapter = {
	isTag,
	existsOne,
	getAttributeValue,
	getChildren,
	getName,
	getParent,
	getSiblings,
	getText,
	hasAttrib,
	removeSubsets,
	findAll,
	findOne
};
var prepareMatch = (element, selectors) => compile(selectors, {
	context: selectors.includes(":scope") ? element : void 0,
	xmlMode: !ignoreCase(element),
	adapter
});
var matches = (element, selectors) => is(element, selectors, {
	strict: true,
	context: selectors.includes(":scope") ? element : void 0,
	xmlMode: !ignoreCase(element),
	adapter
});
//#endregion
//#region node_modules/linkedom/esm/interface/text.js
/**
* @implements globalThis.Text
*/
var Text$1 = class Text$1 extends CharacterData$1 {
	constructor(ownerDocument, data = "") {
		super(ownerDocument, "#text", 3, data);
	}
	get wholeText() {
		const text = [];
		let { previousSibling, nextSibling } = this;
		while (previousSibling) {
			if (previousSibling.nodeType === 3) text.unshift(previousSibling[VALUE]);
			else break;
			previousSibling = previousSibling.previousSibling;
		}
		text.push(this[VALUE]);
		while (nextSibling) {
			if (nextSibling.nodeType === 3) text.push(nextSibling[VALUE]);
			else break;
			nextSibling = nextSibling.nextSibling;
		}
		return text.join("");
	}
	cloneNode() {
		const { ownerDocument, [VALUE]: data } = this;
		return new Text$1(ownerDocument, data);
	}
	toString() {
		return escape(this[VALUE]);
	}
};
//#endregion
//#region node_modules/linkedom/esm/mixin/parent-node.js
var isNode = (node) => node instanceof Node$1;
var insert = (parentNode, child, nodes) => {
	const { ownerDocument } = parentNode;
	for (const node of nodes) parentNode.insertBefore(isNode(node) ? node : new Text$1(ownerDocument, node), child);
};
/** @typedef { import('../interface/element.js').Element & {
[typeof NEXT]: NodeStruct,
[typeof PREV]: NodeStruct,
[typeof START]: NodeStruct,
nodeType: typeof ATTRIBUTE_NODE | typeof DOCUMENT_FRAGMENT_NODE | typeof ELEMENT_NODE | typeof TEXT_NODE | typeof NODE_END | typeof COMMENT_NODE | typeof CDATA_SECTION_NODE,
ownerDocument: Document,
parentNode: ParentNode,
}} NodeStruct */
var ParentNode = class extends Node$1 {
	constructor(ownerDocument, localName, nodeType) {
		super(ownerDocument, localName, nodeType);
		this[PRIVATE] = null;
		/** @type {NodeStruct} */
		this[NEXT] = this[END] = {
			[NEXT]: null,
			[PREV]: this,
			[START]: this,
			nodeType: -1,
			ownerDocument: this.ownerDocument,
			parentNode: null
		};
	}
	get childNodes() {
		const childNodes = new NodeList();
		let { firstChild } = this;
		while (firstChild) {
			childNodes.push(firstChild);
			firstChild = nextSibling(firstChild);
		}
		return childNodes;
	}
	get children() {
		const children = new NodeList();
		let { firstElementChild } = this;
		while (firstElementChild) {
			children.push(firstElementChild);
			firstElementChild = nextElementSibling(firstElementChild);
		}
		return children;
	}
	/**
	* @returns {NodeStruct | null}
	*/
	get firstChild() {
		let { [NEXT]: next, [END]: end } = this;
		while (next.nodeType === 2) next = next[NEXT];
		return next === end ? null : next;
	}
	/**
	* @returns {NodeStruct | null}
	*/
	get firstElementChild() {
		let { firstChild } = this;
		while (firstChild) {
			if (firstChild.nodeType === 1) return firstChild;
			firstChild = nextSibling(firstChild);
		}
		return null;
	}
	get lastChild() {
		const prev = this[END][PREV];
		switch (prev.nodeType) {
			case -1: return prev[START];
			case 2: return null;
		}
		return prev === this ? null : prev;
	}
	get lastElementChild() {
		let { lastChild } = this;
		while (lastChild) {
			if (lastChild.nodeType === 1) return lastChild;
			lastChild = previousSibling(lastChild);
		}
		return null;
	}
	get childElementCount() {
		return this.children.length;
	}
	prepend(...nodes) {
		insert(this, this.firstChild, nodes);
	}
	append(...nodes) {
		insert(this, this[END], nodes);
	}
	replaceChildren(...nodes) {
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end && next.nodeType === 2) next = next[NEXT];
		while (next !== end) {
			const after = getEnd(next)[NEXT];
			next.remove();
			next = after;
		}
		if (nodes.length) insert(this, end, nodes);
	}
	getElementsByClassName(className) {
		const elements = new NodeList();
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 1 && next.hasAttribute("class") && next.classList.has(className)) elements.push(next);
			next = next[NEXT];
		}
		return elements;
	}
	getElementsByTagName(tagName) {
		const elements = new NodeList();
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 1 && (next.localName === tagName || localCase(next) === tagName)) elements.push(next);
			next = next[NEXT];
		}
		return elements;
	}
	querySelector(selectors) {
		const matches = prepareMatch(this, selectors);
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 1 && matches(next)) return next;
			next = next.nodeType === 1 && next.localName === "template" ? next[END] : next[NEXT];
		}
		return null;
	}
	querySelectorAll(selectors) {
		const matches = prepareMatch(this, selectors);
		const elements = new NodeList();
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 1 && matches(next)) elements.push(next);
			next = next.nodeType === 1 && next.localName === "template" ? next[END] : next[NEXT];
		}
		return elements;
	}
	appendChild(node) {
		return this.insertBefore(node, this[END]);
	}
	contains(node) {
		let parentNode = node;
		while (parentNode && parentNode !== this) parentNode = parentNode.parentNode;
		return parentNode === this;
	}
	insertBefore(node, before = null) {
		if (node === before) return node;
		if (node === this) throw new Error("unable to append a node to itself");
		const next = before || this[END];
		switch (node.nodeType) {
			case 1:
				node.remove();
				node.parentNode = this;
				knownBoundaries(next[PREV], node, next);
				moCallback(node, null);
				connectedCallback(node);
				break;
			case 11: {
				let { [PRIVATE]: parentNode, firstChild, lastChild } = node;
				if (firstChild) {
					knownSegment(next[PREV], firstChild, lastChild, next);
					knownAdjacent(node, node[END]);
					if (parentNode) parentNode.replaceChildren();
					do {
						firstChild.parentNode = this;
						moCallback(firstChild, null);
						if (firstChild.nodeType === 1) connectedCallback(firstChild);
					} while (firstChild !== lastChild && (firstChild = nextSibling(firstChild)));
				}
				break;
			}
			case 3:
			case 8:
			case 4: node.remove();
			default:
				node.parentNode = this;
				knownSiblings(next[PREV], node, next);
				moCallback(node, null);
		}
		return node;
	}
	normalize() {
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			const { [NEXT]: $next, [PREV]: $prev, nodeType } = next;
			if (nodeType === 3) {
				if (!next[VALUE]) next.remove();
				else if ($prev && $prev.nodeType === 3) {
					$prev.textContent += next.textContent;
					next.remove();
				}
			}
			next = $next;
		}
	}
	removeChild(node) {
		if (node.parentNode !== this) throw new Error("node is not a child");
		node.remove();
		return node;
	}
	replaceChild(node, replaced) {
		const next = getEnd(replaced)[NEXT];
		replaced.remove();
		this.insertBefore(node, next);
		return replaced;
	}
};
//#endregion
//#region node_modules/linkedom/esm/mixin/non-element-parent-node.js
var NonElementParentNode = class extends ParentNode {
	getElementById(id) {
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 1 && next.id === id) return next;
			next = next[NEXT];
		}
		return null;
	}
	cloneNode(deep) {
		const { ownerDocument, constructor } = this;
		const nonEPN = new constructor(ownerDocument);
		if (deep) {
			const { [END]: end } = nonEPN;
			for (const node of this.childNodes) nonEPN.insertBefore(node.cloneNode(deep), end);
		}
		return nonEPN;
	}
	toString() {
		const { childNodes, localName } = this;
		return `<${localName}>${childNodes.join("")}</${localName}>`;
	}
	toJSON() {
		const json = [];
		nonElementAsJSON(this, json);
		return json;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/document-fragment.js
/**
* @implements globalThis.DocumentFragment
*/
var DocumentFragment$1 = class extends NonElementParentNode {
	constructor(ownerDocument) {
		super(ownerDocument, "#document-fragment", 11);
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/document-type.js
/**
* @implements globalThis.DocumentType
*/
var DocumentType$1 = class DocumentType$1 extends Node$1 {
	constructor(ownerDocument, name, publicId = "", systemId = "") {
		super(ownerDocument, "#document-type", 10);
		this.name = name;
		this.publicId = publicId;
		this.systemId = systemId;
	}
	cloneNode() {
		const { ownerDocument, name, publicId, systemId } = this;
		return new DocumentType$1(ownerDocument, name, publicId, systemId);
	}
	toString() {
		const { name, publicId, systemId } = this;
		const hasPublic = 0 < publicId.length;
		const str = [name];
		if (hasPublic) str.push("PUBLIC", `"${publicId}"`);
		if (systemId.length) {
			if (!hasPublic) str.push("SYSTEM");
			str.push(`"${systemId}"`);
		}
		return `<!DOCTYPE ${str.join(" ")}>`;
	}
	toJSON() {
		const json = [];
		documentTypeAsJSON(this, json);
		return json;
	}
};
//#endregion
//#region node_modules/linkedom/esm/mixin/inner-html.js
/**
* @param {Node} node
* @returns {String}
*/
var getInnerHtml = (node) => node.childNodes.join("");
/**
* @param {Node} node
* @param {String} html
*/
var setInnerHtml = (node, html) => {
	const { ownerDocument } = node;
	const { constructor } = ownerDocument;
	const document = new constructor();
	document[CUSTOM_ELEMENTS] = ownerDocument[CUSTOM_ELEMENTS];
	const { childNodes } = parseFromString(document, ignoreCase(node), html);
	node.replaceChildren(...childNodes.map(setOwnerDocument, ownerDocument));
};
function setOwnerDocument(node) {
	node.ownerDocument = this;
	switch (node.nodeType) {
		case 1:
		case 11: node.childNodes.forEach(setOwnerDocument, this);
	}
	return node;
}
//#endregion
//#region node_modules/uhyphen/esm/index.js
var esm_default = (camel) => camel.replace(/(([A-Z0-9])([A-Z0-9][a-z]))|(([a-z0-9]+)([A-Z]))/g, "$2$5-$3$6").toLowerCase();
//#endregion
//#region node_modules/linkedom/esm/dom/string-map.js
var refs$1 = /* @__PURE__ */ new WeakMap();
var key = (name) => `data-${esm_default(name)}`;
var prop = (name) => name.slice(5).replace(/-([a-z])/g, (_, $1) => $1.toUpperCase());
var handler$2 = {
	get(dataset, name) {
		if (name in dataset) return refs$1.get(dataset).getAttribute(key(name));
	},
	set(dataset, name, value) {
		dataset[name] = value;
		refs$1.get(dataset).setAttribute(key(name), value);
		return true;
	},
	deleteProperty(dataset, name) {
		if (name in dataset) refs$1.get(dataset).removeAttribute(key(name));
		return delete dataset[name];
	}
};
/**
* @implements globalThis.DOMStringMap
*/
var DOMStringMap = class {
	/**
	* @param {Element} ref
	*/
	constructor(ref) {
		for (const { name, value } of ref.attributes) if (/^data-/.test(name)) this[prop(name)] = value;
		refs$1.set(this, ref);
		return new Proxy(this, handler$2);
	}
};
setPrototypeOf(DOMStringMap.prototype, null);
//#endregion
//#region node_modules/linkedom/esm/dom/token-list.js
var { add } = Set.prototype;
var addTokens = (self, tokens) => {
	for (const token of tokens) if (token) add.call(self, token);
};
var update = ({ [OWNER_ELEMENT]: ownerElement, value }) => {
	const attribute = ownerElement.getAttributeNode("class");
	if (attribute) attribute.value = value;
	else setAttribute(ownerElement, new Attr$1(ownerElement.ownerDocument, "class", value));
};
/**
* @implements globalThis.DOMTokenList
*/
var DOMTokenList = class extends Set {
	constructor(ownerElement) {
		super();
		this[OWNER_ELEMENT] = ownerElement;
		const attribute = ownerElement.getAttributeNode("class");
		if (attribute) addTokens(this, attribute.value.split(/\s+/));
	}
	get length() {
		return this.size;
	}
	get value() {
		return [...this].join(" ");
	}
	/**
	* @param  {...string} tokens
	*/
	add(...tokens) {
		addTokens(this, tokens);
		update(this);
	}
	/**
	* @param {string} token
	*/
	contains(token) {
		return this.has(token);
	}
	/**
	* @param  {...string} tokens
	*/
	remove(...tokens) {
		for (const token of tokens) this.delete(token);
		update(this);
	}
	/**
	* @param {string} token
	* @param {boolean?} force
	*/
	toggle(token, force) {
		if (this.has(token)) {
			if (force) return true;
			this.delete(token);
			update(this);
		} else if (force || arguments.length === 1) {
			super.add(token);
			update(this);
			return true;
		}
		return false;
	}
	/**
	* @param {string} token
	* @param {string} newToken
	*/
	replace(token, newToken) {
		if (this.has(token)) {
			this.delete(token);
			super.add(newToken);
			update(this);
			return true;
		}
		return false;
	}
	/**
	* @param {string} token
	*/
	supports() {
		return true;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/css-style-declaration.js
var refs = /* @__PURE__ */ new WeakMap();
var getKeys = (style) => [...style.keys()].filter((key) => key !== PRIVATE);
var updateKeys = (style) => {
	const attr = refs.get(style).getAttributeNode("style");
	if (!attr || attr[CHANGED] || style.get(PRIVATE) !== attr) {
		style.clear();
		if (attr) {
			style.set(PRIVATE, attr);
			for (const rule of attr[VALUE].split(/\s*;\s*/)) {
				let [key, ...rest] = rule.split(":");
				if (rest.length > 0) {
					key = key.trim();
					const value = rest.join(":").trim();
					if (key && value) style.set(key, value);
				}
			}
		}
	}
	return attr;
};
var handler$1 = {
	get(style, name) {
		if (name in prototype) return style[name];
		updateKeys(style);
		if (name === "length") return getKeys(style).length;
		if (/^\d+$/.test(name)) return getKeys(style)[name];
		return style.get(esm_default(name)) ?? "";
	},
	set(style, name, value) {
		if (name === "cssText") style[name] = value;
		else {
			let attr = updateKeys(style);
			if (value == null) style.delete(esm_default(name));
			else style.set(esm_default(name), value);
			if (!attr) {
				const element = refs.get(style);
				attr = element.ownerDocument.createAttribute("style");
				element.setAttributeNode(attr);
				style.set(PRIVATE, attr);
			}
			attr[CHANGED] = false;
			attr[VALUE] = style.toString();
		}
		return true;
	}
};
/**
* @implements globalThis.CSSStyleDeclaration
*/
var CSSStyleDeclaration = class extends Map {
	constructor(element) {
		super();
		refs.set(this, element);
		/* c8 ignore start */
		return new Proxy(this, handler$1);
		/* c8 ignore stop */
	}
	get cssText() {
		return this.toString();
	}
	set cssText(value) {
		refs.get(this).setAttribute("style", value);
	}
	getPropertyValue(name) {
		const self = this[PRIVATE];
		return handler$1.get(self, name);
	}
	setProperty(name, value) {
		const self = this[PRIVATE];
		handler$1.set(self, name, value);
	}
	removeProperty(name) {
		const self = this[PRIVATE];
		handler$1.set(self, name, null);
	}
	[Symbol.iterator]() {
		const self = this[PRIVATE];
		updateKeys(self);
		const keys = getKeys(self);
		const { length } = keys;
		let i = 0;
		return { next() {
			const done = i === length;
			return {
				done,
				value: done ? null : keys[i++]
			};
		} };
	}
	get [PRIVATE]() {
		return this;
	}
	toString() {
		const self = this[PRIVATE];
		updateKeys(self);
		const cssText = [];
		self.forEach(push, cssText);
		return cssText.join(";");
	}
};
var { prototype } = CSSStyleDeclaration;
function push(value, key) {
	if (key !== PRIVATE) this.push(`${key}:${value}`);
}
//#endregion
//#region node_modules/linkedom/esm/interface/event.js
/* c8 ignore start */
var BUBBLING_PHASE = 3;
var AT_TARGET = 2;
var CAPTURING_PHASE = 1;
var NONE = 0;
function getCurrentTarget(ev) {
	return ev.currentTarget;
}
/**
* @implements globalThis.Event
*/
var GlobalEvent = class {
	static get BUBBLING_PHASE() {
		return BUBBLING_PHASE;
	}
	static get AT_TARGET() {
		return AT_TARGET;
	}
	static get CAPTURING_PHASE() {
		return CAPTURING_PHASE;
	}
	static get NONE() {
		return NONE;
	}
	constructor(type, eventInitDict = {}) {
		this.type = type;
		this.bubbles = !!eventInitDict.bubbles;
		this.cancelBubble = false;
		this._stopImmediatePropagationFlag = false;
		this.cancelable = !!eventInitDict.cancelable;
		this.eventPhase = this.NONE;
		this.timeStamp = Date.now();
		this.defaultPrevented = false;
		this.originalTarget = null;
		this.returnValue = null;
		this.srcElement = null;
		this.target = null;
		this._path = [];
	}
	get BUBBLING_PHASE() {
		return BUBBLING_PHASE;
	}
	get AT_TARGET() {
		return AT_TARGET;
	}
	get CAPTURING_PHASE() {
		return CAPTURING_PHASE;
	}
	get NONE() {
		return NONE;
	}
	preventDefault() {
		this.defaultPrevented = true;
	}
	composedPath() {
		return this._path.map(getCurrentTarget);
	}
	stopPropagation() {
		this.cancelBubble = true;
	}
	stopImmediatePropagation() {
		this.stopPropagation();
		this._stopImmediatePropagationFlag = true;
	}
};
/* c8 ignore stop */
//#endregion
//#region node_modules/linkedom/esm/interface/named-node-map.js
/**
* @implements globalThis.NamedNodeMap
*/
var NamedNodeMap = class extends Array {
	constructor(ownerElement) {
		super();
		this.ownerElement = ownerElement;
	}
	getNamedItem(name) {
		return this.ownerElement.getAttributeNode(name);
	}
	setNamedItem(attr) {
		this.ownerElement.setAttributeNode(attr);
		this.unshift(attr);
	}
	removeNamedItem(name) {
		const item = this.getNamedItem(name);
		this.ownerElement.removeAttribute(name);
		this.splice(this.indexOf(item), 1);
	}
	item(index) {
		return index < this.length ? this[index] : null;
	}
	/* c8 ignore start */
	getNamedItemNS(_, name) {
		return this.getNamedItem(name);
	}
	setNamedItemNS(_, attr) {
		return this.setNamedItem(attr);
	}
	removeNamedItemNS(_, name) {
		return this.removeNamedItem(name);
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/shadow-root.js
/**
* @implements globalThis.ShadowRoot
*/
var ShadowRoot$1 = class extends NonElementParentNode {
	constructor(host) {
		super(host.ownerDocument, "#shadow-root", 11);
		this.host = host;
	}
	get innerHTML() {
		return getInnerHtml(this);
	}
	set innerHTML(html) {
		setInnerHtml(this, html);
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/element.js
var attributesHandler = { get(target, key) {
	return key in target ? target[key] : target.find(({ name }) => name === key);
} };
var create = (ownerDocument, element, localName) => {
	if ("ownerSVGElement" in element) {
		const svg = ownerDocument.createElementNS(SVG_NAMESPACE, localName);
		svg.ownerSVGElement = element.ownerSVGElement;
		return svg;
	}
	return ownerDocument.createElement(localName);
};
var isVoid = ({ localName, ownerDocument }) => {
	return ownerDocument[MIME].voidElements.test(localName);
};
/**
* @implements globalThis.Element
*/
var Element$1 = class extends ParentNode {
	constructor(ownerDocument, localName) {
		super(ownerDocument, localName, 1);
		this[CLASS_LIST] = null;
		this[DATASET] = null;
		this[STYLE] = null;
	}
	get isConnected() {
		return isConnected(this);
	}
	get parentElement() {
		return parentElement(this);
	}
	get previousSibling() {
		return previousSibling(this);
	}
	get nextSibling() {
		return nextSibling(this);
	}
	get namespaceURI() {
		return "http://www.w3.org/1999/xhtml";
	}
	get previousElementSibling() {
		return previousElementSibling(this);
	}
	get nextElementSibling() {
		return nextElementSibling(this);
	}
	before(...nodes) {
		before(this, nodes);
	}
	after(...nodes) {
		after(this, nodes);
	}
	replaceWith(...nodes) {
		replaceWith(this, nodes);
	}
	remove() {
		remove(this[PREV], this, this[END][NEXT]);
	}
	get id() {
		return stringAttribute.get(this, "id");
	}
	set id(value) {
		stringAttribute.set(this, "id", value);
	}
	get className() {
		return this.classList.value;
	}
	set className(value) {
		const { classList } = this;
		classList.clear();
		classList.add(...$String(value).split(/\s+/));
	}
	get nodeName() {
		return localCase(this);
	}
	get tagName() {
		return localCase(this);
	}
	get classList() {
		return this[CLASS_LIST] || (this[CLASS_LIST] = new DOMTokenList(this));
	}
	get dataset() {
		return this[DATASET] || (this[DATASET] = new DOMStringMap(this));
	}
	getBoundingClientRect() {
		return {
			x: 0,
			y: 0,
			bottom: 0,
			height: 0,
			left: 0,
			right: 0,
			top: 0,
			width: 0
		};
	}
	get nonce() {
		return stringAttribute.get(this, "nonce");
	}
	set nonce(value) {
		stringAttribute.set(this, "nonce", value);
	}
	get style() {
		return this[STYLE] || (this[STYLE] = new CSSStyleDeclaration(this));
	}
	get tabIndex() {
		return numericAttribute.get(this, "tabindex") || -1;
	}
	set tabIndex(value) {
		numericAttribute.set(this, "tabindex", value);
	}
	get slot() {
		return stringAttribute.get(this, "slot");
	}
	set slot(value) {
		stringAttribute.set(this, "slot", value);
	}
	get innerText() {
		const text = [];
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			if (next.nodeType === 3) text.push(next.textContent.replace(/\s+/g, " "));
			else if (text.length && next[NEXT] != end && BLOCK_ELEMENTS.has(next.tagName)) text.push("\n");
			next = next[NEXT];
		}
		return text.join("");
	}
	/**
	* @returns {String}
	*/
	get textContent() {
		const text = [];
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			const nodeType = next.nodeType;
			if (nodeType === 3 || nodeType === 4) text.push(next.textContent);
			next = next[NEXT];
		}
		return text.join("");
	}
	set textContent(text) {
		this.replaceChildren();
		if (text != null && text !== "") this.appendChild(new Text$1(this.ownerDocument, text));
	}
	get innerHTML() {
		return getInnerHtml(this);
	}
	set innerHTML(html) {
		setInnerHtml(this, html);
	}
	get outerHTML() {
		return this.toString();
	}
	set outerHTML(html) {
		const template = this.ownerDocument.createElement("");
		template.innerHTML = html;
		this.replaceWith(...template.childNodes);
	}
	get attributes() {
		const attributes = new NamedNodeMap(this);
		let next = this[NEXT];
		while (next.nodeType === 2) {
			attributes.push(next);
			next = next[NEXT];
		}
		return new Proxy(attributes, attributesHandler);
	}
	focus() {
		this.dispatchEvent(new GlobalEvent("focus"));
	}
	getAttribute(name) {
		if (name === "class") return this.className;
		const attribute = this.getAttributeNode(name);
		return attribute && (ignoreCase(this) ? attribute.value : escape(attribute.value));
	}
	getAttributeNode(name) {
		let next = this[NEXT];
		while (next.nodeType === 2) {
			if (next.name === name) return next;
			next = next[NEXT];
		}
		return null;
	}
	getAttributeNames() {
		const attributes = new NodeList();
		let next = this[NEXT];
		while (next.nodeType === 2) {
			attributes.push(next.name);
			next = next[NEXT];
		}
		return attributes;
	}
	hasAttribute(name) {
		return !!this.getAttributeNode(name);
	}
	hasAttributes() {
		return this[NEXT].nodeType === 2;
	}
	removeAttribute(name) {
		if (name === "class" && this[CLASS_LIST]) this[CLASS_LIST].clear();
		let next = this[NEXT];
		while (next.nodeType === 2) {
			if (next.name === name) {
				removeAttribute(this, next);
				return;
			}
			next = next[NEXT];
		}
	}
	removeAttributeNode(attribute) {
		let next = this[NEXT];
		while (next.nodeType === 2) {
			if (next === attribute) {
				removeAttribute(this, next);
				return;
			}
			next = next[NEXT];
		}
	}
	setAttribute(name, value) {
		if (name === "class") this.className = value;
		else {
			const attribute = this.getAttributeNode(name);
			if (attribute) attribute.value = value;
			else setAttribute(this, new Attr$1(this.ownerDocument, name, value));
		}
	}
	setAttributeNode(attribute) {
		const { name } = attribute;
		const previously = this.getAttributeNode(name);
		if (previously !== attribute) {
			if (previously) this.removeAttributeNode(previously);
			const { ownerElement } = attribute;
			if (ownerElement) ownerElement.removeAttributeNode(attribute);
			setAttribute(this, attribute);
		}
		return previously;
	}
	toggleAttribute(name, force) {
		if (this.hasAttribute(name)) {
			if (!force) {
				this.removeAttribute(name);
				return false;
			}
			return true;
		} else if (force || arguments.length === 1) {
			this.setAttribute(name, "");
			return true;
		}
		return false;
	}
	get shadowRoot() {
		if (shadowRoots.has(this)) {
			const { mode, shadowRoot } = shadowRoots.get(this);
			if (mode === "open") return shadowRoot;
		}
		return null;
	}
	attachShadow(init) {
		if (shadowRoots.has(this)) throw new Error("operation not supported");
		const shadowRoot = new ShadowRoot$1(this);
		shadowRoots.set(this, {
			mode: init.mode,
			shadowRoot
		});
		return shadowRoot;
	}
	matches(selectors) {
		return matches(this, selectors);
	}
	closest(selectors) {
		let parentElement = this;
		const matches = prepareMatch(parentElement, selectors);
		while (parentElement && !matches(parentElement)) parentElement = parentElement.parentElement;
		return parentElement;
	}
	insertAdjacentElement(position, element) {
		const { parentElement } = this;
		switch (position) {
			case "beforebegin":
				if (parentElement) {
					parentElement.insertBefore(element, this);
					break;
				}
				return null;
			case "afterbegin":
				this.insertBefore(element, this.firstChild);
				break;
			case "beforeend":
				this.insertBefore(element, null);
				break;
			case "afterend":
				if (parentElement) {
					parentElement.insertBefore(element, this.nextSibling);
					break;
				}
				return null;
		}
		return element;
	}
	insertAdjacentHTML(position, html) {
		this.insertAdjacentElement(position, htmlToFragment(this.ownerDocument, html));
	}
	insertAdjacentText(position, text) {
		const node = this.ownerDocument.createTextNode(text);
		this.insertAdjacentElement(position, node);
	}
	cloneNode(deep = false) {
		const { ownerDocument, localName } = this;
		const addNext = (next) => {
			next.parentNode = parentNode;
			knownAdjacent($next, next);
			$next = next;
		};
		const clone = create(ownerDocument, this, localName);
		let parentNode = clone, $next = clone;
		let { [NEXT]: next, [END]: prev } = this;
		while (next !== prev && (deep || next.nodeType === 2)) {
			switch (next.nodeType) {
				case -1:
					knownAdjacent($next, parentNode[END]);
					$next = parentNode[END];
					parentNode = parentNode.parentNode;
					break;
				case 1: {
					const node = create(ownerDocument, next, next.localName);
					addNext(node);
					parentNode = node;
					break;
				}
				case 2: {
					const attr = next.cloneNode(deep);
					attr.ownerElement = parentNode;
					addNext(attr);
					break;
				}
				case 3:
				case 8:
				case 4: addNext(next.cloneNode(deep));
			}
			next = next[NEXT];
		}
		knownAdjacent($next, clone[END]);
		return clone;
	}
	toString() {
		const out = [];
		const { [END]: end } = this;
		let next = { [NEXT]: this };
		let isOpened = false;
		do {
			next = next[NEXT];
			switch (next.nodeType) {
				case 2: {
					const attr = " " + next;
					switch (attr) {
						case " id":
						case " class":
						case " style": break;
						default: out.push(attr);
					}
					break;
				}
				case -1: {
					const start = next[START];
					if (isOpened) {
						if ("ownerSVGElement" in start) out.push(" />");
						else if (isVoid(start)) out.push(ignoreCase(start) ? ">" : " />");
						else out.push(`></${start.localName}>`);
						isOpened = false;
					} else out.push(`</${start.localName}>`);
					break;
				}
				case 1:
					if (isOpened) out.push(">");
					if (next.toString !== this.toString) {
						out.push(next.toString());
						next = next[END];
						isOpened = false;
					} else {
						out.push(`<${next.localName}`);
						isOpened = true;
					}
					break;
				case 3:
				case 8:
				case 4:
					out.push((isOpened ? ">" : "") + next);
					isOpened = false;
			}
		} while (next !== end);
		return out.join("");
	}
	toJSON() {
		const json = [];
		elementAsJSON(this, json);
		return json;
	}
	/* c8 ignore start */
	getAttributeNS(_, name) {
		return this.getAttribute(name);
	}
	getElementsByTagNameNS(_, name) {
		return this.getElementsByTagName(name);
	}
	hasAttributeNS(_, name) {
		return this.hasAttribute(name);
	}
	removeAttributeNS(_, name) {
		this.removeAttribute(name);
	}
	setAttributeNS(_, name, value) {
		this.setAttribute(name, value);
	}
	setAttributeNodeNS(attr) {
		return this.setAttributeNode(attr);
	}
};
//#endregion
//#region node_modules/linkedom/esm/svg/element.js
var classNames = /* @__PURE__ */ new WeakMap();
var handler = {
	get(target, name) {
		return target[name];
	},
	set(target, name, value) {
		target[name] = value;
		return true;
	}
};
/**
* @implements globalThis.SVGElement
*/
var SVGElement$1 = class extends Element$1 {
	constructor(ownerDocument, localName, ownerSVGElement = null) {
		super(ownerDocument, localName);
		this.ownerSVGElement = ownerSVGElement;
	}
	get className() {
		if (!classNames.has(this)) classNames.set(this, new Proxy({
			baseVal: "",
			animVal: ""
		}, handler));
		return classNames.get(this);
	}
	/* c8 ignore start */
	set className(value) {
		const { classList } = this;
		classList.clear();
		classList.add(...$String(value).split(/\s+/));
	}
	/* c8 ignore stop */
	get namespaceURI() {
		return "http://www.w3.org/2000/svg";
	}
	getAttribute(name) {
		return name === "class" ? [...this.classList].join(" ") : super.getAttribute(name);
	}
	setAttribute(name, value) {
		if (name === "class") this.className = value;
		else if (name === "style") {
			const { className } = this;
			className.baseVal = className.animVal = value;
		}
		super.setAttribute(name, value);
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/facades.js
/* c8 ignore start */
var illegalConstructor = () => {
	throw new TypeError("Illegal constructor");
};
function Attr() {
	illegalConstructor();
}
setPrototypeOf(Attr, Attr$1);
Attr.prototype = Attr$1.prototype;
function CDATASection() {
	illegalConstructor();
}
setPrototypeOf(CDATASection, CDATASection$1);
CDATASection.prototype = CDATASection$1.prototype;
function CharacterData() {
	illegalConstructor();
}
setPrototypeOf(CharacterData, CharacterData$1);
CharacterData.prototype = CharacterData$1.prototype;
function Comment() {
	illegalConstructor();
}
setPrototypeOf(Comment, Comment$1);
Comment.prototype = Comment$1.prototype;
function DocumentFragment() {
	illegalConstructor();
}
setPrototypeOf(DocumentFragment, DocumentFragment$1);
DocumentFragment.prototype = DocumentFragment$1.prototype;
function DocumentType() {
	illegalConstructor();
}
setPrototypeOf(DocumentType, DocumentType$1);
DocumentType.prototype = DocumentType$1.prototype;
function Element() {
	illegalConstructor();
}
setPrototypeOf(Element, Element$1);
Element.prototype = Element$1.prototype;
function Node() {
	illegalConstructor();
}
setPrototypeOf(Node, Node$1);
Node.prototype = Node$1.prototype;
function ShadowRoot() {
	illegalConstructor();
}
setPrototypeOf(ShadowRoot, ShadowRoot$1);
ShadowRoot.prototype = ShadowRoot$1.prototype;
function Text() {
	illegalConstructor();
}
setPrototypeOf(Text, Text$1);
Text.prototype = Text$1.prototype;
function SVGElement() {
	illegalConstructor();
}
setPrototypeOf(SVGElement, SVGElement$1);
SVGElement.prototype = SVGElement$1.prototype;
/* c8 ignore stop */
var Facades = {
	Attr,
	CDATASection,
	CharacterData,
	Comment,
	DocumentFragment,
	DocumentType,
	Element,
	Node,
	ShadowRoot,
	Text,
	SVGElement
};
//#endregion
//#region node_modules/linkedom/esm/html/element.js
var Level0 = /* @__PURE__ */ new WeakMap();
var level0 = {
	get(element, name) {
		return Level0.has(element) && Level0.get(element)[name] || null;
	},
	set(element, name, value) {
		if (!Level0.has(element)) Level0.set(element, {});
		const handlers = Level0.get(element);
		const type = name.slice(2);
		if (handlers[name]) element.removeEventListener(type, handlers[name], false);
		if (handlers[name] = value) element.addEventListener(type, value, false);
	}
};
/**
* @implements globalThis.HTMLElement
*/
var HTMLElement = class extends Element$1 {
	static get observedAttributes() {
		return [];
	}
	constructor(ownerDocument = null, localName = "") {
		super(ownerDocument, localName);
		const ownerLess = !ownerDocument;
		let options;
		if (ownerLess) {
			const { constructor: Class } = this;
			if (!Classes.has(Class)) throw new Error("unable to initialize this Custom Element");
			({ownerDocument, localName, options} = Classes.get(Class));
		}
		if (ownerDocument[UPGRADE]) {
			const { element, values } = ownerDocument[UPGRADE];
			ownerDocument[UPGRADE] = null;
			for (const [key, value] of values) element[key] = value;
			return element;
		}
		if (ownerLess) {
			this.ownerDocument = this[END].ownerDocument = ownerDocument;
			this.localName = localName;
			customElements.set(this, { connected: false });
			if (options.is) this.setAttribute("is", options.is);
		}
	}
	/* c8 ignore start */
	blur() {
		this.dispatchEvent(new GlobalEvent("blur"));
	}
	click() {
		const clickEvent = new GlobalEvent("click", {
			bubbles: true,
			cancelable: true
		});
		clickEvent.button = 0;
		this.dispatchEvent(clickEvent);
	}
	get accessKeyLabel() {
		const { accessKey } = this;
		return accessKey && `Alt+Shift+${accessKey}`;
	}
	get isContentEditable() {
		return this.hasAttribute("contenteditable");
	}
	get contentEditable() {
		return booleanAttribute.get(this, "contenteditable");
	}
	set contentEditable(value) {
		booleanAttribute.set(this, "contenteditable", value);
	}
	get draggable() {
		return booleanAttribute.get(this, "draggable");
	}
	set draggable(value) {
		booleanAttribute.set(this, "draggable", value);
	}
	get hidden() {
		return booleanAttribute.get(this, "hidden");
	}
	set hidden(value) {
		booleanAttribute.set(this, "hidden", value);
	}
	get spellcheck() {
		return booleanAttribute.get(this, "spellcheck");
	}
	set spellcheck(value) {
		booleanAttribute.set(this, "spellcheck", value);
	}
	get accessKey() {
		return stringAttribute.get(this, "accesskey");
	}
	set accessKey(value) {
		stringAttribute.set(this, "accesskey", value);
	}
	get dir() {
		return stringAttribute.get(this, "dir");
	}
	set dir(value) {
		stringAttribute.set(this, "dir", value);
	}
	get lang() {
		return stringAttribute.get(this, "lang");
	}
	set lang(value) {
		stringAttribute.set(this, "lang", value);
	}
	get title() {
		return stringAttribute.get(this, "title");
	}
	set title(value) {
		stringAttribute.set(this, "title", value);
	}
	get onabort() {
		return level0.get(this, "onabort");
	}
	set onabort(value) {
		level0.set(this, "onabort", value);
	}
	get onblur() {
		return level0.get(this, "onblur");
	}
	set onblur(value) {
		level0.set(this, "onblur", value);
	}
	get oncancel() {
		return level0.get(this, "oncancel");
	}
	set oncancel(value) {
		level0.set(this, "oncancel", value);
	}
	get oncanplay() {
		return level0.get(this, "oncanplay");
	}
	set oncanplay(value) {
		level0.set(this, "oncanplay", value);
	}
	get oncanplaythrough() {
		return level0.get(this, "oncanplaythrough");
	}
	set oncanplaythrough(value) {
		level0.set(this, "oncanplaythrough", value);
	}
	get onchange() {
		return level0.get(this, "onchange");
	}
	set onchange(value) {
		level0.set(this, "onchange", value);
	}
	get onclick() {
		return level0.get(this, "onclick");
	}
	set onclick(value) {
		level0.set(this, "onclick", value);
	}
	get onclose() {
		return level0.get(this, "onclose");
	}
	set onclose(value) {
		level0.set(this, "onclose", value);
	}
	get oncontextmenu() {
		return level0.get(this, "oncontextmenu");
	}
	set oncontextmenu(value) {
		level0.set(this, "oncontextmenu", value);
	}
	get oncuechange() {
		return level0.get(this, "oncuechange");
	}
	set oncuechange(value) {
		level0.set(this, "oncuechange", value);
	}
	get ondblclick() {
		return level0.get(this, "ondblclick");
	}
	set ondblclick(value) {
		level0.set(this, "ondblclick", value);
	}
	get ondrag() {
		return level0.get(this, "ondrag");
	}
	set ondrag(value) {
		level0.set(this, "ondrag", value);
	}
	get ondragend() {
		return level0.get(this, "ondragend");
	}
	set ondragend(value) {
		level0.set(this, "ondragend", value);
	}
	get ondragenter() {
		return level0.get(this, "ondragenter");
	}
	set ondragenter(value) {
		level0.set(this, "ondragenter", value);
	}
	get ondragleave() {
		return level0.get(this, "ondragleave");
	}
	set ondragleave(value) {
		level0.set(this, "ondragleave", value);
	}
	get ondragover() {
		return level0.get(this, "ondragover");
	}
	set ondragover(value) {
		level0.set(this, "ondragover", value);
	}
	get ondragstart() {
		return level0.get(this, "ondragstart");
	}
	set ondragstart(value) {
		level0.set(this, "ondragstart", value);
	}
	get ondrop() {
		return level0.get(this, "ondrop");
	}
	set ondrop(value) {
		level0.set(this, "ondrop", value);
	}
	get ondurationchange() {
		return level0.get(this, "ondurationchange");
	}
	set ondurationchange(value) {
		level0.set(this, "ondurationchange", value);
	}
	get onemptied() {
		return level0.get(this, "onemptied");
	}
	set onemptied(value) {
		level0.set(this, "onemptied", value);
	}
	get onended() {
		return level0.get(this, "onended");
	}
	set onended(value) {
		level0.set(this, "onended", value);
	}
	get onerror() {
		return level0.get(this, "onerror");
	}
	set onerror(value) {
		level0.set(this, "onerror", value);
	}
	get onfocus() {
		return level0.get(this, "onfocus");
	}
	set onfocus(value) {
		level0.set(this, "onfocus", value);
	}
	get oninput() {
		return level0.get(this, "oninput");
	}
	set oninput(value) {
		level0.set(this, "oninput", value);
	}
	get oninvalid() {
		return level0.get(this, "oninvalid");
	}
	set oninvalid(value) {
		level0.set(this, "oninvalid", value);
	}
	get onkeydown() {
		return level0.get(this, "onkeydown");
	}
	set onkeydown(value) {
		level0.set(this, "onkeydown", value);
	}
	get onkeypress() {
		return level0.get(this, "onkeypress");
	}
	set onkeypress(value) {
		level0.set(this, "onkeypress", value);
	}
	get onkeyup() {
		return level0.get(this, "onkeyup");
	}
	set onkeyup(value) {
		level0.set(this, "onkeyup", value);
	}
	get onload() {
		return level0.get(this, "onload");
	}
	set onload(value) {
		level0.set(this, "onload", value);
	}
	get onloadeddata() {
		return level0.get(this, "onloadeddata");
	}
	set onloadeddata(value) {
		level0.set(this, "onloadeddata", value);
	}
	get onloadedmetadata() {
		return level0.get(this, "onloadedmetadata");
	}
	set onloadedmetadata(value) {
		level0.set(this, "onloadedmetadata", value);
	}
	get onloadstart() {
		return level0.get(this, "onloadstart");
	}
	set onloadstart(value) {
		level0.set(this, "onloadstart", value);
	}
	get onmousedown() {
		return level0.get(this, "onmousedown");
	}
	set onmousedown(value) {
		level0.set(this, "onmousedown", value);
	}
	get onmouseenter() {
		return level0.get(this, "onmouseenter");
	}
	set onmouseenter(value) {
		level0.set(this, "onmouseenter", value);
	}
	get onmouseleave() {
		return level0.get(this, "onmouseleave");
	}
	set onmouseleave(value) {
		level0.set(this, "onmouseleave", value);
	}
	get onmousemove() {
		return level0.get(this, "onmousemove");
	}
	set onmousemove(value) {
		level0.set(this, "onmousemove", value);
	}
	get onmouseout() {
		return level0.get(this, "onmouseout");
	}
	set onmouseout(value) {
		level0.set(this, "onmouseout", value);
	}
	get onmouseover() {
		return level0.get(this, "onmouseover");
	}
	set onmouseover(value) {
		level0.set(this, "onmouseover", value);
	}
	get onmouseup() {
		return level0.get(this, "onmouseup");
	}
	set onmouseup(value) {
		level0.set(this, "onmouseup", value);
	}
	get onmousewheel() {
		return level0.get(this, "onmousewheel");
	}
	set onmousewheel(value) {
		level0.set(this, "onmousewheel", value);
	}
	get onpause() {
		return level0.get(this, "onpause");
	}
	set onpause(value) {
		level0.set(this, "onpause", value);
	}
	get onplay() {
		return level0.get(this, "onplay");
	}
	set onplay(value) {
		level0.set(this, "onplay", value);
	}
	get onplaying() {
		return level0.get(this, "onplaying");
	}
	set onplaying(value) {
		level0.set(this, "onplaying", value);
	}
	get onprogress() {
		return level0.get(this, "onprogress");
	}
	set onprogress(value) {
		level0.set(this, "onprogress", value);
	}
	get onratechange() {
		return level0.get(this, "onratechange");
	}
	set onratechange(value) {
		level0.set(this, "onratechange", value);
	}
	get onreset() {
		return level0.get(this, "onreset");
	}
	set onreset(value) {
		level0.set(this, "onreset", value);
	}
	get onresize() {
		return level0.get(this, "onresize");
	}
	set onresize(value) {
		level0.set(this, "onresize", value);
	}
	get onscroll() {
		return level0.get(this, "onscroll");
	}
	set onscroll(value) {
		level0.set(this, "onscroll", value);
	}
	get onseeked() {
		return level0.get(this, "onseeked");
	}
	set onseeked(value) {
		level0.set(this, "onseeked", value);
	}
	get onseeking() {
		return level0.get(this, "onseeking");
	}
	set onseeking(value) {
		level0.set(this, "onseeking", value);
	}
	get onselect() {
		return level0.get(this, "onselect");
	}
	set onselect(value) {
		level0.set(this, "onselect", value);
	}
	get onshow() {
		return level0.get(this, "onshow");
	}
	set onshow(value) {
		level0.set(this, "onshow", value);
	}
	get onstalled() {
		return level0.get(this, "onstalled");
	}
	set onstalled(value) {
		level0.set(this, "onstalled", value);
	}
	get onsubmit() {
		return level0.get(this, "onsubmit");
	}
	set onsubmit(value) {
		level0.set(this, "onsubmit", value);
	}
	get onsuspend() {
		return level0.get(this, "onsuspend");
	}
	set onsuspend(value) {
		level0.set(this, "onsuspend", value);
	}
	get ontimeupdate() {
		return level0.get(this, "ontimeupdate");
	}
	set ontimeupdate(value) {
		level0.set(this, "ontimeupdate", value);
	}
	get ontoggle() {
		return level0.get(this, "ontoggle");
	}
	set ontoggle(value) {
		level0.set(this, "ontoggle", value);
	}
	get onvolumechange() {
		return level0.get(this, "onvolumechange");
	}
	set onvolumechange(value) {
		level0.set(this, "onvolumechange", value);
	}
	get onwaiting() {
		return level0.get(this, "onwaiting");
	}
	set onwaiting(value) {
		level0.set(this, "onwaiting", value);
	}
	get onauxclick() {
		return level0.get(this, "onauxclick");
	}
	set onauxclick(value) {
		level0.set(this, "onauxclick", value);
	}
	get ongotpointercapture() {
		return level0.get(this, "ongotpointercapture");
	}
	set ongotpointercapture(value) {
		level0.set(this, "ongotpointercapture", value);
	}
	get onlostpointercapture() {
		return level0.get(this, "onlostpointercapture");
	}
	set onlostpointercapture(value) {
		level0.set(this, "onlostpointercapture", value);
	}
	get onpointercancel() {
		return level0.get(this, "onpointercancel");
	}
	set onpointercancel(value) {
		level0.set(this, "onpointercancel", value);
	}
	get onpointerdown() {
		return level0.get(this, "onpointerdown");
	}
	set onpointerdown(value) {
		level0.set(this, "onpointerdown", value);
	}
	get onpointerenter() {
		return level0.get(this, "onpointerenter");
	}
	set onpointerenter(value) {
		level0.set(this, "onpointerenter", value);
	}
	get onpointerleave() {
		return level0.get(this, "onpointerleave");
	}
	set onpointerleave(value) {
		level0.set(this, "onpointerleave", value);
	}
	get onpointermove() {
		return level0.get(this, "onpointermove");
	}
	set onpointermove(value) {
		level0.set(this, "onpointermove", value);
	}
	get onpointerout() {
		return level0.get(this, "onpointerout");
	}
	set onpointerout(value) {
		level0.set(this, "onpointerout", value);
	}
	get onpointerover() {
		return level0.get(this, "onpointerover");
	}
	set onpointerover(value) {
		level0.set(this, "onpointerover", value);
	}
	get onpointerup() {
		return level0.get(this, "onpointerup");
	}
	set onpointerup(value) {
		level0.set(this, "onpointerup", value);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/template-element.js
var tagName$17 = "template";
/**
* @implements globalThis.HTMLTemplateElement
*/
var HTMLTemplateElement = class extends HTMLElement {
	constructor(ownerDocument) {
		super(ownerDocument, tagName$17);
		const content = this.ownerDocument.createDocumentFragment();
		(this[CONTENT] = content)[PRIVATE] = this;
	}
	get content() {
		if (this.hasChildNodes() && !this[CONTENT].hasChildNodes()) for (const node of this.childNodes) this[CONTENT].appendChild(node.cloneNode(true));
		return this[CONTENT];
	}
};
registerHTMLClass(tagName$17, HTMLTemplateElement);
//#endregion
//#region node_modules/linkedom/esm/html/html-element.js
/**
* @implements globalThis.HTMLHtmlElement
*/
var HTMLHtmlElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "html") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/text-element.js
var { toString } = HTMLElement.prototype;
var TextElement = class extends HTMLElement {
	get innerHTML() {
		return this.textContent;
	}
	set innerHTML(html) {
		this.textContent = html;
	}
	toString() {
		return toString.call(this.cloneNode()).replace("><", () => `>${this.textContent}<`);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/script-element.js
var tagName$16 = "script";
/**
* @implements globalThis.HTMLScriptElement
*/
var HTMLScriptElement = class extends TextElement {
	constructor(ownerDocument, localName = tagName$16) {
		super(ownerDocument, localName);
	}
	get type() {
		return stringAttribute.get(this, "type");
	}
	set type(value) {
		stringAttribute.set(this, "type", value);
	}
	get src() {
		return stringAttribute.get(this, "src");
	}
	set src(value) {
		stringAttribute.set(this, "src", value);
	}
	get defer() {
		return booleanAttribute.get(this, "defer");
	}
	set defer(value) {
		booleanAttribute.set(this, "defer", value);
	}
	get crossOrigin() {
		return stringAttribute.get(this, "crossorigin");
	}
	set crossOrigin(value) {
		stringAttribute.set(this, "crossorigin", value);
	}
	get nomodule() {
		return booleanAttribute.get(this, "nomodule");
	}
	set nomodule(value) {
		booleanAttribute.set(this, "nomodule", value);
	}
	get referrerPolicy() {
		return stringAttribute.get(this, "referrerpolicy");
	}
	set referrerPolicy(value) {
		stringAttribute.set(this, "referrerpolicy", value);
	}
	get nonce() {
		return stringAttribute.get(this, "nonce");
	}
	set nonce(value) {
		stringAttribute.set(this, "nonce", value);
	}
	get async() {
		return booleanAttribute.get(this, "async");
	}
	set async(value) {
		booleanAttribute.set(this, "async", value);
	}
	get text() {
		return this.textContent;
	}
	set text(content) {
		this.textContent = content;
	}
};
registerHTMLClass(tagName$16, HTMLScriptElement);
//#endregion
//#region node_modules/linkedom/esm/html/frame-element.js
/**
* @implements globalThis.HTMLFrameElement
*/
var HTMLFrameElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "frame") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/i-frame-element.js
var tagName$15 = "iframe";
/**
* @implements globalThis.HTMLIFrameElement
*/
var HTMLIFrameElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$15) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get src() {
		return stringAttribute.get(this, "src");
	}
	set src(value) {
		stringAttribute.set(this, "src", value);
	}
	get srcdoc() {
		return stringAttribute.get(this, "srcdoc");
	}
	set srcdoc(value) {
		stringAttribute.set(this, "srcdoc", value);
	}
	get name() {
		return stringAttribute.get(this, "name");
	}
	set name(value) {
		stringAttribute.set(this, "name", value);
	}
	get allow() {
		return stringAttribute.get(this, "allow");
	}
	set allow(value) {
		stringAttribute.set(this, "allow", value);
	}
	get allowFullscreen() {
		return booleanAttribute.get(this, "allowfullscreen");
	}
	set allowFullscreen(value) {
		booleanAttribute.set(this, "allowfullscreen", value);
	}
	get referrerPolicy() {
		return stringAttribute.get(this, "referrerpolicy");
	}
	set referrerPolicy(value) {
		stringAttribute.set(this, "referrerpolicy", value);
	}
	get loading() {
		return stringAttribute.get(this, "loading");
	}
	set loading(value) {
		stringAttribute.set(this, "loading", value);
	}
};
registerHTMLClass(tagName$15, HTMLIFrameElement);
//#endregion
//#region node_modules/linkedom/esm/html/object-element.js
/**
* @implements globalThis.HTMLObjectElement
*/
var HTMLObjectElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "object") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/head-element.js
/**
* @implements globalThis.HTMLHeadElement
*/
var HTMLHeadElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "head") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/body-element.js
/**
* @implements globalThis.HTMLBodyElement
*/
var HTMLBodyElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "body") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/style-element.js
var import_lib = require_lib();
var tagName$14 = "style";
/**
* @implements globalThis.HTMLStyleElement
*/
var HTMLStyleElement = class extends TextElement {
	constructor(ownerDocument, localName = tagName$14) {
		super(ownerDocument, localName);
		this[SHEET] = null;
	}
	get sheet() {
		const sheet = this[SHEET];
		if (sheet !== null) return sheet;
		return this[SHEET] = (0, import_lib.parse)(this.textContent);
	}
	get innerHTML() {
		return super.innerHTML || "";
	}
	set innerHTML(value) {
		super.textContent = value;
		this[SHEET] = null;
	}
	get innerText() {
		return super.innerText || "";
	}
	set innerText(value) {
		super.textContent = value;
		this[SHEET] = null;
	}
	get textContent() {
		return super.textContent || "";
	}
	set textContent(value) {
		super.textContent = value;
		this[SHEET] = null;
	}
};
registerHTMLClass(tagName$14, HTMLStyleElement);
//#endregion
//#region node_modules/linkedom/esm/html/time-element.js
/**
* @implements globalThis.HTMLTimeElement
*/
var HTMLTimeElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "time") {
		super(ownerDocument, localName);
	}
	/**
	* @type {string}
	*/
	get dateTime() {
		return stringAttribute.get(this, "datetime");
	}
	set dateTime(value) {
		stringAttribute.set(this, "datetime", value);
	}
};
registerHTMLClass("time", HTMLTimeElement);
//#endregion
//#region node_modules/linkedom/esm/html/field-set-element.js
/**
* @implements globalThis.HTMLFieldSetElement
*/
var HTMLFieldSetElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "fieldset") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/embed-element.js
/**
* @implements globalThis.HTMLEmbedElement
*/
var HTMLEmbedElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "embed") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/hr-element.js
/**
* @implements globalThis.HTMLHRElement
*/
var HTMLHRElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "hr") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/progress-element.js
/**
* @implements globalThis.HTMLProgressElement
*/
var HTMLProgressElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "progress") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/paragraph-element.js
/**
* @implements globalThis.HTMLParagraphElement
*/
var HTMLParagraphElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "p") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/table-element.js
/**
* @implements globalThis.HTMLTableElement
*/
var HTMLTableElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "table") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/frame-set-element.js
/**
* @implements globalThis.HTMLFrameSetElement
*/
var HTMLFrameSetElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "frameset") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/li-element.js
/**
* @implements globalThis.HTMLLIElement
*/
var HTMLLIElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "li") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/base-element.js
/**
* @implements globalThis.HTMLBaseElement
*/
var HTMLBaseElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "base") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/data-list-element.js
/**
* @implements globalThis.HTMLDataListElement
*/
var HTMLDataListElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "datalist") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/input-element.js
var tagName$13 = "input";
/**
* @implements globalThis.HTMLInputElement
*/
var HTMLInputElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$13) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get autofocus() {
		return booleanAttribute.get(this, "autofocus") || -1;
	}
	set autofocus(value) {
		booleanAttribute.set(this, "autofocus", value);
	}
	get disabled() {
		return booleanAttribute.get(this, "disabled");
	}
	set disabled(value) {
		booleanAttribute.set(this, "disabled", value);
	}
	get name() {
		return this.getAttribute("name");
	}
	set name(value) {
		this.setAttribute("name", value);
	}
	get placeholder() {
		return this.getAttribute("placeholder");
	}
	set placeholder(value) {
		this.setAttribute("placeholder", value);
	}
	get type() {
		return this.getAttribute("type");
	}
	set type(value) {
		this.setAttribute("type", value);
	}
	get value() {
		return stringAttribute.get(this, "value");
	}
	set value(value) {
		stringAttribute.set(this, "value", value);
	}
};
registerHTMLClass(tagName$13, HTMLInputElement);
//#endregion
//#region node_modules/linkedom/esm/html/param-element.js
/**
* @implements globalThis.HTMLParamElement
*/
var HTMLParamElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "param") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/media-element.js
/**
* @implements globalThis.HTMLMediaElement
*/
var HTMLMediaElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "media") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/audio-element.js
/**
* @implements globalThis.HTMLAudioElement
*/
var HTMLAudioElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "audio") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/heading-element.js
var tagName$12 = "h1";
/**
* @implements globalThis.HTMLHeadingElement
*/
var HTMLHeadingElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$12) {
		super(ownerDocument, localName);
	}
};
registerHTMLClass([
	tagName$12,
	"h2",
	"h3",
	"h4",
	"h5",
	"h6"
], HTMLHeadingElement);
//#endregion
//#region node_modules/linkedom/esm/html/directory-element.js
/**
* @implements globalThis.HTMLDirectoryElement
*/
var HTMLDirectoryElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "dir") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/quote-element.js
/**
* @implements globalThis.HTMLQuoteElement
*/
var HTMLQuoteElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "quote") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region __vite-optional-peer-dep:canvas:linkedom
var __vite_optional_peer_dep_canvas_linkedom_exports = /* @__PURE__ */ __exportAll({ default: () => __vite_optional_peer_dep_canvas_linkedom_default });
var __vite_optional_peer_dep_canvas_linkedom_default;
var init___vite_optional_peer_dep_canvas_linkedom = __esmMin((() => {
	__vite_optional_peer_dep_canvas_linkedom_default = {};
	throw new Error(`Could not resolve "canvas" imported by "linkedom". Is it installed?`);
}));
//#endregion
//#region node_modules/linkedom/commonjs/canvas-shim.cjs
var require_canvas_shim = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Canvas = class {
		constructor(width, height) {
			this.width = width;
			this.height = height;
		}
		getContext() {
			return null;
		}
		toDataURL() {
			return "";
		}
	};
	module.exports = { createCanvas: (width, height) => new Canvas(width, height) };
}));
var { createCanvas } = (/* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	/* c8 ignore start */
	try {
		module.exports = (init___vite_optional_peer_dep_canvas_linkedom(), __toCommonJS(__vite_optional_peer_dep_canvas_linkedom_exports));
	} catch (fallback) {
		module.exports = require_canvas_shim();
	}
})))(), 1)).default;
var tagName$11 = "canvas";
/**
* @implements globalThis.HTMLCanvasElement
*/
var HTMLCanvasElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$11) {
		super(ownerDocument, localName);
		this[IMAGE] = createCanvas(300, 150);
	}
	get width() {
		return this[IMAGE].width;
	}
	set width(value) {
		numericAttribute.set(this, "width", value);
		this[IMAGE].width = value;
	}
	get height() {
		return this[IMAGE].height;
	}
	set height(value) {
		numericAttribute.set(this, "height", value);
		this[IMAGE].height = value;
	}
	getContext(type) {
		return this[IMAGE].getContext(type);
	}
	toDataURL(...args) {
		return this[IMAGE].toDataURL(...args);
	}
};
registerHTMLClass(tagName$11, HTMLCanvasElement);
//#endregion
//#region node_modules/linkedom/esm/html/legend-element.js
/**
* @implements globalThis.HTMLLegendElement
*/
var HTMLLegendElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "legend") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/option-element.js
var tagName$10 = "option";
/**
* @implements globalThis.HTMLOptionElement
*/
var HTMLOptionElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$10) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get value() {
		return stringAttribute.get(this, "value");
	}
	set value(value) {
		stringAttribute.set(this, "value", value);
	}
	/* c8 ignore stop */
	get selected() {
		return booleanAttribute.get(this, "selected");
	}
	set selected(value) {
		const option = this.parentElement?.querySelector("option[selected]");
		if (option && option !== this) option.selected = false;
		booleanAttribute.set(this, "selected", value);
	}
};
registerHTMLClass(tagName$10, HTMLOptionElement);
//#endregion
//#region node_modules/linkedom/esm/html/span-element.js
/**
* @implements globalThis.HTMLSpanElement
*/
var HTMLSpanElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "span") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/meter-element.js
/**
* @implements globalThis.HTMLMeterElement
*/
var HTMLMeterElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "meter") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/video-element.js
/**
* @implements globalThis.HTMLVideoElement
*/
var HTMLVideoElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "video") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/table-cell-element.js
/**
* @implements globalThis.HTMLTableCellElement
*/
var HTMLTableCellElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "td") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/title-element.js
var tagName$9 = "title";
/**
* @implements globalThis.HTMLTitleElement
*/
var HTMLTitleElement = class extends TextElement {
	constructor(ownerDocument, localName = tagName$9) {
		super(ownerDocument, localName);
	}
};
registerHTMLClass(tagName$9, HTMLTitleElement);
//#endregion
//#region node_modules/linkedom/esm/html/output-element.js
/**
* @implements globalThis.HTMLOutputElement
*/
var HTMLOutputElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "output") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/table-row-element.js
/**
* @implements globalThis.HTMLTableRowElement
*/
var HTMLTableRowElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "tr") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/data-element.js
/**
* @implements globalThis.HTMLDataElement
*/
var HTMLDataElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "data") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/menu-element.js
/**
* @implements globalThis.HTMLMenuElement
*/
var HTMLMenuElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "menu") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/select-element.js
var tagName$8 = "select";
/**
* @implements globalThis.HTMLSelectElement
*/
var HTMLSelectElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$8) {
		super(ownerDocument, localName);
	}
	get options() {
		let children = new NodeList();
		let { firstElementChild } = this;
		while (firstElementChild) {
			if (firstElementChild.tagName === "OPTGROUP") children.push(...firstElementChild.children);
			else children.push(firstElementChild);
			firstElementChild = firstElementChild.nextElementSibling;
		}
		return children;
	}
	/* c8 ignore start */
	get disabled() {
		return booleanAttribute.get(this, "disabled");
	}
	set disabled(value) {
		booleanAttribute.set(this, "disabled", value);
	}
	get name() {
		return this.getAttribute("name");
	}
	set name(value) {
		this.setAttribute("name", value);
	}
	/* c8 ignore stop */
	get value() {
		return this.querySelector("option[selected]")?.value;
	}
};
registerHTMLClass(tagName$8, HTMLSelectElement);
//#endregion
//#region node_modules/linkedom/esm/html/br-element.js
/**
* @implements globalThis.HTMLBRElement
*/
var HTMLBRElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "br") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/button-element.js
var tagName$7 = "button";
/**
* @implements globalThis.HTMLButtonElement
*/
var HTMLButtonElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$7) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get disabled() {
		return booleanAttribute.get(this, "disabled");
	}
	set disabled(value) {
		booleanAttribute.set(this, "disabled", value);
	}
	get name() {
		return this.getAttribute("name");
	}
	set name(value) {
		this.setAttribute("name", value);
	}
	get type() {
		return this.getAttribute("type");
	}
	set type(value) {
		this.setAttribute("type", value);
	}
};
registerHTMLClass(tagName$7, HTMLButtonElement);
//#endregion
//#region node_modules/linkedom/esm/html/map-element.js
/**
* @implements globalThis.HTMLMapElement
*/
var HTMLMapElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "map") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/opt-group-element.js
/**
* @implements globalThis.HTMLOptGroupElement
*/
var HTMLOptGroupElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "optgroup") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/d-list-element.js
/**
* @implements globalThis.HTMLDListElement
*/
var HTMLDListElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "dl") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/text-area-element.js
var tagName$6 = "textarea";
/**
* @implements globalThis.HTMLTextAreaElement
*/
var HTMLTextAreaElement = class extends TextElement {
	constructor(ownerDocument, localName = tagName$6) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get disabled() {
		return booleanAttribute.get(this, "disabled");
	}
	set disabled(value) {
		booleanAttribute.set(this, "disabled", value);
	}
	get name() {
		return this.getAttribute("name");
	}
	set name(value) {
		this.setAttribute("name", value);
	}
	get placeholder() {
		return this.getAttribute("placeholder");
	}
	set placeholder(value) {
		this.setAttribute("placeholder", value);
	}
	get type() {
		return this.getAttribute("type");
	}
	set type(value) {
		this.setAttribute("type", value);
	}
	get value() {
		return this.textContent;
	}
	set value(content) {
		this.textContent = content;
	}
};
registerHTMLClass(tagName$6, HTMLTextAreaElement);
//#endregion
//#region node_modules/linkedom/esm/html/font-element.js
/**
* @implements globalThis.HTMLFontElement
*/
var HTMLFontElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "font") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/div-element.js
/**
* @implements globalThis.HTMLDivElement
*/
var HTMLDivElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "div") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/link-element.js
var tagName$5 = "link";
/**
* @implements globalThis.HTMLLinkElement
*/
var HTMLLinkElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$5) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */ get disabled() {
		return booleanAttribute.get(this, "disabled");
	}
	set disabled(value) {
		booleanAttribute.set(this, "disabled", value);
	}
	get href() {
		return stringAttribute.get(this, "href").trim();
	}
	set href(value) {
		stringAttribute.set(this, "href", value);
	}
	get hreflang() {
		return stringAttribute.get(this, "hreflang");
	}
	set hreflang(value) {
		stringAttribute.set(this, "hreflang", value);
	}
	get media() {
		return stringAttribute.get(this, "media");
	}
	set media(value) {
		stringAttribute.set(this, "media", value);
	}
	get rel() {
		return stringAttribute.get(this, "rel");
	}
	set rel(value) {
		stringAttribute.set(this, "rel", value);
	}
	get type() {
		return stringAttribute.get(this, "type");
	}
	set type(value) {
		stringAttribute.set(this, "type", value);
	}
};
registerHTMLClass(tagName$5, HTMLLinkElement);
//#endregion
//#region node_modules/linkedom/esm/html/slot-element.js
var tagName$4 = "slot";
/**
* @implements globalThis.HTMLSlotElement
*/
var HTMLSlotElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$4) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get name() {
		return this.getAttribute("name");
	}
	set name(value) {
		this.setAttribute("name", value);
	}
	assign() {}
	assignedNodes(options) {
		const isNamedSlot = !!this.name;
		const hostChildNodes = this.getRootNode().host?.childNodes ?? [];
		let slottables;
		if (isNamedSlot) slottables = [...hostChildNodes].filter((node) => node.slot === this.name);
		else slottables = [...hostChildNodes].filter((node) => !node.slot);
		if (options?.flatten) {
			const result = [];
			for (let slottable of slottables) if (slottable.localName === "slot") result.push(...slottable.assignedNodes({ flatten: true }));
			else result.push(slottable);
			slottables = result;
		}
		return slottables.length ? slottables : [...this.childNodes];
	}
	assignedElements(options) {
		const slottables = this.assignedNodes(options).filter((n) => n.nodeType === 1);
		return slottables.length ? slottables : [...this.children];
	}
};
registerHTMLClass(tagName$4, HTMLSlotElement);
//#endregion
//#region node_modules/linkedom/esm/html/form-element.js
/**
* @implements globalThis.HTMLFormElement
*/
var HTMLFormElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "form") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/image-element.js
var tagName$3 = "img";
/**
* @implements globalThis.HTMLImageElement
*/
var HTMLImageElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$3) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get alt() {
		return stringAttribute.get(this, "alt");
	}
	set alt(value) {
		stringAttribute.set(this, "alt", value);
	}
	get sizes() {
		return stringAttribute.get(this, "sizes");
	}
	set sizes(value) {
		stringAttribute.set(this, "sizes", value);
	}
	get src() {
		return stringAttribute.get(this, "src");
	}
	set src(value) {
		stringAttribute.set(this, "src", value);
	}
	get srcset() {
		return stringAttribute.get(this, "srcset");
	}
	set srcset(value) {
		stringAttribute.set(this, "srcset", value);
	}
	get title() {
		return stringAttribute.get(this, "title");
	}
	set title(value) {
		stringAttribute.set(this, "title", value);
	}
	get width() {
		return numericAttribute.get(this, "width");
	}
	set width(value) {
		numericAttribute.set(this, "width", value);
	}
	get height() {
		return numericAttribute.get(this, "height");
	}
	set height(value) {
		numericAttribute.set(this, "height", value);
	}
};
registerHTMLClass(tagName$3, HTMLImageElement);
//#endregion
//#region node_modules/linkedom/esm/html/pre-element.js
/**
* @implements globalThis.HTMLPreElement
*/
var HTMLPreElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "pre") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/u-list-element.js
/**
* @implements globalThis.HTMLUListElement
*/
var HTMLUListElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "ul") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/meta-element.js
var tagName$2 = "meta";
/**
* @implements globalThis.HTMLMetaElement
*/
var HTMLMetaElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$2) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get name() {
		return stringAttribute.get(this, "name");
	}
	set name(value) {
		stringAttribute.set(this, "name", value);
	}
	get httpEquiv() {
		return stringAttribute.get(this, "http-equiv");
	}
	set httpEquiv(value) {
		stringAttribute.set(this, "http-equiv", value);
	}
	get content() {
		return stringAttribute.get(this, "content");
	}
	set content(value) {
		stringAttribute.set(this, "content", value);
	}
	get charset() {
		return stringAttribute.get(this, "charset");
	}
	set charset(value) {
		stringAttribute.set(this, "charset", value);
	}
	get media() {
		return stringAttribute.get(this, "media");
	}
	set media(value) {
		stringAttribute.set(this, "media", value);
	}
};
registerHTMLClass(tagName$2, HTMLMetaElement);
//#endregion
//#region node_modules/linkedom/esm/html/picture-element.js
/**
* @implements globalThis.HTMLPictureElement
*/
var HTMLPictureElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "picture") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/area-element.js
/**
* @implements globalThis.HTMLAreaElement
*/
var HTMLAreaElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "area") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/o-list-element.js
/**
* @implements globalThis.HTMLOListElement
*/
var HTMLOListElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "ol") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/table-caption-element.js
/**
* @implements globalThis.HTMLTableCaptionElement
*/
var HTMLTableCaptionElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "caption") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/anchor-element.js
var tagName$1 = "a";
/**
* @implements globalThis.HTMLAnchorElement
*/
var HTMLAnchorElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName$1) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */ get href() {
		return encodeURI(decodeURI(stringAttribute.get(this, "href"))).trim();
	}
	set href(value) {
		stringAttribute.set(this, "href", decodeURI(value));
	}
	get download() {
		return encodeURI(decodeURI(stringAttribute.get(this, "download")));
	}
	set download(value) {
		stringAttribute.set(this, "download", decodeURI(value));
	}
	get target() {
		return stringAttribute.get(this, "target");
	}
	set target(value) {
		stringAttribute.set(this, "target", value);
	}
	get type() {
		return stringAttribute.get(this, "type");
	}
	set type(value) {
		stringAttribute.set(this, "type", value);
	}
	get rel() {
		return stringAttribute.get(this, "rel");
	}
	set rel(value) {
		stringAttribute.set(this, "rel", value);
	}
};
registerHTMLClass(tagName$1, HTMLAnchorElement);
//#endregion
//#region node_modules/linkedom/esm/html/label-element.js
/**
* @implements globalThis.HTMLLabelElement
*/
var HTMLLabelElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "label") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/unknown-element.js
/**
* @implements globalThis.HTMLUnknownElement
*/
var HTMLUnknownElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "unknown") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/mod-element.js
/**
* @implements globalThis.HTMLModElement
*/
var HTMLModElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "mod") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/details-element.js
/**
* @implements globalThis.HTMLDetailsElement
*/
var HTMLDetailsElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "details") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/source-element.js
var tagName = "source";
/**
* @implements globalThis.HTMLSourceElement
*/
var HTMLSourceElement = class extends HTMLElement {
	constructor(ownerDocument, localName = tagName) {
		super(ownerDocument, localName);
	}
	/* c8 ignore start */
	get src() {
		return stringAttribute.get(this, "src");
	}
	set src(value) {
		stringAttribute.set(this, "src", value);
	}
	get srcset() {
		return stringAttribute.get(this, "srcset");
	}
	set srcset(value) {
		stringAttribute.set(this, "srcset", value);
	}
	get sizes() {
		return stringAttribute.get(this, "sizes");
	}
	set sizes(value) {
		stringAttribute.set(this, "sizes", value);
	}
	get type() {
		return stringAttribute.get(this, "type");
	}
	set type(value) {
		stringAttribute.set(this, "type", value);
	}
};
registerHTMLClass(tagName, HTMLSourceElement);
//#endregion
//#region node_modules/linkedom/esm/html/track-element.js
/**
* @implements globalThis.HTMLTrackElement
*/
var HTMLTrackElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "track") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/html/marquee-element.js
/**
* @implements globalThis.HTMLMarqueeElement
*/
var HTMLMarqueeElement = class extends HTMLElement {
	constructor(ownerDocument, localName = "marquee") {
		super(ownerDocument, localName);
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/html-classes.js
var HTMLClasses = {
	HTMLElement,
	HTMLTemplateElement,
	HTMLHtmlElement,
	HTMLScriptElement,
	HTMLFrameElement,
	HTMLIFrameElement,
	HTMLObjectElement,
	HTMLHeadElement,
	HTMLBodyElement,
	HTMLStyleElement,
	HTMLTimeElement,
	HTMLFieldSetElement,
	HTMLEmbedElement,
	HTMLHRElement,
	HTMLProgressElement,
	HTMLParagraphElement,
	HTMLTableElement,
	HTMLFrameSetElement,
	HTMLLIElement,
	HTMLBaseElement,
	HTMLDataListElement,
	HTMLInputElement,
	HTMLParamElement,
	HTMLMediaElement,
	HTMLAudioElement,
	HTMLHeadingElement,
	HTMLDirectoryElement,
	HTMLQuoteElement,
	HTMLCanvasElement,
	HTMLLegendElement,
	HTMLOptionElement,
	HTMLSpanElement,
	HTMLMeterElement,
	HTMLVideoElement,
	HTMLTableCellElement,
	HTMLTitleElement,
	HTMLOutputElement,
	HTMLTableRowElement,
	HTMLDataElement,
	HTMLMenuElement,
	HTMLSelectElement,
	HTMLBRElement,
	HTMLButtonElement,
	HTMLMapElement,
	HTMLOptGroupElement,
	HTMLDListElement,
	HTMLTextAreaElement,
	HTMLFontElement,
	HTMLDivElement,
	HTMLLinkElement,
	HTMLSlotElement,
	HTMLFormElement,
	HTMLImageElement,
	HTMLPreElement,
	HTMLUListElement,
	HTMLMetaElement,
	HTMLPictureElement,
	HTMLAreaElement,
	HTMLOListElement,
	HTMLTableCaptionElement,
	HTMLAnchorElement,
	HTMLLabelElement,
	HTMLUnknownElement,
	HTMLModElement,
	HTMLDetailsElement,
	HTMLSourceElement,
	HTMLTrackElement,
	HTMLMarqueeElement
};
//#endregion
//#region node_modules/linkedom/esm/shared/mime.js
var voidElements = { test: () => true };
var Mime = {
	"text/html": {
		docType: "<!DOCTYPE html>",
		ignoreCase: true,
		voidElements: /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i
	},
	"image/svg+xml": {
		docType: "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
		ignoreCase: false,
		voidElements
	},
	"text/xml": {
		docType: "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
		ignoreCase: false,
		voidElements
	},
	"application/xml": {
		docType: "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
		ignoreCase: false,
		voidElements
	},
	"application/xhtml+xml": {
		docType: "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
		ignoreCase: false,
		voidElements
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/custom-event.js
/* c8 ignore start */
/**
* @implements globalThis.CustomEvent
*/
var CustomEvent = class extends GlobalEvent {
	constructor(type, eventInitDict = {}) {
		super(type, eventInitDict);
		this.detail = eventInitDict.detail;
	}
};
/* c8 ignore stop */
//#endregion
//#region node_modules/linkedom/esm/interface/input-event.js
/* c8 ignore start */
/**
* @implements globalThis.InputEvent
*/
var InputEvent = class extends GlobalEvent {
	constructor(type, inputEventInit = {}) {
		super(type, inputEventInit);
		this.inputType = inputEventInit.inputType;
		this.data = inputEventInit.data;
		this.dataTransfer = inputEventInit.dataTransfer;
		this.isComposing = inputEventInit.isComposing || false;
		this.ranges = inputEventInit.ranges;
	}
};
/* c8 ignore stop */
//#endregion
//#region node_modules/linkedom/esm/interface/image.js
var ImageClass = (ownerDocument) => class Image extends HTMLImageElement {
	constructor(width, height) {
		super(ownerDocument);
		switch (arguments.length) {
			case 1:
				this.height = width;
				this.width = width;
				break;
			case 2:
				this.height = height;
				this.width = width;
		}
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/range.js
var deleteContents = ({ [START]: start, [END]: end }, fragment = null) => {
	setAdjacent(start[PREV], end[NEXT]);
	do {
		const after = getEnd(start);
		const next = after === end ? after : after[NEXT];
		if (fragment) fragment.insertBefore(start, fragment[END]);
		else start.remove();
		start = next;
	} while (start !== end);
};
/**
* @implements globalThis.Range
*/
var Range = class Range {
	constructor() {
		this[START] = null;
		this[END] = null;
		this.commonAncestorContainer = null;
	}
	insertNode(newNode) {
		this[END].parentNode.insertBefore(newNode, this[START]);
	}
	selectNode(node) {
		this[START] = node;
		this[END] = getEnd(node);
	}
	selectNodeContents(node) {
		this.selectNode(node);
		this.commonAncestorContainer = node;
	}
	surroundContents(parentNode) {
		parentNode.replaceChildren(this.extractContents());
	}
	setStartBefore(node) {
		this[START] = node;
	}
	setStartAfter(node) {
		this[START] = node.nextSibling;
	}
	setEndBefore(node) {
		this[END] = getEnd(node.previousSibling);
	}
	setEndAfter(node) {
		this[END] = getEnd(node);
	}
	cloneContents() {
		let { [START]: start, [END]: end } = this;
		const fragment = start.ownerDocument.createDocumentFragment();
		while (start !== end) {
			fragment.insertBefore(start.cloneNode(true), fragment[END]);
			start = getEnd(start);
			if (start !== end) start = start[NEXT];
		}
		return fragment;
	}
	deleteContents() {
		deleteContents(this);
	}
	extractContents() {
		const fragment = this[START].ownerDocument.createDocumentFragment();
		deleteContents(this, fragment);
		return fragment;
	}
	createContextualFragment(html) {
		const { commonAncestorContainer: doc } = this;
		const isSVG = "ownerSVGElement" in doc;
		const document = isSVG ? doc.ownerDocument : doc;
		let content = htmlToFragment(document, html);
		if (isSVG) {
			const childNodes = [...content.childNodes];
			content = document.createDocumentFragment();
			Object.setPrototypeOf(content, SVGElement$1.prototype);
			content.ownerSVGElement = document;
			for (const child of childNodes) {
				Object.setPrototypeOf(child, SVGElement$1.prototype);
				child.ownerSVGElement = document;
				content.appendChild(child);
			}
		} else this.selectNode(content);
		return content;
	}
	cloneRange() {
		const range = new Range();
		range[START] = this[START];
		range[END] = this[END];
		return range;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/tree-walker.js
var isOK = ({ nodeType }, mask) => {
	switch (nodeType) {
		case 1: return mask & 1;
		case 3: return mask & 4;
		case 8: return mask & 128;
		case 4: return mask & 8;
	}
	return 0;
};
/**
* @implements globalThis.TreeWalker
*/
var TreeWalker = class {
	constructor(root, whatToShow = -1) {
		this.root = root;
		this.currentNode = root;
		this.whatToShow = whatToShow;
		let { [NEXT]: next, [END]: end } = root;
		if (root.nodeType === 9) {
			const { documentElement } = root;
			next = documentElement;
			end = documentElement[END];
		}
		const nodes = [];
		while (next && next !== end) {
			if (isOK(next, whatToShow)) nodes.push(next);
			next = next[NEXT];
		}
		this[PRIVATE] = {
			i: 0,
			nodes
		};
	}
	nextNode() {
		const $ = this[PRIVATE];
		this.currentNode = $.i < $.nodes.length ? $.nodes[$.i++] : null;
		return this.currentNode;
	}
};
//#endregion
//#region node_modules/linkedom/esm/interface/document.js
var query = (method, ownerDocument, selectors) => {
	let { [NEXT]: next, [END]: end } = ownerDocument;
	return method.call({
		ownerDocument,
		[NEXT]: next,
		[END]: end
	}, selectors);
};
var globalExports = assign({}, Facades, HTMLClasses, {
	CustomEvent,
	Event: GlobalEvent,
	EventTarget: DOMEventTarget,
	InputEvent,
	NamedNodeMap,
	NodeList
});
var window = /* @__PURE__ */ new WeakMap();
/**
* @implements globalThis.Document
*/
var Document$1 = class extends NonElementParentNode {
	constructor(type) {
		super(null, "#document", 9);
		this[CUSTOM_ELEMENTS] = {
			active: false,
			registry: null
		};
		this[MUTATION_OBSERVER] = {
			active: false,
			class: null
		};
		this[MIME] = Mime[type];
		/** @type {DocumentType} */
		this[DOCTYPE] = null;
		this[DOM_PARSER] = null;
		this[GLOBALS] = null;
		this[IMAGE] = null;
		this[UPGRADE] = null;
	}
	/**
	* @type {globalThis.Document['defaultView']}
	*/
	get defaultView() {
		if (!window.has(this)) window.set(this, new Proxy(globalThis, {
			set: (target, name, value) => {
				switch (name) {
					case "addEventListener":
					case "removeEventListener":
					case "dispatchEvent":
						this[EVENT_TARGET][name] = value;
						break;
					default: target[name] = value;
				}
				return true;
			},
			get: (globalThis, name) => {
				switch (name) {
					case "addEventListener":
					case "removeEventListener":
					case "dispatchEvent":
						if (!this[EVENT_TARGET]) {
							const et = this[EVENT_TARGET] = new DOMEventTarget();
							et.dispatchEvent = et.dispatchEvent.bind(et);
							et.addEventListener = et.addEventListener.bind(et);
							et.removeEventListener = et.removeEventListener.bind(et);
						}
						return this[EVENT_TARGET][name];
					case "document": return this;
					/* c8 ignore start */
					case "navigator": return { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36" };
					/* c8 ignore stop */
					case "window": return window.get(this);
					case "customElements":
						if (!this[CUSTOM_ELEMENTS].registry) this[CUSTOM_ELEMENTS] = new CustomElementRegistry(this);
						return this[CUSTOM_ELEMENTS];
					case "performance": return globalThis.performance;
					case "DOMParser": return this[DOM_PARSER];
					case "Image":
						if (!this[IMAGE]) this[IMAGE] = ImageClass(this);
						return this[IMAGE];
					case "MutationObserver":
						if (!this[MUTATION_OBSERVER].class) this[MUTATION_OBSERVER] = new MutationObserverClass(this);
						return this[MUTATION_OBSERVER].class;
				}
				return this[GLOBALS] && this[GLOBALS][name] || globalExports[name] || globalThis[name];
			}
		}));
		return window.get(this);
	}
	get doctype() {
		const docType = this[DOCTYPE];
		if (docType) return docType;
		const { firstChild } = this;
		if (firstChild && firstChild.nodeType === 10) return this[DOCTYPE] = firstChild;
		return null;
	}
	set doctype(value) {
		if (/^([a-z:]+)(\s+system|\s+public(\s+"([^"]+)")?)?(\s+"([^"]+)")?/i.test(value)) {
			const { $1: name, $4: publicId, $6: systemId } = RegExp;
			this[DOCTYPE] = new DocumentType$1(this, name, publicId, systemId);
			knownSiblings(this, this[DOCTYPE], this[NEXT]);
		}
	}
	get documentElement() {
		return this.firstElementChild;
	}
	get isConnected() {
		return true;
	}
	/**
	* @protected
	*/
	_getParent() {
		return this[EVENT_TARGET];
	}
	createAttribute(name) {
		return new Attr$1(this, name);
	}
	createCDATASection(data) {
		return new CDATASection$1(this, data);
	}
	createComment(textContent) {
		return new Comment$1(this, textContent);
	}
	createDocumentFragment() {
		return new DocumentFragment$1(this);
	}
	createDocumentType(name, publicId, systemId) {
		return new DocumentType$1(this, name, publicId, systemId);
	}
	createElement(localName) {
		return new Element$1(this, localName);
	}
	createRange() {
		const range = new Range();
		range.commonAncestorContainer = this;
		return range;
	}
	createTextNode(textContent) {
		return new Text$1(this, textContent);
	}
	createTreeWalker(root, whatToShow = -1) {
		return new TreeWalker(root, whatToShow);
	}
	createNodeIterator(root, whatToShow = -1) {
		return this.createTreeWalker(root, whatToShow);
	}
	createEvent(name) {
		const event = create$1(name === "Event" ? new GlobalEvent("") : new CustomEvent(""));
		event.initEvent = event.initCustomEvent = (type, canBubble = false, cancelable = false, detail) => {
			event.bubbles = !!canBubble;
			defineProperties(event, {
				type: { value: type },
				canBubble: { value: canBubble },
				cancelable: { value: cancelable },
				detail: { value: detail }
			});
		};
		return event;
	}
	cloneNode(deep = false) {
		const { constructor, [CUSTOM_ELEMENTS]: customElements, [DOCTYPE]: doctype } = this;
		const document = new constructor();
		document[CUSTOM_ELEMENTS] = customElements;
		if (deep) {
			const end = document[END];
			const { childNodes } = this;
			for (let { length } = childNodes, i = 0; i < length; i++) document.insertBefore(childNodes[i].cloneNode(true), end);
			if (doctype) document[DOCTYPE] = childNodes[0];
		}
		return document;
	}
	importNode(externalNode) {
		const deep = 1 < arguments.length && !!arguments[1];
		const node = externalNode.cloneNode(deep);
		const { [CUSTOM_ELEMENTS]: customElements } = this;
		const { active } = customElements;
		const upgrade = (element) => {
			const { ownerDocument, nodeType } = element;
			element.ownerDocument = this;
			if (active && ownerDocument !== this && nodeType === 1) customElements.upgrade(element);
		};
		upgrade(node);
		if (deep) switch (node.nodeType) {
			case 1:
			case 11: {
				let { [NEXT]: next, [END]: end } = node;
				while (next !== end) {
					if (next.nodeType === 1) upgrade(next);
					next = next[NEXT];
				}
				break;
			}
		}
		return node;
	}
	toString() {
		return this.childNodes.join("");
	}
	querySelector(selectors) {
		return query(super.querySelector, this, selectors);
	}
	querySelectorAll(selectors) {
		return query(super.querySelectorAll, this, selectors);
	}
	/* c8 ignore start */
	getElementsByTagNameNS(_, name) {
		return this.getElementsByTagName(name);
	}
	createAttributeNS(_, name) {
		return this.createAttribute(name);
	}
	createElementNS(nsp, localName, options) {
		return nsp === "http://www.w3.org/2000/svg" ? new SVGElement$1(this, localName, null) : this.createElement(localName, options);
	}
};
setPrototypeOf(globalExports.Document = function Document() {
	illegalConstructor();
}, Document$1).prototype = Document$1.prototype;
//#endregion
//#region node_modules/linkedom/esm/html/document.js
var createHTMLElement = (ownerDocument, builtin, localName, options) => {
	if (!builtin && htmlClasses.has(localName)) return new (htmlClasses.get(localName))(ownerDocument, localName);
	const { [CUSTOM_ELEMENTS]: { active, registry } } = ownerDocument;
	if (active) {
		const ce = builtin ? options.is : localName;
		if (registry.has(ce)) {
			const { Class } = registry.get(ce);
			const element = new Class(ownerDocument, localName);
			customElements.set(element, { connected: false });
			return element;
		}
	}
	return new HTMLElement(ownerDocument, localName);
};
/**
* @implements globalThis.HTMLDocument
*/
var HTMLDocument = class extends Document$1 {
	constructor() {
		super("text/html");
	}
	get all() {
		const nodeList = new NodeList();
		let { [NEXT]: next, [END]: end } = this;
		while (next !== end) {
			switch (next.nodeType) {
				case 1: nodeList.push(next);
			}
			next = next[NEXT];
		}
		return nodeList;
	}
	/**
	* @type HTMLHeadElement
	*/
	get head() {
		const { documentElement } = this;
		let { firstElementChild } = documentElement;
		if (!firstElementChild || firstElementChild.tagName !== "HEAD") {
			firstElementChild = this.createElement("head");
			documentElement.prepend(firstElementChild);
		}
		return firstElementChild;
	}
	/**
	* @type HTMLBodyElement
	*/
	get body() {
		const { head } = this;
		let { nextElementSibling } = head;
		if (!nextElementSibling || nextElementSibling.tagName !== "BODY") {
			nextElementSibling = this.createElement("body");
			head.after(nextElementSibling);
		}
		return nextElementSibling;
	}
	/**
	* @type HTMLTitleElement
	*/
	get title() {
		const { head } = this;
		return head.getElementsByTagName("title").at(0)?.textContent || "";
	}
	set title(textContent) {
		const { head } = this;
		let title = head.getElementsByTagName("title").at(0);
		if (title) title.textContent = textContent;
		else head.insertBefore(this.createElement("title"), head.firstChild).textContent = textContent;
	}
	createElement(localName, options) {
		const builtin = !!(options && options.is);
		const element = createHTMLElement(this, builtin, localName, options);
		if (builtin) element.setAttribute("is", options.is);
		return element;
	}
};
//#endregion
//#region node_modules/linkedom/esm/svg/document.js
/**
* @implements globalThis.Document
*/
var SVGDocument = class extends Document$1 {
	constructor() {
		super("image/svg+xml");
	}
	toString() {
		return this[MIME].docType + super.toString();
	}
};
//#endregion
//#region node_modules/linkedom/esm/xml/document.js
/**
* @implements globalThis.XMLDocument
*/
var XMLDocument = class extends Document$1 {
	constructor() {
		super("text/xml");
	}
	toString() {
		return this[MIME].docType + super.toString();
	}
};
//#endregion
//#region node_modules/linkedom/esm/dom/parser.js
/**
* @implements globalThis.DOMParser
*/
var DOMParser = class DOMParser {
	/** @typedef {{ "text/html": HTMLDocument, "image/svg+xml": SVGDocument, "text/xml": XMLDocument }} MimeToDoc */
	/**
	* @template {keyof MimeToDoc} MIME
	* @param {string} markupLanguage
	* @param {MIME} mimeType
	* @returns {MimeToDoc[MIME]}
	*/
	parseFromString(markupLanguage, mimeType, globals = null) {
		let isHTML = false, document;
		if (mimeType === "text/html") {
			isHTML = true;
			document = new HTMLDocument();
		} else if (mimeType === "image/svg+xml") document = new SVGDocument();
		else document = new XMLDocument();
		document[DOM_PARSER] = DOMParser;
		if (globals) document[GLOBALS] = globals;
		if (isHTML && markupLanguage === "...") markupLanguage = "<!doctype html><html><head></head><body></body></html>";
		return markupLanguage ? parseFromString(document, isHTML, markupLanguage) : document;
	}
};
//#endregion
//#region node_modules/linkedom/esm/shared/parse-json.js
var { parse } = JSON;
//#endregion
//#region node_modules/linkedom/esm/index.js
var parseHTML = (html, globals = null) => new DOMParser().parseFromString(html, "text/html", globals).defaultView;
function Document() {
	illegalConstructor();
}
setPrototypeOf(Document, Document$1).prototype = Document$1.prototype;
//#endregion
export { parseHTML as t };
