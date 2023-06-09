"use strict";
exports.__esModule = true;
exports.decodeHtml = void 0;
var namedChars_json_1 = require("./namedChars.json");
// lazy compute this to make this file tree-shakable for browser
var maxCRNameLength;
var decodeHtml = function (rawText, asAttr) {
    var offset = 0;
    var end = rawText.length;
    var decodedText = '';
    function advance(length) {
        offset += length;
        rawText = rawText.slice(length);
    }
    while (offset < end) {
        var head = /&(?:#x?)?/i.exec(rawText);
        if (!head || offset + head.index >= end) {
            var remaining = end - offset;
            decodedText += rawText.slice(0, remaining);
            advance(remaining);
            break;
        }
        // Advance to the "&".
        decodedText += rawText.slice(0, head.index);
        advance(head.index);
        if (head[0] === '&') {
            // Named character reference.
            var name_1 = '';
            var value = undefined;
            if (/[0-9a-z]/i.test(rawText[1])) {
                if (!maxCRNameLength) {
                    maxCRNameLength = Object.keys(namedChars_json_1["default"]).reduce(function (max, name) { return Math.max(max, name.length); }, 0);
                }
                for (var length_1 = maxCRNameLength; !value && length_1 > 0; --length_1) {
                    name_1 = rawText.slice(1, 1 + length_1);
                    value = namedChars_json_1["default"][name_1];
                }
                if (value) {
                    var semi = name_1.endsWith(';');
                    if (asAttr &&
                        !semi &&
                        /[=a-z0-9]/i.test(rawText[name_1.length + 1] || '')) {
                        decodedText += '&' + name_1;
                        advance(1 + name_1.length);
                    }
                    else {
                        decodedText += value;
                        advance(1 + name_1.length);
                    }
                }
                else {
                    decodedText += '&' + name_1;
                    advance(1 + name_1.length);
                }
            }
            else {
                decodedText += '&';
                advance(1);
            }
        }
        else {
            // Numeric character reference.
            var hex = head[0] === '&#x';
            var pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/;
            var body = pattern.exec(rawText);
            if (!body) {
                decodedText += head[0];
                advance(head[0].length);
            }
            else {
                // https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
                var cp = Number.parseInt(body[1], hex ? 16 : 10);
                if (cp === 0) {
                    cp = 0xfffd;
                }
                else if (cp > 0x10ffff) {
                    cp = 0xfffd;
                }
                else if (cp >= 0xd800 && cp <= 0xdfff) {
                    cp = 0xfffd;
                }
                else if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
                    // noop
                }
                else if ((cp >= 0x01 && cp <= 0x08) ||
                    cp === 0x0b ||
                    (cp >= 0x0d && cp <= 0x1f) ||
                    (cp >= 0x7f && cp <= 0x9f)) {
                    cp = CCR_REPLACEMENTS[cp] || cp;
                }
                decodedText += String.fromCodePoint(cp);
                advance(body[0].length);
            }
        }
    }
    return decodedText;
};
exports.decodeHtml = decodeHtml;
// https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
var CCR_REPLACEMENTS = {
    0x80: 0x20ac,
    0x82: 0x201a,
    0x83: 0x0192,
    0x84: 0x201e,
    0x85: 0x2026,
    0x86: 0x2020,
    0x87: 0x2021,
    0x88: 0x02c6,
    0x89: 0x2030,
    0x8a: 0x0160,
    0x8b: 0x2039,
    0x8c: 0x0152,
    0x8e: 0x017d,
    0x91: 0x2018,
    0x92: 0x2019,
    0x93: 0x201c,
    0x94: 0x201d,
    0x95: 0x2022,
    0x96: 0x2013,
    0x97: 0x2014,
    0x98: 0x02dc,
    0x99: 0x2122,
    0x9a: 0x0161,
    0x9b: 0x203a,
    0x9c: 0x0153,
    0x9e: 0x017e,
    0x9f: 0x0178
};
