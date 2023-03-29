"use strict";
exports.__esModule = true;
exports.transformOn = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var runtimeHelpers_1 = require("../runtimeHelpers");
var shared_1 = require("@vue/shared");
var isEventOptionModifier = /*#__PURE__*/ (0, shared_1.makeMap)("passive,once,capture");
var isNonKeyModifier = /*#__PURE__*/ (0, shared_1.makeMap)(
// event propagation management
"stop,prevent,self," +
    // system modifiers + exact
    "ctrl,shift,alt,meta,exact," +
    // mouse
    "middle");
// left & right could be mouse or key modifiers based on event type
var maybeKeyModifier = /*#__PURE__*/ (0, shared_1.makeMap)('left,right');
var isKeyboardEvent = /*#__PURE__*/ (0, shared_1.makeMap)("onkeyup,onkeydown,onkeypress", true);
var resolveModifiers = function (key, modifiers, context, loc) {
    var keyModifiers = [];
    var nonKeyModifiers = [];
    var eventOptionModifiers = [];
    for (var i = 0; i < modifiers.length; i++) {
        var modifier = modifiers[i];
        if (__COMPAT__ &&
            modifier === 'native' &&
            (0, compiler_core_1.checkCompatEnabled)(compiler_core_1.CompilerDeprecationTypes.COMPILER_V_ON_NATIVE, context, loc)) {
            eventOptionModifiers.push(modifier);
        }
        else if (isEventOptionModifier(modifier)) {
            // eventOptionModifiers: modifiers for addEventListener() options,
            // e.g. .passive & .capture
            eventOptionModifiers.push(modifier);
        }
        else {
            // runtimeModifiers: modifiers that needs runtime guards
            if (maybeKeyModifier(modifier)) {
                if ((0, compiler_core_1.isStaticExp)(key)) {
                    if (isKeyboardEvent(key.content)) {
                        keyModifiers.push(modifier);
                    }
                    else {
                        nonKeyModifiers.push(modifier);
                    }
                }
                else {
                    keyModifiers.push(modifier);
                    nonKeyModifiers.push(modifier);
                }
            }
            else {
                if (isNonKeyModifier(modifier)) {
                    nonKeyModifiers.push(modifier);
                }
                else {
                    keyModifiers.push(modifier);
                }
            }
        }
    }
    return {
        keyModifiers: keyModifiers,
        nonKeyModifiers: nonKeyModifiers,
        eventOptionModifiers: eventOptionModifiers
    };
};
var transformClick = function (key, event) {
    var isStaticClick = (0, compiler_core_1.isStaticExp)(key) && key.content.toLowerCase() === 'onclick';
    return isStaticClick
        ? (0, compiler_core_1.createSimpleExpression)(event, true)
        : key.type !== compiler_core_1.NodeTypes.SIMPLE_EXPRESSION
            ? (0, compiler_core_1.createCompoundExpression)([
                "(",
                key,
                ") === \"onClick\" ? \"".concat(event, "\" : ("),
                key,
                ")"
            ])
            : key;
};
var transformOn = function (dir, node, context) {
    return (0, compiler_core_1.transformOn)(dir, node, context, function (baseResult) {
        var modifiers = dir.modifiers;
        if (!modifiers.length)
            return baseResult;
        var _a = baseResult.props[0], key = _a.key, handlerExp = _a.value;
        var _b = resolveModifiers(key, modifiers, context, dir.loc), keyModifiers = _b.keyModifiers, nonKeyModifiers = _b.nonKeyModifiers, eventOptionModifiers = _b.eventOptionModifiers;
        // normalize click.right and click.middle since they don't actually fire
        if (nonKeyModifiers.includes('right')) {
            key = transformClick(key, "onContextmenu");
        }
        if (nonKeyModifiers.includes('middle')) {
            key = transformClick(key, "onMouseup");
        }
        if (nonKeyModifiers.length) {
            handlerExp = (0, compiler_core_1.createCallExpression)(context.helper(runtimeHelpers_1.V_ON_WITH_MODIFIERS), [
                handlerExp,
                JSON.stringify(nonKeyModifiers)
            ]);
        }
        if (keyModifiers.length &&
            // if event name is dynamic, always wrap with keys guard
            (!(0, compiler_core_1.isStaticExp)(key) || isKeyboardEvent(key.content))) {
            handlerExp = (0, compiler_core_1.createCallExpression)(context.helper(runtimeHelpers_1.V_ON_WITH_KEYS), [
                handlerExp,
                JSON.stringify(keyModifiers)
            ]);
        }
        if (eventOptionModifiers.length) {
            var modifierPostfix = eventOptionModifiers.map(shared_1.capitalize).join('');
            key = (0, compiler_core_1.isStaticExp)(key)
                ? (0, compiler_core_1.createSimpleExpression)("".concat(key.content).concat(modifierPostfix), true)
                : (0, compiler_core_1.createCompoundExpression)(["(", key, ") + \"".concat(modifierPostfix, "\"")]);
        }
        return {
            props: [(0, compiler_core_1.createObjectProperty)(key, handlerExp)]
        };
    });
};
exports.transformOn = transformOn;
