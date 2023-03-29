"use strict";
/* eslint-disable no-restricted-globals */
exports.__esModule = true;
exports.decodeHtmlBrowser = void 0;
var decoder;
// 利用浏览器自身对标签字符串的解析规则对 模板字符串的内容进行处理的处理 避免一些无效的嵌套 比如div标签放置于p标签内的情况
function decodeHtmlBrowser(raw, asAttr) {
    if (asAttr === void 0) { asAttr = false; }
    if (!decoder) {
        decoder = document.createElement('div');
    }
    if (asAttr) {
        decoder.innerHTML = "<div foo=\"".concat(raw.replace(/"/g, '&quot;'), "\">");
        return decoder.children[0].getAttribute('foo');
    }
    else {
        decoder.innerHTML = raw;
        return decoder.textContent;
    }
}
exports.decodeHtmlBrowser = decodeHtmlBrowser;
