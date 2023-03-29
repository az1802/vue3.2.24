"use strict";
var _a;
exports.__esModule = true;
exports.DOMErrorMessages = exports.createDOMCompilerError = void 0;
var compiler_core_1 = require("@vue/compiler-core");
function createDOMCompilerError(code, loc) {
    return (0, compiler_core_1.createCompilerError)(code, loc, __DEV__ || !__BROWSER__ ? exports.DOMErrorMessages : undefined);
}
exports.createDOMCompilerError = createDOMCompilerError;
exports.DOMErrorMessages = (_a = {},
    _a[DOMErrorCodes.X_V_HTML_NO_EXPRESSION] = "v-html is missing expression.",
    _a[DOMErrorCodes.X_V_HTML_WITH_CHILDREN] = "v-html will override element children.",
    _a[DOMErrorCodes.X_V_TEXT_NO_EXPRESSION] = "v-text is missing expression.",
    _a[DOMErrorCodes.X_V_TEXT_WITH_CHILDREN] = "v-text will override element children.",
    _a[DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT] = "v-model can only be used on <input>, <textarea> and <select> elements.",
    _a[DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT] = "v-model argument is not supported on plain elements.",
    _a[DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT] = "v-model cannot be used on file inputs since they are read-only. Use a v-on:change listener instead.",
    _a[DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE] = "Unnecessary value binding used alongside v-model. It will interfere with v-model's behavior.",
    _a[DOMErrorCodes.X_V_SHOW_NO_EXPRESSION] = "v-show is missing expression.",
    _a[DOMErrorCodes.X_TRANSITION_INVALID_CHILDREN] = "<Transition> expects exactly one child element or component.",
    _a[DOMErrorCodes.X_IGNORED_SIDE_EFFECT_TAG] = "Tags with side effect (<script> and <style>) are ignored in client component templates.",
    _a);
