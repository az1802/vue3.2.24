"use strict";
exports.__esModule = true;
exports.transformVText = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var errors_1 = require("../errors");
var transformVText = function (dir, node, context) {
    var exp = dir.exp, loc = dir.loc;
    if (!exp) {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_TEXT_NO_EXPRESSION, loc));
    }
    if (node.children.length) {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_TEXT_WITH_CHILDREN, loc));
        node.children.length = 0;
    }
    return {
        props: [
            (0, compiler_core_1.createObjectProperty)((0, compiler_core_1.createSimpleExpression)("textContent", true), exp
                ? (0, compiler_core_1.getConstantType)(exp, context) > 0
                    ? exp
                    : (0, compiler_core_1.createCallExpression)(context.helperString(compiler_core_1.TO_DISPLAY_STRING), [exp], loc)
                : (0, compiler_core_1.createSimpleExpression)('', true))
        ]
    };
};
exports.transformVText = transformVText;
