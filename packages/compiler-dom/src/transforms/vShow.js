"use strict";
exports.__esModule = true;
exports.transformShow = void 0;
var errors_1 = require("../errors");
var runtimeHelpers_1 = require("../runtimeHelpers");
var transformShow = function (dir, node, context) {
    var exp = dir.exp, loc = dir.loc;
    if (!exp) {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_SHOW_NO_EXPRESSION, loc));
    }
    return {
        props: [],
        needRuntime: context.helper(runtimeHelpers_1.V_SHOW)
    };
};
exports.transformShow = transformShow;
