"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.createDOMCompilerError = exports.transformStyle = exports.parse = exports.compile = exports.DOMDirectiveTransforms = exports.DOMNodeTransforms = exports.parserOptions = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var parserOptions_1 = require("./parserOptions");
exports.parserOptions = parserOptions_1.parserOptions;
var transformStyle_1 = require("./transforms/transformStyle");
var vHtml_1 = require("./transforms/vHtml");
var vText_1 = require("./transforms/vText");
var vModel_1 = require("./transforms/vModel");
var vOn_1 = require("./transforms/vOn");
var vShow_1 = require("./transforms/vShow");
var Transition_1 = require("./transforms/Transition");
var stringifyStatic_1 = require("./transforms/stringifyStatic");
var ignoreSideEffectTags_1 = require("./transforms/ignoreSideEffectTags");
var shared_1 = require("@vue/shared");
exports.DOMNodeTransforms = __spreadArray([
    transformStyle_1.transformStyle
], (__DEV__ ? [Transition_1.transformTransition] : []), true);
exports.DOMDirectiveTransforms = {
    cloak: compiler_core_1.noopDirectiveTransform,
    html: vHtml_1.transformVHtml,
    text: vText_1.transformVText,
    model: vModel_1.transformModel,
    on: vOn_1.transformOn,
    show: vShow_1.transformShow
};
function compile(template, options) {
    if (options === void 0) { options = {}; }
    return (0, compiler_core_1.baseCompile)(template, (0, shared_1.extend)({}, parserOptions_1.parserOptions, options, {
        nodeTransforms: __spreadArray(__spreadArray([
            // ignore <script> and <tag>
            // this is not put inside DOMNodeTransforms because that list is used
            // by compiler-ssr to generate vnode fallback branches
            ignoreSideEffectTags_1.ignoreSideEffectTags
        ], exports.DOMNodeTransforms, true), (options.nodeTransforms || []), true),
        directiveTransforms: (0, shared_1.extend)({}, exports.DOMDirectiveTransforms, options.directiveTransforms || {}),
        transformHoist: __BROWSER__ ? null : stringifyStatic_1.stringifyStatic
    }));
}
exports.compile = compile;
function parse(template, options) {
    if (options === void 0) { options = {}; }
    return (0, compiler_core_1.baseParse)(template, (0, shared_1.extend)({}, parserOptions_1.parserOptions, options));
}
exports.parse = parse;
__exportStar(require("./runtimeHelpers"), exports);
var transformStyle_2 = require("./transforms/transformStyle");
__createBinding(exports, transformStyle_2, "transformStyle");
var errors_1 = require("./errors");
__createBinding(exports, errors_1, "createDOMCompilerError");
__exportStar(require("@vue/compiler-core"), exports);
