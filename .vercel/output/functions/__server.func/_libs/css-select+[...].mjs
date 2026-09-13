import { r as __exportAll } from "../_runtime.mjs";
import { n as trueFunc, t as falseFunc } from "./boolbase.mjs";
//#region node_modules/css-what/dist/types.js
/** Discriminants for selector token kinds. */
var SelectorType;
(function(SelectorType) {
	SelectorType["Attribute"] = "attribute";
	SelectorType["Pseudo"] = "pseudo";
	SelectorType["PseudoElement"] = "pseudo-element";
	SelectorType["Tag"] = "tag";
	SelectorType["Universal"] = "universal";
	SelectorType["Adjacent"] = "adjacent";
	SelectorType["Child"] = "child";
	SelectorType["Descendant"] = "descendant";
	SelectorType["Parent"] = "parent";
	SelectorType["Sibling"] = "sibling";
	SelectorType["ColumnCombinator"] = "column-combinator";
})(SelectorType || (SelectorType = {}));
/** Operators available for attribute selectors. */
var AttributeAction;
(function(AttributeAction) {
	AttributeAction["Any"] = "any";
	AttributeAction["Element"] = "element";
	AttributeAction["End"] = "end";
	AttributeAction["Equals"] = "equals";
	AttributeAction["Exists"] = "exists";
	AttributeAction["Hyphen"] = "hyphen";
	AttributeAction["Not"] = "not";
	AttributeAction["Start"] = "start";
})(AttributeAction || (AttributeAction = {}));
//#endregion
//#region node_modules/css-what/dist/parse.js
var reName = /^[^#\\]?(?:\\(?:[\da-f]{1,6}\s?|.)|[\w\u00B0-\uFFFF-])+/;
var reEscape = /\\([\da-f]{1,6}\s?|(\s)|.)/gi;
var CharCode;
(function(CharCode) {
	CharCode[CharCode["LeftParenthesis"] = 40] = "LeftParenthesis";
	CharCode[CharCode["RightParenthesis"] = 41] = "RightParenthesis";
	CharCode[CharCode["LeftSquareBracket"] = 91] = "LeftSquareBracket";
	CharCode[CharCode["RightSquareBracket"] = 93] = "RightSquareBracket";
	CharCode[CharCode["Comma"] = 44] = "Comma";
	CharCode[CharCode["Period"] = 46] = "Period";
	CharCode[CharCode["Colon"] = 58] = "Colon";
	CharCode[CharCode["SingleQuote"] = 39] = "SingleQuote";
	CharCode[CharCode["DoubleQuote"] = 34] = "DoubleQuote";
	CharCode[CharCode["Plus"] = 43] = "Plus";
	CharCode[CharCode["Tilde"] = 126] = "Tilde";
	CharCode[CharCode["QuestionMark"] = 63] = "QuestionMark";
	CharCode[CharCode["ExclamationMark"] = 33] = "ExclamationMark";
	CharCode[CharCode["Slash"] = 47] = "Slash";
	CharCode[CharCode["Equal"] = 61] = "Equal";
	CharCode[CharCode["Dollar"] = 36] = "Dollar";
	CharCode[CharCode["Pipe"] = 124] = "Pipe";
	CharCode[CharCode["Circumflex"] = 94] = "Circumflex";
	CharCode[CharCode["Asterisk"] = 42] = "Asterisk";
	CharCode[CharCode["GreaterThan"] = 62] = "GreaterThan";
	CharCode[CharCode["LessThan"] = 60] = "LessThan";
	CharCode[CharCode["Hash"] = 35] = "Hash";
	CharCode[CharCode["LowerI"] = 105] = "LowerI";
	CharCode[CharCode["LowerS"] = 115] = "LowerS";
	CharCode[CharCode["BackSlash"] = 92] = "BackSlash";
	CharCode[CharCode["Space"] = 32] = "Space";
	CharCode[CharCode["Tab"] = 9] = "Tab";
	CharCode[CharCode["NewLine"] = 10] = "NewLine";
	CharCode[CharCode["FormFeed"] = 12] = "FormFeed";
	CharCode[CharCode["CarriageReturn"] = 13] = "CarriageReturn";
})(CharCode || (CharCode = {}));
var actionTypes = /* @__PURE__ */ new Map([
	[CharCode.Tilde, AttributeAction.Element],
	[CharCode.Circumflex, AttributeAction.Start],
	[CharCode.Dollar, AttributeAction.End],
	[CharCode.Asterisk, AttributeAction.Any],
	[CharCode.ExclamationMark, AttributeAction.Not],
	[CharCode.Pipe, AttributeAction.Hyphen]
]);
var unpackPseudos = /* @__PURE__ */ new Set([
	"has",
	"not",
	"matches",
	"is",
	"where",
	"host",
	"host-context"
]);
/**
* Pseudo elements defined in CSS Level 1 and CSS Level 2 can be written with
* a single colon; eg. :before will turn into ::before.
* @see {@link https://www.w3.org/TR/2018/WD-selectors-4-20181121/#pseudo-element-syntax}
*/
var pseudosToPseudoElements = /* @__PURE__ */ new Set([
	"before",
	"after",
	"first-line",
	"first-letter"
]);
/**
* Checks whether a specific selector is a traversal.
* This is useful eg. in swapping the order of elements that
* are not traversals.
* @param selector Selector to check.
*/
function isTraversal$1(selector) {
	switch (selector.type) {
		case SelectorType.Adjacent:
		case SelectorType.Child:
		case SelectorType.Descendant:
		case SelectorType.Parent:
		case SelectorType.Sibling:
		case SelectorType.ColumnCombinator: return true;
		case SelectorType.Attribute:
		case SelectorType.Pseudo:
		case SelectorType.PseudoElement:
		case SelectorType.Tag:
		case SelectorType.Universal: return false;
	}
}
var stripQuotesFromPseudos = /* @__PURE__ */ new Set(["contains", "icontains"]);
function funescape(_, escaped, escapedWhitespace) {
	const high = Number.parseInt(escaped, 16) - 65536;
	return Number.isNaN(high) || escapedWhitespace ? escaped : high < 0 ? String.fromCharCode(high + 65536) : String.fromCharCode(high >> 10 | 55296, high & 1023 | 56320);
}
function unescapeCSS(cssString) {
	return cssString.replace(reEscape, funescape);
}
function isQuote(c) {
	return c === CharCode.SingleQuote || c === CharCode.DoubleQuote;
}
function isWhitespace(c) {
	return c === CharCode.Space || c === CharCode.Tab || c === CharCode.NewLine || c === CharCode.FormFeed || c === CharCode.CarriageReturn;
}
/**
* Parses `selector`.
* @param selector Selector to parse.
* @returns Returns a two-dimensional array.
* The first dimension represents selectors separated by commas (eg. `sub1, sub2`),
* the second contains the relevant tokens for that selector.
*/
function parse$1(selector) {
	const subselects = [];
	const endIndex = parseSelector(subselects, `${selector}`, 0);
	if (endIndex < selector.length) throw new Error(`Unmatched selector: ${selector.slice(endIndex)}`);
	return subselects;
}
function parseSelector(subselects, selector, selectorIndex) {
	let tokens = [];
	function getName(offset) {
		const match = selector.slice(selectorIndex + offset).match(reName);
		if (!match) throw new Error(`Expected name, found ${selector.slice(selectorIndex)}`);
		const [name] = match;
		selectorIndex += offset + name.length;
		return unescapeCSS(name);
	}
	function stripWhitespace(offset) {
		selectorIndex += offset;
		while (selectorIndex < selector.length && isWhitespace(selector.charCodeAt(selectorIndex))) selectorIndex++;
	}
	function readValueWithParenthesis() {
		selectorIndex += 1;
		const start = selectorIndex;
		for (let counter = 1; selectorIndex < selector.length; selectorIndex++) switch (selector.charCodeAt(selectorIndex)) {
			case CharCode.BackSlash:
				selectorIndex += 1;
				break;
			case CharCode.LeftParenthesis:
				counter += 1;
				break;
			case CharCode.RightParenthesis:
				counter -= 1;
				if (counter === 0) return unescapeCSS(selector.slice(start, selectorIndex++));
		}
		throw new Error("Parenthesis not matched");
	}
	function ensureNotTraversal() {
		if (tokens.length > 0 && isTraversal$1(tokens[tokens.length - 1])) throw new Error("Did not expect successive traversals.");
	}
	function addTraversal(type) {
		if (tokens.length > 0 && tokens[tokens.length - 1].type === SelectorType.Descendant) {
			tokens[tokens.length - 1].type = type;
			return;
		}
		ensureNotTraversal();
		tokens.push({ type });
	}
	function addSpecialAttribute(name, action) {
		tokens.push({
			type: SelectorType.Attribute,
			name,
			action,
			value: getName(1),
			namespace: null,
			ignoreCase: "quirks"
		});
	}
	/**
	* We have finished parsing the current part of the selector.
	*
	* Remove descendant tokens at the end if they exist,
	* and return the last index, so that parsing can be
	* picked up from here.
	*/
	function finalizeSubselector() {
		if (tokens.length > 0 && tokens[tokens.length - 1].type === SelectorType.Descendant) tokens.pop();
		if (tokens.length === 0) throw new Error("Empty sub-selector");
		subselects.push(tokens);
	}
	stripWhitespace(0);
	if (selector.length === selectorIndex) return selectorIndex;
	loop: while (selectorIndex < selector.length) {
		const firstChar = selector.charCodeAt(selectorIndex);
		switch (firstChar) {
			case CharCode.Space:
			case CharCode.Tab:
			case CharCode.NewLine:
			case CharCode.FormFeed:
			case CharCode.CarriageReturn:
				if (tokens.length === 0 || tokens[0].type !== SelectorType.Descendant) {
					ensureNotTraversal();
					tokens.push({ type: SelectorType.Descendant });
				}
				stripWhitespace(1);
				break;
			case CharCode.GreaterThan:
				addTraversal(SelectorType.Child);
				stripWhitespace(1);
				break;
			case CharCode.LessThan:
				addTraversal(SelectorType.Parent);
				stripWhitespace(1);
				break;
			case CharCode.Tilde:
				addTraversal(SelectorType.Sibling);
				stripWhitespace(1);
				break;
			case CharCode.Plus:
				addTraversal(SelectorType.Adjacent);
				stripWhitespace(1);
				break;
			case CharCode.Period:
				addSpecialAttribute("class", AttributeAction.Element);
				break;
			case CharCode.Hash:
				addSpecialAttribute("id", AttributeAction.Equals);
				break;
			case CharCode.LeftSquareBracket: {
				stripWhitespace(1);
				let name;
				let namespace = null;
				if (selector.charCodeAt(selectorIndex) === CharCode.Pipe) name = getName(1);
				else if (selector.startsWith("*|", selectorIndex)) {
					namespace = "*";
					name = getName(2);
				} else {
					name = getName(0);
					if (selector.charCodeAt(selectorIndex) === CharCode.Pipe && selector.charCodeAt(selectorIndex + 1) !== CharCode.Equal) {
						namespace = name;
						name = getName(1);
					}
				}
				stripWhitespace(0);
				let action = AttributeAction.Exists;
				const possibleAction = actionTypes.get(selector.charCodeAt(selectorIndex));
				if (possibleAction) {
					action = possibleAction;
					if (selector.charCodeAt(selectorIndex + 1) !== CharCode.Equal) throw new Error("Expected `=`");
					stripWhitespace(2);
				} else if (selector.charCodeAt(selectorIndex) === CharCode.Equal) {
					action = AttributeAction.Equals;
					stripWhitespace(1);
				}
				let value = "";
				let ignoreCase = null;
				if (action !== "exists") {
					if (isQuote(selector.charCodeAt(selectorIndex))) {
						const quote = selector.charCodeAt(selectorIndex);
						selectorIndex += 1;
						const sectionStart = selectorIndex;
						while (selectorIndex < selector.length && selector.charCodeAt(selectorIndex) !== quote) selectorIndex += selector.charCodeAt(selectorIndex) === CharCode.BackSlash ? 2 : 1;
						if (selector.charCodeAt(selectorIndex) !== quote) throw new Error("Attribute value didn't end");
						value = unescapeCSS(selector.slice(sectionStart, selectorIndex));
						selectorIndex += 1;
					} else {
						const valueStart = selectorIndex;
						while (selectorIndex < selector.length && !isWhitespace(selector.charCodeAt(selectorIndex)) && selector.charCodeAt(selectorIndex) !== CharCode.RightSquareBracket) selectorIndex += selector.charCodeAt(selectorIndex) === CharCode.BackSlash ? 2 : 1;
						value = unescapeCSS(selector.slice(valueStart, selectorIndex));
					}
					stripWhitespace(0);
					switch (selector.charCodeAt(selectorIndex) | 32) {
						case CharCode.LowerI:
							ignoreCase = true;
							stripWhitespace(1);
							break;
						case CharCode.LowerS:
							ignoreCase = false;
							stripWhitespace(1);
					}
				}
				if (selector.charCodeAt(selectorIndex) !== CharCode.RightSquareBracket) throw new Error("Attribute selector didn't terminate");
				selectorIndex += 1;
				const attributeSelector = {
					type: SelectorType.Attribute,
					name,
					action,
					value,
					namespace,
					ignoreCase
				};
				tokens.push(attributeSelector);
				break;
			}
			case CharCode.Colon: {
				if (selector.charCodeAt(selectorIndex + 1) === CharCode.Colon) {
					tokens.push({
						type: SelectorType.PseudoElement,
						name: getName(2).toLowerCase(),
						data: selector.charCodeAt(selectorIndex) === CharCode.LeftParenthesis ? readValueWithParenthesis() : null
					});
					break;
				}
				const name = getName(1).toLowerCase();
				if (pseudosToPseudoElements.has(name)) {
					tokens.push({
						type: SelectorType.PseudoElement,
						name,
						data: null
					});
					break;
				}
				let data = null;
				if (selector.charCodeAt(selectorIndex) === CharCode.LeftParenthesis) {
					if (unpackPseudos.has(name)) {
						if (isQuote(selector.charCodeAt(selectorIndex + 1))) throw new Error(`Pseudo-selector ${name} cannot be quoted`);
						data = [];
						selectorIndex = parseSelector(data, selector, selectorIndex + 1);
						if (selector.charCodeAt(selectorIndex) !== CharCode.RightParenthesis) throw new Error(`Missing closing parenthesis in :${name} (${selector})`);
						selectorIndex += 1;
					} else {
						data = readValueWithParenthesis();
						if (stripQuotesFromPseudos.has(name)) {
							const quot = data.charCodeAt(0);
							if (quot === data.charCodeAt(data.length - 1) && isQuote(quot)) data = data.slice(1, -1);
						}
						data = unescapeCSS(data);
					}
				}
				tokens.push({
					type: SelectorType.Pseudo,
					name,
					data
				});
				break;
			}
			case CharCode.Comma:
				finalizeSubselector();
				tokens = [];
				stripWhitespace(1);
				break;
			default: {
				if (selector.startsWith("/*", selectorIndex)) {
					const endIndex = selector.indexOf("*/", selectorIndex + 2);
					if (endIndex === -1) throw new Error("Comment was not terminated");
					selectorIndex = endIndex + 2;
					if (tokens.length === 0) stripWhitespace(0);
					break;
				}
				let namespace = null;
				let name;
				if (firstChar === CharCode.Asterisk) {
					selectorIndex += 1;
					name = "*";
				} else if (firstChar === CharCode.Pipe) {
					name = "";
					if (selector.charCodeAt(selectorIndex + 1) === CharCode.Pipe) {
						addTraversal(SelectorType.ColumnCombinator);
						stripWhitespace(2);
						break;
					}
				} else if (reName.test(selector.slice(selectorIndex))) name = getName(0);
				else break loop;
				if (selector.charCodeAt(selectorIndex) === CharCode.Pipe && selector.charCodeAt(selectorIndex + 1) !== CharCode.Pipe) {
					namespace = name;
					if (selector.charCodeAt(selectorIndex + 1) === CharCode.Asterisk) {
						name = "*";
						selectorIndex += 2;
					} else name = getName(1);
				}
				tokens.push(name === "*" ? {
					type: SelectorType.Universal,
					namespace
				} : {
					type: SelectorType.Tag,
					name,
					namespace
				});
			}
		}
	}
	finalizeSubselector();
	return selectorIndex;
}
//#endregion
//#region node_modules/domelementtype/dist/index.js
/** Types of elements found in htmlparser2's DOM */
var ElementType;
(function(ElementType) {
	/** Type for the root element of a document */
	ElementType["Root"] = "root";
	/** Type for Text */
	ElementType["Text"] = "text";
	/** Type for <? ... ?> */
	ElementType["Directive"] = "directive";
	/** Type for <!-- ... --> */
	ElementType["Comment"] = "comment";
	/** Type for <script> tags */
	ElementType["Script"] = "script";
	/** Type for <style> tags */
	ElementType["Style"] = "style";
	/** Type for Any tag */
	ElementType["Tag"] = "tag";
	/** Type for <![CDATA[ ... ]]> */
	ElementType["CDATA"] = "cdata";
	/** Type for <!doctype ...> */
	ElementType["Doctype"] = "doctype";
})(ElementType || (ElementType = {}));
/**
* Tests whether an element is a tag or not.
* @param element Element to test
* @param element.type Node type discriminator to check.
*/
function isTag$1(element) {
	return element.type === ElementType.Tag || element.type === ElementType.Script || element.type === ElementType.Style;
}
/** Type for the root element of a document */
var Root = ElementType.Root;
/** Type for Text */
var Text = ElementType.Text;
/** Type for <? ... ?> */
var Directive = ElementType.Directive;
/** Type for <!-- ... --> */
var Comment = ElementType.Comment;
/** Type for <script> tags */
var Script = ElementType.Script;
/** Type for <style> tags */
var Style = ElementType.Style;
/** Type for Any tag */
var Tag = ElementType.Tag;
/** Type for <![CDATA[ ... ]]> */
var CDATA = ElementType.CDATA;
ElementType.Doctype;
//#endregion
//#region node_modules/domhandler/dist/node.js
/**
* Checks if `node` is an element node.
* @param node Node to check.
* @returns `true` if the node is an element node.
*/
function isTag(node) {
	return isTag$1(node);
}
/**
* Checks if `node` is a CDATA node.
* @param node Node to check.
* @returns `true` if the node is a CDATA node.
*/
function isCDATA(node) {
	return node.type === ElementType.CDATA;
}
/**
* Checks if `node` is a text node.
* @param node Node to check.
* @returns `true` if the node is a text node.
*/
function isText(node) {
	return node.type === ElementType.Text;
}
/**
* Checks if `node` is a comment node.
* @param node Node to check.
* @returns `true` if the node is a comment node.
*/
function isComment(node) {
	return node.type === ElementType.Comment;
}
/**
* Checks if `node` has children.
* @param node Node to check.
* @returns `true` if the node has children.
*/
function hasChildren(node) {
	return Object.hasOwn(node, "children");
}
//#endregion
//#region node_modules/domutils/dist/querying.js
/**
* Search a node and its children for nodes passing a test function. If `node` is not an array, it will be wrapped in one.
*
* @category Querying
* @param test Function to test nodes on.
* @param node Node to search. Will be included in the result set if it matches.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes passing `test`.
*/
function filter(test, node, recurse = true, limit = Number.POSITIVE_INFINITY) {
	return find(test, Array.isArray(node) ? node : [node], recurse, limit);
}
/**
* Search an array of nodes and their children for nodes passing a test function.
*
* @category Querying
* @param test Function to test nodes on.
* @param nodes Array of nodes to search.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes passing `test`.
*/
function find(test, nodes, recurse, limit) {
	const result = [];
	/** Stack of the arrays we are looking at. */
	const nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
	/** Stack of the indices within the arrays. */
	const indexStack = [0];
	for (;;) {
		if (indexStack[0] >= nodeStack[0].length) {
			if (indexStack.length === 1) return result;
			nodeStack.shift();
			indexStack.shift();
			continue;
		}
		const element = nodeStack[0][indexStack[0]++];
		if (test(element)) {
			result.push(element);
			if (--limit <= 0) return result;
		}
		if (recurse && hasChildren(element) && element.children.length > 0) {
			indexStack.unshift(0);
			nodeStack.unshift(element.children);
		}
	}
}
/**
* Finds one element in a tree that passes a test.
*
* @category Querying
* @param test Function to test nodes on.
* @param nodes Node or array of nodes to search.
* @param recurse Also consider child nodes.
* @returns The first node that passes `test`.
*/
function findOne$1(test, nodes, recurse = true) {
	const searchedNodes = Array.isArray(nodes) ? nodes : [nodes];
	for (const node of searchedNodes) {
		if (isTag(node) && test(node)) return node;
		if (recurse && hasChildren(node) && node.children.length > 0) {
			const found = findOne$1(test, node.children, true);
			if (found) return found;
		}
	}
	return null;
}
/**
* Checks if a tree of nodes contains at least one node passing a test.
*
* @category Querying
* @param test Function to test nodes on.
* @param nodes Array of nodes to search.
* @returns Whether a tree of nodes contains at least one node passing the test.
*/
function existsOne(test, nodes) {
	return (Array.isArray(nodes) ? nodes : [nodes]).some((node) => isTag(node) && test(node) || hasChildren(node) && existsOne(test, node.children));
}
/**
* Search an array of nodes and their children for elements passing a test function.
*
* Same as `find`, but limited to elements and with less options, leading to reduced complexity.
*
* @category Querying
* @param test Function to test nodes on.
* @param nodes Array of nodes to search.
* @returns All nodes passing `test`.
*/
function findAll$1(test, nodes) {
	const result = [];
	const nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
	const indexStack = [0];
	for (;;) {
		if (indexStack[0] >= nodeStack[0].length) {
			if (nodeStack.length === 1) return result;
			nodeStack.shift();
			indexStack.shift();
			continue;
		}
		const element = nodeStack[0][indexStack[0]++];
		if (isTag(element) && test(element)) result.push(element);
		if (hasChildren(element) && element.children.length > 0) {
			indexStack.unshift(0);
			nodeStack.unshift(element.children);
		}
	}
}
//#endregion
//#region node_modules/domutils/dist/legacy.js
/**
* A map of functions to check nodes against.
*/
var Checks = {
	tag_name(name) {
		if (typeof name === "function") return (element) => isTag(element) && name(element.name);
		if (name === "*") return isTag;
		return (element) => isTag(element) && element.name === name;
	},
	tag_type(type) {
		if (typeof type === "function") return (element) => type(element.type);
		return (element) => element.type === type;
	},
	tag_contains(data) {
		if (typeof data === "function") return (element) => isText(element) && data(element.data);
		return (element) => isText(element) && element.data === data;
	}
};
/**
* Returns a function to check whether a node has an attribute with a particular
* value.
*
* @param attrib Attribute to check.
* @param value Attribute value to look for.
* @returns A function to check whether the a node has an attribute with a
*   particular value.
*/
function getAttribCheck(attrib, value) {
	if (typeof value === "function") return (element) => isTag(element) && value(element.attribs[attrib]);
	return (element) => isTag(element) && element.attribs[attrib] === value;
}
/**
* Returns a function that returns `true` if either of the input functions
* returns `true` for a node.
*
* @param a First function to combine.
* @param b Second function to combine.
* @returns A function taking a node and returning `true` if either of the input
*   functions returns `true` for the node.
*/
function combineFuncs(a, b) {
	return (element) => a(element) || b(element);
}
/**
* Returns a function that executes all checks in `options` and returns `true`
* if any of them match a node.
*
* @param options An object describing nodes to look for.
* @returns A function that executes all checks in `options` and returns `true`
*   if any of them match a node.
*/
function compileTest(options) {
	const funcs = Object.keys(options).map((key) => {
		const value = options[key];
		return Object.hasOwn(Checks, key) ? Checks[key](value) : getAttribCheck(key, value);
	});
	return funcs.length === 0 ? null : funcs.reduce(combineFuncs);
}
/**
* Checks whether a node matches the description in `options`.
*
* @category Legacy Query Functions
* @param options An object describing nodes to look for.
* @param node The element to test.
* @returns Whether the element matches the description in `options`.
*/
function testElement(options, node) {
	const test = compileTest(options);
	return test ? test(node) : true;
}
/**
* Returns all nodes that match `options`.
*
* @category Legacy Query Functions
* @param options An object describing nodes to look for.
* @param nodes Nodes to search through.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes that match `options`.
*/
function getElements(options, nodes, recurse, limit = Number.POSITIVE_INFINITY) {
	const test = compileTest(options);
	return test ? filter(test, nodes, recurse, limit) : [];
}
/**
* Returns the node with the supplied ID.
*
* @category Legacy Query Functions
* @param id The unique ID attribute value to look for.
* @param nodes Nodes to search through.
* @param recurse Also consider child nodes.
* @returns The node with the supplied ID.
*/
function getElementById(id, nodes, recurse = true) {
	if (!Array.isArray(nodes)) nodes = [nodes];
	return findOne$1(getAttribCheck("id", id), nodes, recurse);
}
/**
* Returns all nodes with the supplied `tagName`.
*
* @category Legacy Query Functions
* @param tagName Tag name to search for.
* @param nodes Nodes to search through.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes with the supplied `tagName`.
*/
function getElementsByTagName(tagName, nodes, recurse = true, limit = Number.POSITIVE_INFINITY) {
	return filter(Checks["tag_name"](tagName), nodes, recurse, limit);
}
/**
* Returns all nodes with the supplied `className`.
*
* @category Legacy Query Functions
* @param className Class name to search for.
* @param nodes Nodes to search through.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes with the supplied `className`.
*/
function getElementsByClassName(className, nodes, recurse = true, limit = Number.POSITIVE_INFINITY) {
	return filter(getAttribCheck("class", className), nodes, recurse, limit);
}
/**
* Returns all nodes with the supplied `type`.
*
* @category Legacy Query Functions
* @param type Element type to look for.
* @param nodes Nodes to search through.
* @param recurse Also consider child nodes.
* @param limit Maximum number of nodes to return.
* @returns All nodes with the supplied `type`.
*/
function getElementsByTagType(type, nodes, recurse = true, limit = Number.POSITIVE_INFINITY) {
	return filter(Checks["tag_type"](type), nodes, recurse, limit);
}
//#endregion
//#region node_modules/entities/dist/escape.js
/**
* Get the named reference for an XML special character or U+00A0.
* @param char Code unit matched by one of the escape regexes.
*/
function getEscape(char) {
	return char === 34 ? "&quot;" : char === 38 ? "&amp;" : char === 39 ? "&apos;" : char === 60 ? "&lt;" : char === 62 ? "&gt;" : "&nbsp;";
}
/**
* Matches exactly the characters `encodeXML` escapes: the five XML special
* characters plus every non-ASCII code unit (lone surrogates included — no
* `u` flag). Kept in sync with `XML_BITSET_VALUE`.
*
* Shared with `encodeNonAsciiHTML` in `encode.ts`. Because the regex is
* stateful (`g` flag), every call site must set `lastIndex` before use.
*/
var xmlEncodeRegex = /["&'<>\u0080-\uFFFF]/g;
/**
* Whether `code` (a UTF-16 code unit) is escaped by {@link encodeXML}: a
* non-ASCII unit, or one of the five XML specials flagged in
* `XML_BITSET_VALUE` (which is only meaningful for code units 32-63).
* @param code Code unit to test.
*/
function isXmlEscapable(code) {
	return code >= 128 || code >= 32 && code < 64 && (1342177476 >>> code & 1) === 1;
}
/**
* Encodes all non-ASCII characters, as well as characters not valid in XML
* documents using XML entities.
*
* If a character has no equivalent entity, a numeric hexadecimal reference
* (eg. `&#xfc;`) will be used.
* @param input Input string to encode.
*/
function encodeXML(input) {
	const { length } = input;
	let out;
	let last = 0;
	let index = 0;
	while (index < length) {
		const char = input.charCodeAt(index);
		if (!isXmlEscapable(char)) {
			const bound = Math.min(index + 32, length);
			let next = index + 1;
			while (next < bound && !isXmlEscapable(input.charCodeAt(next))) next++;
			if (next < bound) {
				index = next;
				continue;
			}
			if (next >= length) break;
			xmlEncodeRegex.lastIndex = next;
			if (!xmlEncodeRegex.test(input)) break;
			index = xmlEncodeRegex.lastIndex - 1;
			continue;
		}
		if (out === void 0) out = input.substring(0, index);
		else if (last !== index) out += input.substring(last, index);
		if (char < 64) {
			out += getEscape(char);
			last = index += 1;
			continue;
		}
		const cp = input.codePointAt(index);
		out += `&#x${cp.toString(16)};`;
		if (cp !== char) index++;
		last = index += 1;
	}
	if (out === void 0) return input;
	if (last < length) out += input.substr(last);
	return out;
}
/**
* Escape `data` using `re`, mapping each matched character to its entity.
* Every match is one UTF-16 code unit, so its index is `lastIndex - 1`.
* @param re Global regex matching exactly the characters to escape
*   (`"`, `&`, `'`, `<`, `>`, `\u00A0` at most).
* @param data String to escape.
*/
function escapeWithRegex(re, data) {
	re.lastIndex = 0;
	if (!re.test(data)) return data;
	let out = "";
	let last = 0;
	do {
		const index = re.lastIndex - 1;
		if (last !== index) out += data.substring(last, index);
		const char = data.charCodeAt(index);
		out += getEscape(char);
		last = index + 1;
	} while (re.test(data));
	return out + data.substring(last);
}
var attributeEscapeRegex = /["&\u{A0}]/gu;
/**
* Encodes all characters that have to be escaped in HTML attributes,
* following {@link https://html.spec.whatwg.org/multipage/parsing.html#escapingString}.
* @param data String to escape.
*/
function escapeAttribute(data) {
	return escapeWithRegex(attributeEscapeRegex, data);
}
var textEscapeRegex = /[&<>\u{A0}]/gu;
/**
* Encodes all characters that have to be escaped in HTML text,
* following {@link https://html.spec.whatwg.org/multipage/parsing.html#escapingString}.
* @param data String to escape.
*/
function escapeText(data) {
	return escapeWithRegex(textEscapeRegex, data);
}
//#endregion
//#region node_modules/dom-serializer/dist/foreign-names.js
/**
* Mixed-case SVG and MathML element names recognized in foreign content.
* @see https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign
*/
var elementNames = new Map("altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath".split(" ").map((name) => [name.toLowerCase(), name]));
/**
* Mixed-case SVG and MathML attribute names recognized in foreign content.
* @see https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign
*/
var attributeNames = new Map("definitionURL attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits diffuseConstant edgeMode filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan".split(" ").map((name) => [name.toLowerCase(), name]));
//#endregion
//#region node_modules/dom-serializer/dist/index.js
/** Elements whose text content is never entity-encoded. */
var unencodedElements = new Set("style script xmp iframe noembed noframes plaintext noscript".split(" "));
/** HTML void elements — they cannot have children. */
var voidElements = new Set("area base basefont br col command embed frame hr img input isindex keygen link meta param source track wbr".split(" "));
/** Elements that switch the parser into foreign (XML-like) mode. */
var foreignElements = /* @__PURE__ */ new Set(["svg", "math"]);
/**
* Foreign-mode integration points: children of these elements are parsed
* as HTML again, not as foreign content.
*/
var foreignModeIntegrationPoints = new Set("mi mo mn ms mtext annotation-xml foreignObject desc title".split(" "));
/**
* Renders a DOM node or an array of DOM nodes to a string.
*
* Can be thought of as the equivalent of the `outerHTML` of the passed
* node(s).
* @param node Node to be rendered.
* @param options Changes serialization behavior
*/
function render(node, options = {}) {
	const nodes = "length" in node ? node : [node];
	const xmlMode = options.xmlMode ?? false;
	let output = "";
	for (let index = 0; index < nodes.length; index++) output += renderNode(nodes[index], options, xmlMode);
	return output;
}
/**
* Render an array of child nodes (skips the single-node wrapping in `render`).
* @param children The child nodes to render.
* @param options The serialization options.
* @param xmlMode The XML mode to use.
*/
function renderChildren(children, options, xmlMode) {
	let output = "";
	for (let index = 0; index < children.length; index++) output += renderNode(children[index], options, xmlMode);
	return output;
}
function renderNode(node, options, xmlMode) {
	switch (node.type) {
		case Root: return renderChildren(node.children, options, xmlMode);
		case Directive: return `<${node.data}>`;
		case Comment: return `<!--${node.data}-->`;
		case CDATA: return `<![CDATA[${node.children[0].data}]]>`;
		case Script:
		case Style:
		case Tag: return renderTag(node, options, xmlMode);
		case Text: {
			const element = node;
			const data = element.data || "";
			if ((options.encodeEntities ?? options.decodeEntities) !== false && !(!xmlMode && element.parent && unencodedElements.has(element.parent.name))) return xmlMode || options.encodeEntities !== "utf8" ? encodeXML(data) : escapeText(data);
			return data;
		}
	}
}
function renderTag(element, options, xmlMode) {
	if (xmlMode === "foreign") {
		element.name = elementNames.get(element.name) ?? element.name;
		if (element.parent && foreignModeIntegrationPoints.has(element.parent.name)) xmlMode = false;
	}
	if (!xmlMode && foreignElements.has(element.name)) xmlMode = "foreign";
	const { name, children } = element;
	const isVoid = !xmlMode && voidElements.has(name);
	let tag = `<${name}${formatAttributes(element.attribs, options, xmlMode)}`;
	if (children.length === 0 && (xmlMode ? options.selfClosingTags !== false : options.selfClosingTags && isVoid)) tag += xmlMode ? "/>" : " />";
	else {
		tag += ">";
		if (children.length > 0) tag += renderChildren(children, options, xmlMode);
		if (!isVoid) tag += `</${name}>`;
	}
	return tag;
}
function replaceQuotes(value) {
	return value.replaceAll("\"", "&quot;");
}
/**
* Serialize an element's attribute map to a string.
*
* Returns a string with a leading space before each attribute, or an
* empty string if there are no attributes. This convention lets the
* caller unconditionally concatenate the result onto the tag name.
* @param attributes
* @param options
* @param xmlMode
*/
function formatAttributes(attributes, options, xmlMode) {
	if (!attributes) return "";
	const encode = (options.encodeEntities ?? options.decodeEntities) === false ? replaceQuotes : xmlMode || options.encodeEntities !== "utf8" ? encodeXML : escapeAttribute;
	const isForeign = xmlMode === "foreign";
	const showEmpty = !!(options.emptyAttrs ?? xmlMode);
	let result = "";
	for (const key in attributes) {
		if (!Object.hasOwn(attributes, key)) continue;
		const value = attributes[key];
		const k = isForeign ? attributeNames.get(key) ?? key : key;
		result += !showEmpty && (value == null || value === "") ? ` ${k}` : ` ${k}="${encode(value == null ? "" : String(value))}"`;
	}
	return result;
}
//#endregion
//#region node_modules/domutils/dist/stringify.js
/**
* @category Stringify
* @deprecated Use the `dom-serializer` module directly.
* @param node Node to get the outer HTML of.
* @param options Options for serialization.
* @returns `node`'s outer HTML.
*/
function getOuterHTML(node, options) {
	return render(node, options);
}
/**
* @category Stringify
* @deprecated Use the `dom-serializer` module directly.
* @param node Node to get the inner HTML of.
* @param options Options for serialization.
* @returns `node`'s inner HTML.
*/
function getInnerHTML(node, options) {
	return hasChildren(node) ? node.children.map((node) => getOuterHTML(node, options)).join("") : "";
}
/**
* Get a node's inner text. Same as `textContent`, but inserts newlines for `<br>` tags. Ignores comments.
*
* @category Stringify
* @deprecated Use `textContent` instead.
* @param node Node to get the inner text of.
* @returns `node`'s inner text.
*/
function getText(node) {
	if (Array.isArray(node)) return node.map(getText).join("");
	if (isTag(node)) return node.name === "br" ? "\n" : getText(node.children);
	if (isCDATA(node)) return getText(node.children);
	if (isText(node)) return node.data;
	return "";
}
/**
* Get a node's text content. Ignores comments.
*
* @category Stringify
* @param node Node to get the text content of.
* @returns `node`'s text content.
* @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent}
*/
function textContent(node) {
	if (Array.isArray(node)) return node.map(textContent).join("");
	if (hasChildren(node) && !isComment(node)) return textContent(node.children);
	if (isText(node)) return node.data;
	return "";
}
/**
* Get a node's inner text, ignoring `<script>` and `<style>` tags. Ignores comments.
*
* @category Stringify
* @param node Node to get the inner text of.
* @returns `node`'s inner text.
* @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/innerText}
*/
function innerText(node) {
	if (Array.isArray(node)) return node.map(innerText).join("");
	if (hasChildren(node) && (node.type === ElementType.Tag || isCDATA(node))) return innerText(node.children);
	if (isText(node)) return node.data;
	return "";
}
//#endregion
//#region node_modules/domutils/dist/feeds.js
/**
* Get the feed object from the root of a DOM tree.
*
* @category Feeds
* @param document The DOM to extract the feed from.
* @returns The feed.
*/
function getFeed(document) {
	const feedRoot = getOneElement(isValidFeed, document);
	return feedRoot ? feedRoot.name === "feed" ? getAtomFeed(feedRoot) : getRssFeed(feedRoot) : null;
}
/**
* Parse an Atom feed.
*
* @param feedRoot The root of the feed.
* @returns The parsed feed.
*/
function getAtomFeed(feedRoot) {
	const childs = feedRoot.children;
	const feed = {
		type: "atom",
		items: getElementsByTagName("entry", childs).map((item) => {
			const { children } = item;
			const entry = { media: getMediaElements(children) };
			addConditionally(entry, "id", "id", children);
			addConditionally(entry, "title", "title", children);
			const href = getOneElement("link", children)?.attribs["href"];
			if (href) entry.link = href;
			const description = fetch("summary", children) || fetch("content", children);
			if (description) entry.description = description;
			const pubDate = fetch("updated", children);
			if (pubDate) entry.pubDate = new Date(pubDate);
			return entry;
		})
	};
	addConditionally(feed, "id", "id", childs);
	addConditionally(feed, "title", "title", childs);
	const href = getOneElement("link", childs)?.attribs["href"];
	if (href) feed.link = href;
	addConditionally(feed, "description", "subtitle", childs);
	const updated = fetch("updated", childs);
	if (updated) feed.updated = new Date(updated);
	addConditionally(feed, "author", "email", childs, true);
	return feed;
}
/**
* Parse a RSS feed.
*
* @param feedRoot The root of the feed.
* @returns The parsed feed.
*/
function getRssFeed(feedRoot) {
	const childs = getOneElement("channel", feedRoot.children)?.children ?? [];
	const feed = {
		type: feedRoot.name.substr(0, 3),
		id: "",
		items: getElementsByTagName("item", feedRoot.children).map((item) => {
			const { children } = item;
			const entry = { media: getMediaElements(children) };
			addConditionally(entry, "id", "guid", children);
			addConditionally(entry, "title", "title", children);
			addConditionally(entry, "link", "link", children);
			addConditionally(entry, "description", "description", children);
			const pubDate = fetch("pubDate", children) || fetch("dc:date", children);
			if (pubDate) entry.pubDate = new Date(pubDate);
			return entry;
		})
	};
	addConditionally(feed, "title", "title", childs);
	addConditionally(feed, "link", "link", childs);
	addConditionally(feed, "description", "description", childs);
	const updated = fetch("lastBuildDate", childs);
	if (updated) feed.updated = new Date(updated);
	addConditionally(feed, "author", "managingEditor", childs, true);
	return feed;
}
var MEDIA_KEYS_STRING = [
	"url",
	"type",
	"lang"
];
var MEDIA_KEYS_INT = [
	"fileSize",
	"bitrate",
	"framerate",
	"samplingrate",
	"channels",
	"duration",
	"height",
	"width"
];
/**
* Get all media elements of a feed item.
*
* @param where Nodes to search in.
* @returns Media elements.
*/
function getMediaElements(where) {
	return getElementsByTagName("media:content", where).map((element) => {
		const { attribs } = element;
		const media = {
			medium: attribs["medium"],
			isDefault: !!attribs["isDefault"]
		};
		for (const attrib of MEDIA_KEYS_STRING) if (attribs[attrib]) media[attrib] = attribs[attrib];
		for (const attrib of MEDIA_KEYS_INT) if (attribs[attrib]) media[attrib] = Number.parseInt(attribs[attrib], 10);
		if (attribs["expression"]) media.expression = attribs["expression"];
		return media;
	});
}
/**
* Get one element by tag name.
*
* @param tagName Tag name to look for
* @param node Node to search in
* @returns The element or null
*/
function getOneElement(tagName, node) {
	return getElementsByTagName(tagName, node, true, 1)[0];
}
/**
* Get the text content of an element with a certain tag name.
*
* @param tagName Tag name to look for.
* @param where Node to search in.
* @param recurse Whether to recurse into child nodes.
* @returns The text content of the element.
*/
function fetch(tagName, where, recurse = false) {
	return textContent(getElementsByTagName(tagName, where, recurse, 1)).trim();
}
/**
* Adds a property to an object if it has a value.
*
* @param object Object to be extended.
* @param property Property name.
* @param tagName Tag name that contains the conditionally added property.
* @param where Element to search for the property.
* @param recurse Whether to recurse into child nodes.
*/
function addConditionally(object, property, tagName, where, recurse = false) {
	const value = fetch(tagName, where, recurse);
	if (value) object[property] = value;
}
/**
* Checks if an element is a feed root node.
*
* @param value The name of the element to check.
* @returns Whether an element is a feed root node.
*/
function isValidFeed(value) {
	return value === "rss" || value === "feed" || value === "rdf:RDF";
}
//#endregion
//#region node_modules/domutils/dist/helpers.js
/**
* Given an array of nodes, remove any member that is contained by another
* member.
*
* @category Helpers
* @param nodes Nodes to filter.
* @returns Remaining nodes that aren't contained by other nodes.
*/
function removeSubsets(nodes) {
	let index = nodes.length;
	while (--index >= 0) {
		const node = nodes[index];
		if (index > 0 && nodes.lastIndexOf(node, index - 1) >= 0) {
			nodes.splice(index, 1);
			continue;
		}
		for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (nodes.includes(ancestor)) {
			nodes.splice(index, 1);
			break;
		}
	}
	return nodes;
}
/**
* @category Helpers
* @see {@link http://dom.spec.whatwg.org/#dom-node-comparedocumentposition}
*/
var DocumentPosition;
(function(DocumentPosition) {
	DocumentPosition[DocumentPosition["DISCONNECTED"] = 1] = "DISCONNECTED";
	DocumentPosition[DocumentPosition["PRECEDING"] = 2] = "PRECEDING";
	DocumentPosition[DocumentPosition["FOLLOWING"] = 4] = "FOLLOWING";
	DocumentPosition[DocumentPosition["CONTAINS"] = 8] = "CONTAINS";
	DocumentPosition[DocumentPosition["CONTAINED_BY"] = 16] = "CONTAINED_BY";
})(DocumentPosition || (DocumentPosition = {}));
/**
* Compare the position of one node against another node in any other document,
* returning a bitmask with the values from {@link DocumentPosition}.
*
* Document order:
* > There is an ordering, document order, defined on all the nodes in the
* > document corresponding to the order in which the first character of the
* > XML representation of each node occurs in the XML representation of the
* > document after expansion of general entities. Thus, the document element
* > node will be the first node. Element nodes occur before their children.
* > Thus, document order orders element nodes in order of the occurrence of
* > their start-tag in the XML (after expansion of entities). The attribute
* > nodes of an element occur after the element and before its children. The
* > relative order of attribute nodes is implementation-dependent.
*
* Source:
* http://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-document-order
*
* @category Helpers
* @param nodeA The first node to use in the comparison
* @param nodeB The second node to use in the comparison
* @returns A bitmask describing the input nodes' relative position.
*
* See http://dom.spec.whatwg.org/#dom-node-comparedocumentposition for
* a description of these values.
*/
function compareDocumentPosition(nodeA, nodeB) {
	const aParents = [];
	const bParents = [];
	if (nodeA === nodeB) return 0;
	let current = hasChildren(nodeA) ? nodeA : nodeA.parent;
	while (current) {
		aParents.unshift(current);
		current = current.parent;
	}
	current = hasChildren(nodeB) ? nodeB : nodeB.parent;
	while (current) {
		bParents.unshift(current);
		current = current.parent;
	}
	const maxIndex = Math.min(aParents.length, bParents.length);
	let index = 0;
	while (index < maxIndex && aParents[index] === bParents[index]) index++;
	if (index === 0) return DocumentPosition.DISCONNECTED;
	const sharedParent = aParents[index - 1];
	const siblings = sharedParent.children;
	const aSibling = aParents[index];
	const bSibling = bParents[index];
	if (siblings.indexOf(aSibling) > siblings.indexOf(bSibling)) {
		if (sharedParent === nodeB) return DocumentPosition.FOLLOWING | DocumentPosition.CONTAINED_BY;
		return DocumentPosition.FOLLOWING;
	}
	if (sharedParent === nodeA) return DocumentPosition.PRECEDING | DocumentPosition.CONTAINS;
	return DocumentPosition.PRECEDING;
}
/**
* Sort an array of nodes based on their relative position in the document,
* removing any duplicate nodes. If the array contains nodes that do not belong
* to the same document, sort order is unspecified.
*
* @category Helpers
* @param nodes Array of DOM nodes.
* @returns Collection of unique nodes, sorted in document order.
*/
function uniqueSort(nodes) {
	nodes = nodes.filter((node, index, array) => !array.includes(node, index + 1));
	nodes.sort((a, b) => {
		const relative = compareDocumentPosition(a, b);
		if (relative & DocumentPosition.PRECEDING) return -1;
		if (relative & DocumentPosition.FOLLOWING) return 1;
		return 0;
	});
	return nodes;
}
//#endregion
//#region node_modules/domutils/dist/manipulation.js
/**
* Remove an element from the dom
*
* @category Manipulation
* @param element The element to be removed.
*/
function removeElement(element) {
	if (element.prev) element.prev.next = element.next;
	if (element.next) element.next.prev = element.prev;
	if (element.parent) {
		const childs = element.parent.children;
		const childsIndex = childs.lastIndexOf(element);
		if (childsIndex !== -1) childs.splice(childsIndex, 1);
	}
	element.next = null;
	element.prev = null;
	element.parent = null;
}
/**
* Replace an element in the dom
*
* @category Manipulation
* @param element The element to be replaced.
* @param replacement The element to be added
*/
function replaceElement(element, replacement) {
	replacement.prev = element.prev;
	if (replacement.prev) replacement.prev.next = replacement;
	replacement.next = element.next;
	if (replacement.next) replacement.next.prev = replacement;
	replacement.parent = element.parent;
	if (replacement.parent) {
		const { children } = replacement.parent;
		const elementIndex = children.lastIndexOf(element);
		if (elementIndex === -1) return;
		children[elementIndex] = replacement;
		element.parent = null;
	}
}
/**
* Append a child to an element.
*
* @category Manipulation
* @param parent The element to append to.
* @param child The element to be added as a child.
*/
function appendChild(parent, child) {
	removeElement(child);
	child.next = null;
	child.parent = parent;
	if (parent.children.push(child) > 1) {
		const sibling = parent.children[parent.children.length - 2];
		sibling.next = child;
		child.prev = sibling;
	} else child.prev = null;
}
/**
* Append an element after another.
*
* @category Manipulation
* @param element The element to append after.
* @param next The element be added.
*/
function append(element, next) {
	removeElement(next);
	const { parent } = element;
	const currentNext = element.next;
	next.next = currentNext;
	next.prev = element;
	element.next = next;
	next.parent = parent;
	if (currentNext) {
		currentNext.prev = next;
		if (parent) {
			const childs = parent.children;
			childs.splice(childs.lastIndexOf(currentNext), 0, next);
		}
	} else if (parent) parent.children.push(next);
}
/**
* Prepend a child to an element.
*
* @category Manipulation
* @param parent The element to prepend before.
* @param child The element to be added as a child.
*/
function prependChild(parent, child) {
	removeElement(child);
	child.parent = parent;
	child.prev = null;
	if (parent.children.unshift(child) === 1) child.next = null;
	else {
		const sibling = parent.children[1];
		sibling.prev = child;
		child.next = sibling;
	}
}
/**
* Prepend an element before another.
*
* @category Manipulation
* @param element The element to prepend before.
* @param previous The element to be added.
*/
function prepend(element, previous) {
	removeElement(previous);
	const { parent } = element;
	if (parent) {
		const childs = parent.children;
		childs.splice(childs.indexOf(element), 0, previous);
	}
	if (element.prev) element.prev.next = previous;
	previous.parent = parent;
	previous.prev = element.prev;
	previous.next = element;
	element.prev = previous;
}
//#endregion
//#region node_modules/domutils/dist/traversal.js
/**
* Get a node's children.
*
* @category Traversal
* @param element Node to get the children of.
* @returns `element`'s children, or an empty array.
*/
function getChildren(element) {
	return hasChildren(element) ? element.children : [];
}
function getParent(element) {
	return element.parent || null;
}
/**
* Gets an elements siblings, including the element itself.
*
* Attempts to get the children through the element's parent first. If we don't
* have a parent (the element is a root node), we walk the element's `prev` &
* `next` to get all remaining nodes.
*
* @category Traversal
* @param element Element to get the siblings of.
* @returns `element`'s siblings, including `element`.
*/
function getSiblings(element) {
	const parent = getParent(element);
	if (parent != null) return getChildren(parent);
	const siblings = [element];
	let { prev, next } = element;
	while (prev != null) {
		siblings.unshift(prev);
		({prev} = prev);
	}
	while (next != null) {
		siblings.push(next);
		({next} = next);
	}
	return siblings;
}
/**
* Gets an attribute from an element.
*
* @category Traversal
* @param element Element to check.
* @param name Attribute name to retrieve.
* @returns The element's attribute value, or `undefined`.
*/
function getAttributeValue(element, name) {
	const { attribs } = element;
	return attribs?.[name];
}
/**
* Checks whether an element has an attribute.
*
* @category Traversal
* @param element Element to check.
* @param name Attribute name to look for.
* @returns Returns whether `element` has the attribute `name`.
*/
function hasAttrib(element, name) {
	const { attribs } = element;
	return attribs != null && Object.hasOwn(attribs, name) && attribs[name] != null;
}
/**
* Get the tag name of an element.
*
* @category Traversal
* @param element The element to get the name for.
* @returns The tag name of `element`.
*/
function getName(element) {
	return element.name;
}
/**
* Returns the next element sibling of a node.
*
* @category Traversal
* @param element The element to get the next sibling of.
* @returns `element`'s next sibling that is a tag, or `null` if there is no next
* sibling.
*/
function nextElementSibling(element) {
	let { next } = element;
	while (next !== null && !isTag(next)) ({next} = next);
	return next;
}
/**
* Returns the previous element sibling of a node.
*
* @category Traversal
* @param element The element to get the previous sibling of.
* @returns `element`'s previous sibling that is a tag, or `null` if there is no
* previous sibling.
*/
function prevElementSibling(element) {
	let { prev } = element;
	while (prev !== null && !isTag(prev)) ({prev} = prev);
	return prev;
}
//#endregion
//#region node_modules/domutils/dist/index.js
var dist_exports = /* @__PURE__ */ __exportAll({
	DocumentPosition: () => DocumentPosition,
	append: () => append,
	appendChild: () => appendChild,
	compareDocumentPosition: () => compareDocumentPosition,
	existsOne: () => existsOne,
	filter: () => filter,
	find: () => find,
	findAll: () => findAll$1,
	findOne: () => findOne$1,
	getAttributeValue: () => getAttributeValue,
	getChildren: () => getChildren,
	getElementById: () => getElementById,
	getElements: () => getElements,
	getElementsByClassName: () => getElementsByClassName,
	getElementsByTagName: () => getElementsByTagName,
	getElementsByTagType: () => getElementsByTagType,
	getFeed: () => getFeed,
	getInnerHTML: () => getInnerHTML,
	getName: () => getName,
	getOuterHTML: () => getOuterHTML,
	getParent: () => getParent,
	getSiblings: () => getSiblings,
	getText: () => getText,
	hasAttrib: () => hasAttrib,
	innerText: () => innerText,
	nextElementSibling: () => nextElementSibling,
	prepend: () => prepend,
	prependChild: () => prependChild,
	prevElementSibling: () => prevElementSibling,
	removeElement: () => removeElement,
	removeSubsets: () => removeSubsets,
	replaceElement: () => replaceElement,
	testElement: () => testElement,
	textContent: () => textContent,
	uniqueSort: () => uniqueSort
});
//#endregion
//#region node_modules/css-select/dist/attributes.js
/**
* All reserved characters in a regex, used for escaping.
*
* Taken from XRegExp, (c) 2007-2020 Steven Levithan under the MIT license
* https://github.com/slevithan/xregexp/blob/95eeebeb8fac8754d54eafe2b4743661ac1cf028/src/xregexp.js#L794
*/
var reChars = /[-[\]{}()*+?.,\\^$|#\s]/g;
var whitespaceRe = /\s/;
function escapeRegex(value) {
	return value.replace(reChars, "\\$&");
}
/**
* Attributes that are case-insensitive in HTML.
* @see https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
*/
var caseInsensitiveAttributes = /* @__PURE__ */ new Set([
	"accept",
	"accept-charset",
	"align",
	"alink",
	"axis",
	"bgcolor",
	"charset",
	"checked",
	"clear",
	"codetype",
	"color",
	"compact",
	"declare",
	"defer",
	"dir",
	"direction",
	"disabled",
	"enctype",
	"face",
	"frame",
	"hreflang",
	"http-equiv",
	"lang",
	"language",
	"link",
	"media",
	"method",
	"multiple",
	"nohref",
	"noresize",
	"noshade",
	"nowrap",
	"readonly",
	"rel",
	"rev",
	"rules",
	"scope",
	"scrolling",
	"selected",
	"shape",
	"target",
	"text",
	"type",
	"valign",
	"valuetype",
	"vlink"
]);
function shouldIgnoreCase(selector, options) {
	return typeof selector.ignoreCase === "boolean" ? selector.ignoreCase : selector.ignoreCase === "quirks" ? !!options.quirksMode : !options.xmlMode && caseInsensitiveAttributes.has(selector.name);
}
/**
* Attribute selectors
*/
var attributeRules = {
	equals(next, data, options) {
		const { adapter } = options;
		const { name } = data;
		let { value } = data;
		if (shouldIgnoreCase(data, options)) {
			value = value.toLowerCase();
			return (element) => {
				const attribute = adapter.getAttributeValue(element, name);
				return attribute != null && attribute.length === value.length && attribute.toLowerCase() === value && next(element);
			};
		}
		return (element) => adapter.getAttributeValue(element, name) === value && next(element);
	},
	hyphen(next, data, options) {
		const { adapter } = options;
		const { name } = data;
		let { value } = data;
		const { length } = value;
		if (shouldIgnoreCase(data, options)) {
			value = value.toLowerCase();
			return function hyphenIC(element) {
				const attribute = adapter.getAttributeValue(element, name);
				return attribute != null && (attribute.length === length || attribute.charAt(length) === "-") && attribute.substr(0, length).toLowerCase() === value && next(element);
			};
		}
		return function hyphen(element) {
			const attribute = adapter.getAttributeValue(element, name);
			return attribute != null && (attribute.length === length || attribute.charAt(length) === "-") && attribute.substr(0, length) === value && next(element);
		};
	},
	element(next, data, options) {
		const { adapter } = options;
		const { name, value } = data;
		if (whitespaceRe.test(value)) return falseFunc;
		const regex = new RegExp(`(?:^|\\s)${escapeRegex(value)}(?:$|\\s)`, shouldIgnoreCase(data, options) ? "i" : "");
		return function element(node) {
			const attribute = adapter.getAttributeValue(node, name);
			return attribute != null && attribute.length >= value.length && regex.test(attribute) && next(node);
		};
	},
	exists(next, { name }, { adapter }) {
		return (element) => adapter.hasAttrib(element, name) && next(element);
	},
	start(next, data, options) {
		const { adapter } = options;
		const { name } = data;
		let { value } = data;
		const { length } = value;
		if (length === 0) return falseFunc;
		if (shouldIgnoreCase(data, options)) {
			value = value.toLowerCase();
			return (element) => {
				const attribute = adapter.getAttributeValue(element, name);
				return attribute != null && attribute.length >= length && attribute.substr(0, length).toLowerCase() === value && next(element);
			};
		}
		return (element) => !!adapter.getAttributeValue(element, name)?.startsWith(value) && next(element);
	},
	end(next, data, options) {
		const { adapter } = options;
		const { name } = data;
		let { value } = data;
		const length = -value.length;
		if (length === 0) return falseFunc;
		if (shouldIgnoreCase(data, options)) {
			value = value.toLowerCase();
			return (element) => adapter.getAttributeValue(element, name)?.substr(length).toLowerCase() === value && next(element);
		}
		return (element) => !!adapter.getAttributeValue(element, name)?.endsWith(value) && next(element);
	},
	any(next, data, options) {
		const { adapter } = options;
		const { name, value } = data;
		if (value === "") return falseFunc;
		if (shouldIgnoreCase(data, options)) {
			const regex = new RegExp(escapeRegex(value), "i");
			return function anyIC(element) {
				const attribute = adapter.getAttributeValue(element, name);
				return attribute != null && attribute.length >= value.length && regex.test(attribute) && next(element);
			};
		}
		return (element) => !!adapter.getAttributeValue(element, name)?.includes(value) && next(element);
	},
	not(next, data, options) {
		const { adapter } = options;
		const { name } = data;
		let { value } = data;
		if (value === "") return (element) => !!adapter.getAttributeValue(element, name) && next(element);
		if (shouldIgnoreCase(data, options)) {
			value = value.toLowerCase();
			return (element) => {
				const attribute = adapter.getAttributeValue(element, name);
				return (attribute == null || attribute.length !== value.length || attribute.toLowerCase() !== value) && next(element);
			};
		}
		return (element) => adapter.getAttributeValue(element, name) !== value && next(element);
	}
};
/**
* Find the first element matching the query. If not in XML mode, the query will ignore
* the contents of `<template>` elements.
* @param query - Function that returns true if the element matches the query.
* @param nodes - Nodes to query. If a node is an element, its children will be queried.
* @param options - Options for querying the document.
* @returns The first matching element, or null if there was no match.
*/
function findOne(query, nodes, options) {
	const { adapter, xmlMode = false } = options;
	/** Stack of the arrays we are looking at. */
	const nodeStack = [nodes];
	/** Stack of the indices within the arrays. */
	const indexStack = [0];
	for (;;) {
		if (indexStack[0] >= nodeStack[0].length) {
			if (nodeStack.length === 1) return null;
			nodeStack.shift();
			indexStack.shift();
			continue;
		}
		const element = nodeStack[0][indexStack[0]++];
		if (!adapter.isTag(element)) continue;
		if (query(element)) return element;
		if (xmlMode || adapter.getName(element) !== "template") {
			const children = adapter.getChildren(element);
			if (children.length > 0) {
				nodeStack.unshift(children);
				indexStack.unshift(0);
			}
		}
	}
}
/**
* Get all element siblings after the provided node.
* @param element Element candidate being tested.
* @param adapter Adapter implementation used for DOM operations.
*/
function getNextSiblings(element, adapter) {
	const siblings = adapter.getSiblings(element);
	if (siblings.length <= 1) return [];
	const elementIndex = siblings.indexOf(element);
	if (elementIndex === -1 || elementIndex === siblings.length - 1) return [];
	return siblings.slice(elementIndex + 1).filter(adapter.isTag);
}
/**
* Get the parent element of a node.
* @param node Node to inspect.
* @param adapter Adapter implementation used for DOM operations.
*/
function getElementParent(node, adapter) {
	const parent = adapter.getParent(node);
	return parent != null && adapter.isTag(parent) ? parent : null;
}
//#endregion
//#region node_modules/css-select/dist/pseudo-selectors/aliases.js
/**
* Only text controls can be made read-only, since for other controls (such
* as checkboxes and buttons) there is no useful distinction between being
* read-only and being disabled.
* @see {@link https://html.spec.whatwg.org/multipage/input.html#attr-input-readonly}
*/
var textControl = "input:is([type=text i],[type=search i],[type=url i],[type=tel i],[type=email i],[type=password i],[type=date i],[type=month i],[type=week i],[type=time i],[type=datetime-local i],[type=number i])";
/**
* Aliases are pseudos that are expressed as selectors.
*/
var aliases = {
	"any-link": ":is(a, area, link)[href]",
	link: ":any-link:not(:visited)",
	disabled: `:is(
        :is(button, input, select, textarea, optgroup, option)[disabled],
        optgroup[disabled] > option,
        fieldset[disabled]:not(fieldset[disabled] legend:first-of-type *)
    )`,
	enabled: ":is(button, input, select, textarea, optgroup, option, fieldset):not(:disabled)",
	checked: ":is(:is(input[type=radio], input[type=checkbox])[checked], :selected)",
	required: ":is(input, select, textarea)[required]",
	optional: ":is(input, select, textarea):not([required])",
	"read-only": `[readonly]:is(textarea, ${textControl})`,
	"read-write": `:not([readonly]):is(textarea, ${textControl})`,
	/**
	* `:selected` matches option elements that have the `selected` attribute,
	* or are the first option element in a select element that does not have
	* the `multiple` attribute and does not have any option elements with the
	* `selected` attribute.
	* @see https://html.spec.whatwg.org/multipage/form-elements.html#concept-option-selectedness
	*/
	selected: "option:is([selected], select:not([multiple]):not(:has(> option[selected])) > :first-of-type)",
	checkbox: "[type=checkbox]",
	file: "[type=file]",
	password: "[type=password]",
	radio: "[type=radio]",
	reset: "[type=reset]",
	image: "[type=image]",
	submit: "[type=submit]",
	parent: ":not(:empty)",
	header: ":is(h1, h2, h3, h4, h5, h6)",
	button: ":is(button, input[type=button])",
	input: ":is(input, textarea, select, button)",
	text: "input:is(:not([type!='']), [type=text])"
};
//#endregion
//#region node_modules/nth-check/dist/compile.js
/**
* Returns a function that checks if an elements index matches the given rule
* highly optimized to return the fastest solution.
* @param parsed A tuple [a, b], as returned by `parse`.
* @returns A highly optimized function that returns whether an index matches the nth-check.
* @example
*
* ```js
* const check = nthCheck.compile([2, 3]);
*
* check(0); // `false`
* check(1); // `false`
* check(2); // `true`
* check(3); // `false`
* check(4); // `true`
* check(5); // `false`
* check(6); // `true`
* ```
*/
function compile$1(parsed) {
	const a = parsed[0];
	const b = parsed[1] - 1;
	if (b < 0 && a <= 0) return falseFunc;
	if (a === -1) return (index) => index <= b;
	if (a === 0) return (index) => index === b;
	if (a === 1) return b < 0 ? trueFunc : (index) => index >= b;
	const absA = Math.abs(a);
	const bModulo = (b % absA + absA) % absA;
	return a > 1 ? (index) => index >= b && index % absA === bModulo : (index) => index <= b && index % absA === bModulo;
}
//#endregion
//#region node_modules/nth-check/dist/parse.js
var whitespace = /* @__PURE__ */ new Set([
	9,
	10,
	12,
	13,
	32
]);
var ZERO = "0".charCodeAt(0);
var NINE = "9".charCodeAt(0);
/**
* Parses an expression.
* @param formula CSS nth-formula to parse.
* @throws {Error} An `Error` if parsing fails.
* @returns An array containing the integer step size and the integer offset of the nth rule.
* @example nthCheck.parse("2n+3"); // returns [2, 3]
*/
function parse(formula) {
	formula = formula.trim().toLowerCase();
	switch (formula) {
		case "even": return [2, 0];
		case "odd": return [2, 1];
	}
	let index = 0;
	let a = 0;
	let sign = readSign();
	let number = readNumber();
	if (index < formula.length && formula.charAt(index) === "n") {
		index++;
		a = sign * (number ?? 1);
		skipWhitespace();
		if (index < formula.length) {
			sign = readSign();
			skipWhitespace();
			number = readNumber();
		} else sign = number = 0;
	}
	if (number === null || index < formula.length) throw new Error(`n-th rule couldn't be parsed ('${formula}')`);
	return [a, sign * number];
	function readSign() {
		switch (formula.charAt(index)) {
			case "-":
				index++;
				return -1;
			case "+": index++;
		}
		return 1;
	}
	function readNumber() {
		const start = index;
		let value = 0;
		while (index < formula.length && formula.charCodeAt(index) >= ZERO && formula.charCodeAt(index) <= NINE) {
			value = value * 10 + (formula.charCodeAt(index) - ZERO);
			index++;
		}
		return index === start ? null : value;
	}
	function skipWhitespace() {
		while (index < formula.length && whitespace.has(formula.charCodeAt(index))) index++;
	}
}
//#endregion
//#region node_modules/nth-check/dist/index.js
/**
* Parses and compiles a formula to a highly optimized function.
* Combination of {@link parse} and {@link compile}.
*
* If the formula doesn't match any elements,
* it returns [`boolbase`](https://github.com/fb55/boolbase)'s `falseFunc`.
* Otherwise, a function accepting an _index_ is returned, which returns
* whether or not the passed _index_ matches the formula.
*
* Note: The nth-rule starts counting at `1`, the returned function at `0`.
* @param formula The formula to compile.
* @example
* const check = nthCheck("2n+3");
*
* check(0); // `false`
* check(1); // `false`
* check(2); // `true`
* check(3); // `false`
* check(4); // `true`
* check(5); // `false`
* check(6); // `true`
*/
function nthCheck(formula) {
	return compile$1(parse(formula));
}
//#endregion
//#region node_modules/css-select/dist/helpers/cache.js
/**
* Some selectors such as `:contains` and (non-relative) `:has` will only be
* able to match elements if their parents match the selector (as they contain
* a subset of the elements that the parent contains).
*
* This function wraps the given `matches` function in a function that caches
* the results of the parent elements, so that the `matches` function only
* needs to be called once for each subtree.
* @param next Matcher to run after this matcher succeeds.
* @param options Configuration object for cache behavior.
* @param options.adapter Adapter implementation used for DOM access.
* @param options.cacheResults Whether results should be memoized by input root.
* @param matches Compiled matcher function to wrap with caching.
*/
function cacheParentResults(next, { adapter, cacheResults }, matches) {
	if (cacheResults === false || typeof WeakMap === "undefined") return (element) => next(element) && matches(element);
	const resultCache = /* @__PURE__ */ new WeakMap();
	function addResultToCache(element) {
		const result = matches(element);
		resultCache.set(element, result);
		return result;
	}
	return function cachedMatcher(element) {
		if (!next(element)) return false;
		if (resultCache.has(element)) return resultCache.get(element) ?? false;
		let node = element;
		do {
			const parent = getElementParent(node, adapter);
			if (parent === null) return addResultToCache(element);
			node = parent;
		} while (!resultCache.has(node));
		return resultCache.get(node) ? addResultToCache(element) : false;
	};
}
//#endregion
//#region node_modules/css-select/dist/helpers/options.js
/**
* Create a copy of options, omitting `context` and `rootFunc`.
*
* This is used when compiling nested selectors (e.g. inside `:is`, `:not`,
* `:nth-child(… of S)`) so that the parent compilation state doesn't leak.
*/
function copyOptions(options) {
	const { context: _, rootFunc: __, ...copied } = options;
	return copied;
}
//#endregion
//#region node_modules/css-select/dist/pseudo-selectors/filters.js
/**
* RFC 4647 extended filtering with pre-split subtags.
* @param tag - Lowercased subtags of the element's language value.
* @param range - Lowercased subtags of the language range to match against.
*/
function extendedFilter(tag, range) {
	if (range[0] !== "*" && range[0] !== tag[0]) return false;
	let tagIndex = 1;
	for (let rangeIndex = 1; rangeIndex < range.length; rangeIndex++) {
		if (range[rangeIndex] === "*") continue;
		while (tagIndex < tag.length && tag[tagIndex] !== range[rangeIndex]) if (tag[tagIndex++].length <= 1) return false;
		if (tagIndex >= tag.length) return false;
		tagIndex++;
	}
	return true;
}
/** @see {@link https://www.w3.org/TR/selectors-4/#the-nth-child-pseudo} */
var nthOfRegex = /^(.+?)\s+of\s+(.+)$/is;
function compileNth(reverse, ofType) {
	return function nth(next, rule, options, context, compileToken) {
		const { adapter, equals } = options;
		const ofMatch = ofType ? null : rule.match(nthOfRegex);
		const nthCheck$1 = nthCheck(ofMatch ? ofMatch[1].trim() : rule);
		if (nthCheck$1 === falseFunc) return falseFunc;
		const ofSelector = ofMatch && compileToken ? compileToken(parse$1(ofMatch[2].trim()), copyOptions(options), context) : void 0;
		if (ofSelector === falseFunc) return falseFunc;
		if (nthCheck$1 === trueFunc && !ofSelector) return (element) => getElementParent(element, adapter) !== null && next(element);
		const shouldCount = ofSelector ? (_element, sibling) => ofSelector(sibling) : ofType ? (element, sibling) => adapter.getName(sibling) === adapter.getName(element) : trueFunc;
		if (reverse) return function nthLast(element) {
			if (ofSelector && !ofSelector(element)) return false;
			const siblings = adapter.getSiblings(element);
			let pos = 0;
			for (let index = siblings.length - 1; index >= 0; index--) {
				const sibling = siblings[index];
				if (equals(element, sibling)) break;
				if (adapter.isTag(sibling) && shouldCount(element, sibling)) pos++;
			}
			return nthCheck$1(pos) && next(element);
		};
		return function nth(element) {
			if (ofSelector && !ofSelector(element)) return false;
			const siblings = adapter.getSiblings(element);
			let pos = 0;
			for (const sibling of siblings) {
				if (equals(element, sibling)) break;
				if (adapter.isTag(sibling) && shouldCount(element, sibling)) pos++;
			}
			return nthCheck$1(pos) && next(element);
		};
	};
}
/**
* Pre-compiled pseudo filters.
*/
var filters = {
	contains(next, text, options) {
		const { getText } = options.adapter;
		return cacheParentResults(next, options, (element) => getText(element).includes(text));
	},
	icontains(next, text, options) {
		const itext = text.toLowerCase();
		const { getText } = options.adapter;
		return cacheParentResults(next, options, (element) => getText(element).toLowerCase().includes(itext));
	},
	"nth-child": compileNth(false, false),
	"nth-last-child": compileNth(true, false),
	"nth-of-type": compileNth(false, true),
	"nth-last-of-type": compileNth(true, true),
	root(next, _rule, { adapter }) {
		return (element) => getElementParent(element, adapter) === null && next(element);
	},
	scope(next, rule, options, context) {
		const { equals } = options;
		if (!context || context.length === 0) return filters["root"](next, rule, options);
		if (context.length === 1) return (element) => equals(context[0], element) && next(element);
		return (element) => context.includes(element) && next(element);
	},
	lang(next, code, { adapter }) {
		const ranges = code.split(",").map((r) => r.trim()).filter((r) => r.length > 0).map((r) => r.replace(/^['"]|['"]$/g, "").toLowerCase().split("-"));
		return function lang(element) {
			let node = element;
			while (node != null) {
				const value = adapter.getAttributeValue(node, "xml:lang") ?? adapter.getAttributeValue(node, "lang");
				if (value != null) {
					if (!value) return ranges.some((r) => r[0] === "") && next(element);
					const tag = value.toLowerCase().split("-");
					return ranges.some((r) => extendedFilter(tag, r)) && next(element);
				}
				const parent = adapter.getParent(node);
				node = parent != null && adapter.isTag(parent) ? parent : null;
			}
			return ranges.some((r) => r[0] === "") && next(element);
		};
	},
	hover: dynamicStatePseudo("isHovered"),
	visited: dynamicStatePseudo("isVisited"),
	active: dynamicStatePseudo("isActive")
};
/**
* Dynamic state pseudos. These depend on optional Adapter methods.
* @param name The name of the adapter method to call.
* @returns Pseudo for the `filters` object.
*/
function dynamicStatePseudo(name) {
	return function dynamicPseudo(next, _rule, { adapter }) {
		const filterFunction = adapter[name];
		if (typeof filterFunction !== "function") return falseFunc;
		return function active(element) {
			return filterFunction(element) && next(element);
		};
	};
}
//#endregion
//#region node_modules/css-select/dist/pseudo-selectors/pseudos.js
/**
* CSS limits the characters considered as whitespace to space, tab & line
* feed. We add carriage returns as htmlparser2 doesn't normalize them to
* line feeds.
* @see {@link https://www.w3.org/TR/css-text-3/#white-space}
*/
var isDocumentWhiteSpace = /^[ \t\r\n]*$/;
/** Runtime pseudo selector implementations. */
var pseudos = {
	empty(element, { adapter }) {
		const children = adapter.getChildren(element);
		return children.every((element) => !adapter.isTag(element)) && children.every((element) => isDocumentWhiteSpace.test(adapter.getText(element)));
	},
	"first-child"(element, { adapter, equals }) {
		if (adapter.prevElementSibling) return adapter.prevElementSibling(element) == null;
		const firstChild = adapter.getSiblings(element).find((sibling) => adapter.isTag(sibling));
		return firstChild != null && equals(element, firstChild);
	},
	"last-child"(element, { adapter, equals }) {
		const siblings = adapter.getSiblings(element);
		for (let index = siblings.length - 1; index >= 0; index--) {
			if (equals(element, siblings[index])) return true;
			if (adapter.isTag(siblings[index])) break;
		}
		return false;
	},
	"first-of-type"(element, { adapter, equals }) {
		const siblings = adapter.getSiblings(element);
		const elementName = adapter.getName(element);
		for (const currentSibling of siblings) {
			if (equals(element, currentSibling)) return true;
			if (adapter.isTag(currentSibling) && adapter.getName(currentSibling) === elementName) break;
		}
		return false;
	},
	"last-of-type"(element, { adapter, equals }) {
		const siblings = adapter.getSiblings(element);
		const elementName = adapter.getName(element);
		for (let index = siblings.length - 1; index >= 0; index--) {
			const currentSibling = siblings[index];
			if (equals(element, currentSibling)) return true;
			if (adapter.isTag(currentSibling) && adapter.getName(currentSibling) === elementName) break;
		}
		return false;
	},
	"only-of-type"(element, { adapter, equals }) {
		const elementName = adapter.getName(element);
		return adapter.getSiblings(element).every((sibling) => equals(element, sibling) || !adapter.isTag(sibling) || adapter.getName(sibling) !== elementName);
	},
	"only-child"(element, { adapter, equals }) {
		return adapter.getSiblings(element).every((sibling) => equals(element, sibling) || !adapter.isTag(sibling));
	}
};
/**
* Validate pseudo selector argument arity.
* @param pseudoClassCondition Pseudo-function implementation to wrap.
* @param name Name of the pseudo selector.
* @param subselect Subselector passed to the pseudo-function.
* @param argumentIndex Index of the argument parser to apply.
*/
function verifyPseudoArguments(pseudoClassCondition, name, subselect, argumentIndex) {
	if (subselect === null) {
		if (pseudoClassCondition.length > argumentIndex) throw new Error(`Pseudo-class :${name} requires an argument`);
	} else if (pseudoClassCondition.length === argumentIndex) throw new Error(`Pseudo-class :${name} doesn't have any arguments`);
}
//#endregion
//#region node_modules/css-select/dist/helpers/selectors.js
/**
* Check whether a selector token performs traversal.
* @param token Selector token(s) to compile.
*/
function isTraversal(token) {
	return token.type === "_flexibleDescendant" || isTraversal$1(token);
}
/**
* Sort the parts of the passed selector, as there is potential for
* optimization (some types of selectors are faster than others).
* @param array Selector to sort
*/
function sortRules(array) {
	const ratings = array.map(getQuality);
	for (let index = 1; index < array.length; index++) {
		const procNew = ratings[index];
		if (procNew < 0) continue;
		for (let currentIndex = index; currentIndex > 0 && procNew < ratings[currentIndex - 1]; currentIndex--) {
			const token = array[currentIndex];
			array[currentIndex] = array[currentIndex - 1];
			array[currentIndex - 1] = token;
			ratings[currentIndex] = ratings[currentIndex - 1];
			ratings[currentIndex - 1] = procNew;
		}
	}
}
function getAttributeQuality(token) {
	switch (token.action) {
		case AttributeAction.Exists: return 10;
		case AttributeAction.Equals: return token.name === "id" ? 9 : 8;
		case AttributeAction.Not: return 7;
		case AttributeAction.Start: return 6;
		case AttributeAction.End: return 6;
		case AttributeAction.Any: return 5;
		case AttributeAction.Hyphen: return 4;
		case AttributeAction.Element: return 3;
	}
}
/**
* Determine the quality of the passed token. The higher the number, the
* faster the token is to execute.
* @param token Token to get the quality of.
* @returns The token's quality.
*/
function getQuality(token) {
	switch (token.type) {
		case SelectorType.Universal: return 50;
		case SelectorType.Tag: return 30;
		case SelectorType.Attribute: return Math.floor(getAttributeQuality(token) / (token.ignoreCase ? 2 : 1));
		case SelectorType.Pseudo: return token.data ? token.name === "has" || token.name === "contains" || token.name === "icontains" ? 0 : Array.isArray(token.data) ? Math.max(0, Math.min(...token.data.map((d) => Math.min(...d.map(getQuality))))) : 2 : 3;
		default: return -1;
	}
}
/**
* Check whether a token or nested token includes `:scope`.
* @param t Selector token under inspection.
*/
function includesScopePseudo(t) {
	return t.type === SelectorType.Pseudo && (t.name === "scope" || Array.isArray(t.data) && t.data.some((data) => data.some(includesScopePseudo)));
}
//#endregion
//#region node_modules/css-select/dist/pseudo-selectors/subselects.js
/** Used as a placeholder for :has. Will be replaced with the actual element. */
var PLACEHOLDER_ELEMENT = {};
/**
* Check if the selector has any properties that rely on the current element.
* If not, we can cache the result of the selector.
*
* We can't cache selectors that start with a traversal (e.g. `>`, `+`, `~`),
* or include a `:scope`.
* @param selector - The selector to check.
* @returns Whether the selector has any properties that rely on the current element.
*/
function hasDependsOnCurrentElement(selector) {
	return selector.some((sel) => sel.length > 0 && (isTraversal(sel[0]) || sel.some(includesScopePseudo)));
}
var is$1 = (next, token, options, context, compileToken) => {
	const compiledToken = compileToken(token, copyOptions(options), context);
	return compiledToken === trueFunc ? next : compiledToken === falseFunc ? falseFunc : (element) => compiledToken(element) && next(element);
};
/** Pseudo selectors that compile nested selectors. */
var subselects = {
	is: is$1,
	/**
	* `:matches` and `:where` are aliases for `:is`.
	*/
	matches: is$1,
	where: is$1,
	not(next, token, options, context, compileToken) {
		const compiledToken = compileToken(token, copyOptions(options), context);
		return compiledToken === falseFunc ? next : compiledToken === trueFunc ? falseFunc : (element) => !compiledToken(element) && next(element);
	},
	has(next, subselect, options, _context, compileToken) {
		const { adapter } = options;
		const copiedOptions = copyOptions(options);
		copiedOptions.relativeSelector = true;
		const context = subselect.some((s) => s.some(isTraversal)) ? [PLACEHOLDER_ELEMENT] : void 0;
		const skipCache = hasDependsOnCurrentElement(subselect);
		const compiled = compileToken(subselect, copiedOptions, context);
		if (compiled === falseFunc) return falseFunc;
		if (context && compiled !== trueFunc) return skipCache ? (element) => {
			if (!next(element)) return false;
			context[0] = element;
			const childs = adapter.getChildren(element);
			return findOne(compiled, compiled.shouldTestNextSiblings ? [...childs, ...getNextSiblings(element, adapter)] : childs, options) !== null;
		} : cacheParentResults(next, options, (element) => {
			context[0] = element;
			return findOne(compiled, adapter.getChildren(element), options) !== null;
		});
		const hasOne = (element) => findOne(compiled, adapter.getChildren(element), options) !== null;
		return skipCache ? (element) => next(element) && hasOne(element) : cacheParentResults(next, options, hasOne);
	}
};
//#endregion
//#region node_modules/css-select/dist/pseudo-selectors/index.js
/**
* Compile a pseudo selector into an executable query function.
* @param next Matcher to run after this matcher succeeds.
* @param selector Selector used to match elements.
* @param options Options that control this operation.
* @param context Context nodes used to scope selector matching.
* @param compileToken Function used to compile nested selector tokens.
*/
function compilePseudoSelector(next, selector, options, context, compileToken) {
	const { name, data } = selector;
	if (Array.isArray(data)) {
		if (!(name in subselects)) throw new Error(`Unknown pseudo-class :${name}(${data})`);
		return subselects[name](next, data, options, context, compileToken);
	}
	const userPseudo = options.pseudos?.[name];
	const stringPseudo = typeof userPseudo === "string" ? userPseudo : aliases[name];
	if (typeof stringPseudo === "string") {
		if (data != null) throw new Error(`Pseudo ${name} doesn't have any arguments`);
		const alias = parse$1(stringPseudo);
		return subselects["is"](next, alias, options, context, compileToken);
	}
	if (typeof userPseudo === "function") {
		verifyPseudoArguments(userPseudo, name, data, 1);
		return (element) => userPseudo(element, data) && next(element);
	}
	if (name in filters) return filters[name](next, data, options, context, compileToken);
	if (name in pseudos) {
		const pseudo = pseudos[name];
		verifyPseudoArguments(pseudo, name, data, 2);
		return (element) => pseudo(element, options, data) && next(element);
	}
	throw new Error(`Unknown pseudo-class :${name}`);
}
//#endregion
//#region node_modules/css-select/dist/general.js
/**
* Compile a single selector token.
* @param next Matcher to run after this matcher succeeds.
* @param selector Selector used to match elements.
* @param options Options that control this operation.
* @param context Context nodes used to scope selector matching.
* @param compileToken Function used to compile nested selector tokens.
* @param hasExpensiveSubselector Whether the selector contains expensive subselectors.
*/
function compileGeneralSelector(next, selector, options, context, compileToken, hasExpensiveSubselector) {
	const { adapter, equals, cacheResults } = options;
	switch (selector.type) {
		case SelectorType.PseudoElement: throw new Error("Pseudo-elements are not supported by css-select");
		case SelectorType.ColumnCombinator: throw new Error("Column combinators are not yet supported by css-select");
		case SelectorType.Attribute:
			if (selector.namespace != null) throw new Error("Namespaced attributes are not yet supported by css-select");
			if (!options.xmlMode || options.lowerCaseAttributeNames) selector.name = selector.name.toLowerCase();
			return attributeRules[selector.action](next, selector, options);
		case SelectorType.Pseudo: return compilePseudoSelector(next, selector, options, context, compileToken);
		case SelectorType.Tag: {
			if (selector.namespace != null) throw new Error("Namespaced tag names are not yet supported by css-select");
			let { name } = selector;
			if (!options.xmlMode || options.lowerCaseTags) name = name.toLowerCase();
			return function tag(element) {
				return adapter.getName(element) === name && next(element);
			};
		}
		case SelectorType.Descendant: {
			if (!hasExpensiveSubselector || cacheResults === false || typeof WeakMap === "undefined") return function descendant(element) {
				let current = element;
				while (current = getElementParent(current, adapter)) if (next(current)) return true;
				return false;
			};
			const resultCache = /* @__PURE__ */ new WeakMap();
			return function cachedDescendant(element) {
				let current = element;
				let result;
				while (current = getElementParent(current, adapter)) {
					const cached = resultCache.get(current);
					if (cached === void 0) {
						result ??= { matches: false };
						result.matches = next(current);
						resultCache.set(current, result);
						if (result.matches) return true;
					} else {
						if (result) result.matches = cached.matches;
						return cached.matches;
					}
				}
				return false;
			};
		}
		case "_flexibleDescendant": return function flexibleDescendant(element) {
			let current = element;
			do {
				if (next(current)) return true;
				current = getElementParent(current, adapter);
			} while (current);
			return false;
		};
		case SelectorType.Parent: return function parent(element) {
			return adapter.getChildren(element).some((element) => adapter.isTag(element) && next(element));
		};
		case SelectorType.Child: return function child(element) {
			const parent = getElementParent(element, adapter);
			return parent !== null && next(parent);
		};
		case SelectorType.Sibling: return function sibling(element) {
			const siblings = adapter.getSiblings(element);
			for (const currentSibling of siblings) {
				if (equals(element, currentSibling)) break;
				if (adapter.isTag(currentSibling) && next(currentSibling)) return true;
			}
			return false;
		};
		case SelectorType.Adjacent:
			if (adapter.prevElementSibling) return function adjacent(element) {
				const previous = adapter.prevElementSibling(element);
				return previous != null && next(previous);
			};
			return function adjacent(element) {
				const siblings = adapter.getSiblings(element);
				let lastElement;
				for (const currentSibling of siblings) {
					if (equals(element, currentSibling)) break;
					if (adapter.isTag(currentSibling)) lastElement = currentSibling;
				}
				return !!lastElement && next(lastElement);
			};
		case SelectorType.Universal:
			if (selector.namespace != null && selector.namespace !== "*") throw new Error("Namespaced universal selectors are not yet supported by css-select");
			return next;
	}
}
//#endregion
//#region node_modules/css-select/dist/compile.js
var DESCENDANT_TOKEN = { type: SelectorType.Descendant };
var FLEXIBLE_DESCENDANT_TOKEN = { type: "_flexibleDescendant" };
var SCOPE_TOKEN = {
	type: SelectorType.Pseudo,
	name: "scope",
	data: null
};
function absolutize(token, { adapter }, context) {
	const hasContext = !!context?.every((element) => element === PLACEHOLDER_ELEMENT || adapter.isTag(element) && getElementParent(element, adapter) !== null);
	for (const t of token) {
		if (t.length > 0 && isTraversal(t[0]) && t[0].type !== SelectorType.Descendant) {} else if (hasContext && !t.some(includesScopePseudo)) t.unshift(DESCENDANT_TOKEN);
		else continue;
		t.unshift(SCOPE_TOKEN);
	}
}
/**
* Compile a parsed selector token into an executable query function.
* @param token Selector token(s) to compile.
* @param options Options that control this operation.
* @param compilationContext Compilation context for relative selector handling.
*/
function compileToken(token, options, compilationContext) {
	for (const rules of token) sortRules(rules);
	const { context = compilationContext, rootFunc: rootFunction = trueFunc } = options;
	const isArrayContext = Array.isArray(context);
	const finalContext = context && (Array.isArray(context) ? context : [context]);
	if (options.relativeSelector !== false) absolutize(token, options, finalContext);
	else if (token.some((t) => t.length > 0 && isTraversal(t[0]))) throw new Error("Relative selectors are not allowed when the `relativeSelector` option is disabled");
	let shouldTestNextSiblings = false;
	let query = falseFunc;
	combineLoop: for (const rules of token) {
		if (rules.length >= 2) {
			const [first, second] = rules;
			if (first.type !== SelectorType.Pseudo || first.name !== "scope") {} else if (isArrayContext && second.type === SelectorType.Descendant) rules[1] = FLEXIBLE_DESCENDANT_TOKEN;
			else if (second.type === SelectorType.Adjacent || second.type === SelectorType.Sibling) shouldTestNextSiblings = true;
		}
		let next = rootFunction;
		let hasExpensiveSubselector = false;
		for (const rule of rules) {
			next = compileGeneralSelector(next, rule, options, finalContext, compileToken, hasExpensiveSubselector);
			if (getQuality(rule) === 0) hasExpensiveSubselector = true;
			if (next === falseFunc) continue combineLoop;
		}
		if (next === rootFunction) return rootFunction;
		query = query === falseFunc ? next : or(query, next);
	}
	query.shouldTestNextSiblings = shouldTestNextSiblings;
	return query;
}
function or(a, b) {
	return (element) => a(element) || b(element);
}
//#endregion
//#region node_modules/css-select/dist/index.js
var defaultEquals = (a, b) => a === b;
var defaultOptions = {
	adapter: {
		...dist_exports,
		isTag
	},
	equals: defaultEquals
};
function convertOptionFormats(options) {
	const finalOptions = options ?? defaultOptions;
	finalOptions.adapter ??= defaultOptions.adapter;
	finalOptions.equals ??= finalOptions.adapter?.equals ?? defaultEquals;
	return finalOptions;
}
/**
* Compiles a selector to an executable function.
*
* The returned function checks if each passed node is an element. Use
* `_compileUnsafe` to skip this check.
* @param selector Selector to compile.
* @param options Compilation options.
* @param context Optional context for the selector.
*/
function compile(selector, options, context) {
	const convertedOptions = convertOptionFormats(options);
	const next = _compileUnsafe(selector, convertedOptions, context);
	return next === falseFunc ? falseFunc : (element) => convertedOptions.adapter.isTag(element) && next(element);
}
/**
* Like `compile`, but does not add a check if elements are tags.
* @param selector Selector used to match elements.
* @param options Options that control this operation.
* @param context Context nodes used to scope selector matching.
*/
function _compileUnsafe(selector, options, context) {
	return compileToken(typeof selector === "string" ? parse$1(selector) : selector, convertOptionFormats(options), context);
}
/**
* Tests whether or not an element is matched by query.
* @template Node The generic Node type for the DOM adapter being used.
* @template ElementNode The Node type for elements for the DOM adapter being used.
* @param element The element to test if it matches the query.
* @param query can be either a CSS selector string or a compiled query function.
* @param [options] options for querying the document.
* @see compile for supported selector queries.
* @returns Whether the element matches the query.
*/
function is(element, query, options) {
	return (typeof query === "function" ? query : compile(query, options))(element);
}
//#endregion
export { is as n, compile as t };
