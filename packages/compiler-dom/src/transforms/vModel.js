"use strict";
exports.__esModule = true;
exports.transformModel = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var errors_1 = require("../errors");
var runtimeHelpers_1 = require("../runtimeHelpers");
var transformModel = function (dir, node, context) {
    var baseResult = (0, compiler_core_1.transformModel)(dir, node, context);
    // base transform has errors OR component v-model (only need props)
    if (!baseResult.props.length || node.tagType === compiler_core_1.ElementTypes.COMPONENT) {
        return baseResult;
    }
    if (dir.arg) {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT, dir.arg.loc));
    }
    function checkDuplicatedValue() {
        var value = (0, compiler_core_1.findProp)(node, 'value');
        if (value) {
            context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE, value.loc));
        }
    }
    var tag = node.tag;
    var isCustomElement = context.isCustomElement(tag);
    if (tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        isCustomElement) {
        var directiveToUse = runtimeHelpers_1.V_MODEL_TEXT;
        var isInvalidType = false;
        if (tag === 'input' || isCustomElement) {
            var type = (0, compiler_core_1.findProp)(node, "type");
            if (type) {
                if (type.type === compiler_core_1.NodeTypes.DIRECTIVE) {
                    // :type="foo"
                    directiveToUse = runtimeHelpers_1.V_MODEL_DYNAMIC;
                }
                else if (type.value) {
                    switch (type.value.content) {
                        case 'radio':
                            directiveToUse = runtimeHelpers_1.V_MODEL_RADIO;
                            break;
                        case 'checkbox':
                            directiveToUse = runtimeHelpers_1.V_MODEL_CHECKBOX;
                            break;
                        case 'file':
                            isInvalidType = true;
                            context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT, dir.loc));
                            break;
                        default:
                            // text type
                            __DEV__ && checkDuplicatedValue();
                            break;
                    }
                }
            }
            else if ((0, compiler_core_1.hasDynamicKeyVBind)(node)) {
                // element has bindings with dynamic keys, which can possibly contain
                // "type".
                directiveToUse = runtimeHelpers_1.V_MODEL_DYNAMIC;
            }
            else {
                // text type
                __DEV__ && checkDuplicatedValue();
            }
        }
        else if (tag === 'select') {
            directiveToUse = runtimeHelpers_1.V_MODEL_SELECT;
        }
        else {
            // textarea
            __DEV__ && checkDuplicatedValue();
        }
        // inject runtime directive
        // by returning the helper symbol via needRuntime
        // the import will replaced a resolveDirective call.
        if (!isInvalidType) {
            baseResult.needRuntime = context.helper(directiveToUse);
        }
    }
    else {
        context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT, dir.loc));
    }
    // native vmodel doesn't need the `modelValue` props since they are also
    // passed to the runtime as `binding.value`. removing it reduces code size.
    baseResult.props = baseResult.props.filter(function (p) {
        return !(p.key.type === compiler_core_1.NodeTypes.SIMPLE_EXPRESSION &&
            p.key.content === 'modelValue');
    });
    return baseResult;
};
exports.transformModel = transformModel;
