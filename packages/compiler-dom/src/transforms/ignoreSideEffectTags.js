"use strict";
exports.__esModule = true;
exports.ignoreSideEffectTags = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var errors_1 = require("../errors");
var ignoreSideEffectTags = function (node, context) {
    if (node.type === compiler_core_1.NodeTypes.ELEMENT &&
        node.tagType === compiler_core_1.ElementTypes.ELEMENT &&
        (node.tag === 'script' || node.tag === 'style')) {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_IGNORED_SIDE_EFFECT_TAG, node.loc));
        context.removeNode();
    }
};
exports.ignoreSideEffectTags = ignoreSideEffectTags;
