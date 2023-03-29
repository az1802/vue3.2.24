import { isString, hyphenate, capitalize, isArray } from '@vue/shared'
import { camelize } from '@vue/runtime-core'

type Style = string | Record<string, string | string[]> | null

// dom元素style.cssText  可以直接批量操作style属性
export function patchStyle(el: Element, prev: Style, next: Style) {
  const style = (el as HTMLElement).style
  const isCssString = isString(next)
  if (next && !isCssString) { //对象形式的style
    for (const key in next) { //添加新的style样式
      setStyle(style, key, next[key])
    }
    if (prev && !isString(prev)) {//移除不存在的style样式
      for (const key in prev) {
        if (next[key] == null) {
          setStyle(style, key, '')
        }
      }
    }
  } else { //字符串形式的style
    const currentDisplay = style.display
    if (isCssString) {
      if (prev !== next) { //通过style.cssText 属性直接添加样式
        style.cssText = next as string
      }
    } else if (prev) {
      el.removeAttribute('style')
    }
    // indicates that the `display` of the element is controlled by `v-show`,
    // so we always keep the current `display` value regardless of the `style`
    // value, thus handing over control to `v-show`.
    if ('_vod' in el) {
      style.display = currentDisplay
    }
  }
}

const importantRE = /\s*!important$/

// 更新style对象 val是数组 null
function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    val.forEach(v => setStyle(style, name, v))
  } else {
    if (val == null) val = ''
    if (name.startsWith('--')) {
      // custom property definition
      style.setProperty(name, val)
    } else {
      const prefixed = autoPrefix(style, name)
      if (importantRE.test(val)) { //css属性中的!important 进行特别处理
        // !important
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        )
      } else {
        style[prefixed as any] = val
      }
    }
  }
}

const prefixes = ['Webkit', 'Moz', 'ms']
const prefixCache: Record<string, string> = {}

// 部分css属性增加浏览器兼容前缀 style标签内的class t通过postcss可以做前缀添加处理 style方式内联进入的css属性 浏览器前缀窄这里进行处理
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  const cached = prefixCache[rawName]
  if (cached) {
    return cached
  }
  let name = camelize(rawName)
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name)
  }
  name = capitalize(name) //filter 和 不在style的样式属性   会通过前缀的方式进行兼容判断处理
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }
  return rawName
}
