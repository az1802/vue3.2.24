"use strict";
exports.__esModule = true;
exports.parserOptions = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var shared_1 = require("@vue/shared");
var runtimeHelpers_1 = require("./runtimeHelpers");
var decodeHtml_1 = require("./decodeHtml");
var decodeHtmlBrowser_1 = require("./decodeHtmlBrowser");
var isRawTextContainer = /*#__PURE__*/ (0, shared_1.makeMap)('style,iframe,script,noscript', true);
exports.parserOptions = {
    isVoidTag: shared_1.isVoidTag,
    isNativeTag: function (tag) { return (0, shared_1.isHTMLTag)(tag) || (0, shared_1.isSVGTag)(tag); },
    isPreTag: function (tag) { return tag === 'pre'; },
    decodeEntities: __BROWSER__ ? decodeHtmlBrowser_1.decodeHtmlBrowser : decodeHtml_1.decodeHtml,
    isBuiltInComponent: function (tag) {
        if ((0, compiler_core_1.isBuiltInType)(tag, "Transition")) {
            return runtimeHelpers_1.TRANSITION;
        }
        else if ((0, compiler_core_1.isBuiltInType)(tag, "TransitionGroup")) {
            return runtimeHelpers_1.TRANSITION_GROUP;
        }
    },
    // https://html.spec.whatwg.org/multipage/parsing.html#tree-construction-dispatcher
    getNamespace: function (tag, parent) {
        var ns = parent ? parent.ns : DOMNamespaces.HTML;
        if (parent && ns === DOMNamespaces.MATH_ML) {
            if (parent.tag === 'annotation-xml') {
                if (tag === 'svg') {
                    return DOMNamespaces.SVG;
                }
                if (parent.props.some(function (a) {
                    return a.type === compiler_core_1.NodeTypes.ATTRIBUTE &&
                        a.name === 'encoding' &&
                        a.value != null &&
                        (a.value.content === 'text/html' ||
                            a.value.content === 'application/xhtml+xml');
                })) {
                    ns = DOMNamespaces.HTML;
                }
            }
            else if (/^m(?:[ions]|text)$/.test(parent.tag) &&
                tag !== 'mglyph' &&
                tag !== 'malignmark') {
                ns = DOMNamespaces.HTML;
            }
        }
        else if (parent && ns === DOMNamespaces.SVG) {
            if (parent.tag === 'foreignObject' ||
                parent.tag === 'desc' ||
                parent.tag === 'title') {
                ns = DOMNamespaces.HTML;
            }
        }
        if (ns === DOMNamespaces.HTML) {
            if (tag === 'svg') {
                return DOMNamespaces.SVG;
            }
            if (tag === 'math') {
                return DOMNamespaces.MATH_ML;
            }
        }
        return ns;
    },
    // https://html.spec.whatwg.org/multipage/parsing.html#parsing-html-fragments
    getTextMode: function (_a) {
        var tag = _a.tag, ns = _a.ns;
        if (ns === DOMNamespaces.HTML) {
            if (tag === 'textarea' || tag === 'title') {
                return compiler_core_1.TextModes.RCDATA;
            }
            if (isRawTextContainer(tag)) {
                return compiler_core_1.TextModes.RAWTEXT;
            }
        }
        return compiler_core_1.TextModes.DATA;
    }
};
