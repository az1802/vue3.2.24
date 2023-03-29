"use strict";
var _a;
exports.__esModule = true;
exports.TRANSITION_GROUP = exports.TRANSITION = exports.V_SHOW = exports.V_ON_WITH_KEYS = exports.V_ON_WITH_MODIFIERS = exports.V_MODEL_DYNAMIC = exports.V_MODEL_SELECT = exports.V_MODEL_TEXT = exports.V_MODEL_CHECKBOX = exports.V_MODEL_RADIO = void 0;
var compiler_core_1 = require("@vue/compiler-core");
exports.V_MODEL_RADIO = Symbol(__DEV__ ? "vModelRadio" : "");
exports.V_MODEL_CHECKBOX = Symbol(__DEV__ ? "vModelCheckbox" : "");
exports.V_MODEL_TEXT = Symbol(__DEV__ ? "vModelText" : "");
exports.V_MODEL_SELECT = Symbol(__DEV__ ? "vModelSelect" : "");
exports.V_MODEL_DYNAMIC = Symbol(__DEV__ ? "vModelDynamic" : "");
exports.V_ON_WITH_MODIFIERS = Symbol(__DEV__ ? "vOnModifiersGuard" : "");
exports.V_ON_WITH_KEYS = Symbol(__DEV__ ? "vOnKeysGuard" : "");
exports.V_SHOW = Symbol(__DEV__ ? "vShow" : "");
exports.TRANSITION = Symbol(__DEV__ ? "Transition" : "");
exports.TRANSITION_GROUP = Symbol(__DEV__ ? "TransitionGroup" : "");
(0, compiler_core_1.registerRuntimeHelpers)((_a = {},
    _a[exports.V_MODEL_RADIO] = "vModelRadio",
    _a[exports.V_MODEL_CHECKBOX] = "vModelCheckbox",
    _a[exports.V_MODEL_TEXT] = "vModelText",
    _a[exports.V_MODEL_SELECT] = "vModelSelect",
    _a[exports.V_MODEL_DYNAMIC] = "vModelDynamic",
    _a[exports.V_ON_WITH_MODIFIERS] = "withModifiers",
    _a[exports.V_ON_WITH_KEYS] = "withKeys",
    _a[exports.V_SHOW] = "vShow",
    _a[exports.TRANSITION] = "Transition",
    _a[exports.TRANSITION_GROUP] = "TransitionGroup",
    _a));
