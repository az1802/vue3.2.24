"use strict";
exports.__esModule = true;
exports.transformTransition = void 0;
var compiler_core_1 = require("@vue/compiler-core");
var runtimeHelpers_1 = require("../runtimeHelpers");
var errors_1 = require("../errors");
var transformTransition = function (node, context) {
    if (node.type === compiler_core_1.NodeTypes.ELEMENT &&
        node.tagType === compiler_core_1.ElementTypes.COMPONENT) {
        var component = context.isBuiltInComponent(node.tag);
        if (component === runtimeHelpers_1.TRANSITION) {
            return function () {
                if (!node.children.length) {
                    return;
                }
                // warn multiple transition children
                if (hasMultipleChildren(node)) {
                    context.onError((0, errors_1.createDOMCompilerError)(errors_1.DOMErrorCodes.X_TRANSITION_INVALID_CHILDREN, {
                        start: node.children[0].loc.start,
                        end: node.children[node.children.length - 1].loc.end,
                        source: ''
                    }));
                }
                // check if it's s single child w/ v-show
                // if yes, inject "persisted: true" to the transition props
                var child = node.children[0];
                if (child.type === compiler_core_1.NodeTypes.ELEMENT) {
                    for (var _i = 0, _a = child.props; _i < _a.length; _i++) {
                        var p = _a[_i];
                        if (p.type === compiler_core_1.NodeTypes.DIRECTIVE && p.name === 'show') {
                            node.props.push({
                                type: compiler_core_1.NodeTypes.ATTRIBUTE,
                                name: 'persisted',
                                value: undefined,
                                loc: node.loc
                            });
                        }
                    }
                }
            };
        }
    }
};
exports.transformTransition = transformTransition;
function hasMultipleChildren(node) {
    // #1352 filter out potential comment nodes.
    var children = (node.children = node.children.filter(function (c) {
        return c.type !== compiler_core_1.NodeTypes.COMMENT &&
            !(c.type === compiler_core_1.NodeTypes.TEXT && !c.content.trim());
    }));
    var child = children[0];
    return (children.length !== 1 ||
        child.type === compiler_core_1.NodeTypes.FOR ||
        (child.type === compiler_core_1.NodeTypes.IF && child.branches.some(hasMultipleChildren)));
}
