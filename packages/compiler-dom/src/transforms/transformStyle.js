"use strict";
exports.__esModule = true;
exports.transformStyle = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var shared_1 = require("@vue/shared");
// Parse inline CSS strings for static style attributes into an object.
// This is a NodeTransform since it works on the static `style` attribute and
// converts it into a dynamic equivalent:
// style="color: red" -> :style='{ "color": "red" }'
// It is then processed by `transformElement` and included in the generated
// props.
var transformStyle = function (node) {
    if (node.type === compiler_core_1.NodeTypes.ELEMENT) {
        node.props.forEach(function (p, i) {
            if (p.type === compiler_core_1.NodeTypes.ATTRIBUTE && p.name === 'style' && p.value) {
                // replace p with an expression node
                node.props[i] = {
                    type: compiler_core_1.NodeTypes.DIRECTIVE,
                    name: "bind",
                    arg: (0, compiler_core_1.createSimpleExpression)("style", true, p.loc),
                    exp: parseInlineCSS(p.value.content, p.loc),
                    modifiers: [],
                    loc: p.loc
                };
            }
        });
    }
};
exports.transformStyle = transformStyle;
var parseInlineCSS = function (cssText, loc) {
    var normalized = (0, shared_1.parseStringStyle)(cssText);
    return (0, compiler_core_1.createSimpleExpression)(JSON.stringify(normalized), false, loc, compiler_core_1.ConstantTypes.CAN_STRINGIFY);
};
