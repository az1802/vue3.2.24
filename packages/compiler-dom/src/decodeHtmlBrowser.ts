/* eslint-disable no-restricted-globals */

let decoder: HTMLDivElement

// 利用浏览器自身对标签字符串的解析规则对 模板字符串的内容进行处理的处理 避免一些无效的嵌套 比如div标签放置于p标签内的情况
export function decodeHtmlBrowser(raw: string, asAttr = false): string {
  if (!decoder) {
    decoder = document.createElement('div')
  }
  if (asAttr) {
    decoder.innerHTML = `<div foo="${raw.replace(/"/g, '&quot;')}">`
    return decoder.children[0].getAttribute('foo') as string
  } else {
    decoder.innerHTML = raw
    return decoder.textContent as string
  }
}
