import { isArray, isString, isObject, hyphenate } from './'
import { isNoUnitNumericStyleProp } from './domAttrConfig'

export type NormalizedStyle = Record<string, string | number>

// 格式化style属性转换为字符串和对象形式的值
export function normalizeStyle(
  value: unknown
): NormalizedStyle | string | undefined {
  if (isArray(value)) {
    const res: NormalizedStyle = {}
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      const normalized = isString(item)
        ? parseStringStyle(item)
        : (normalizeStyle(item) as NormalizedStyle)
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key]
        }
      }
    }
    return res
  } else if (isString(value)) {
    return value
  } else if (isObject(value)) {
    return value
  }
}

const listDelimiterRE = /;(?![^(]*\))/g
const propertyDelimiterRE = /:(.+)/

// 将string类型的style 转换为对象形式
export function parseStringStyle(cssText: string): NormalizedStyle {
  const ret: NormalizedStyle = {}
  cssText.split(listDelimiterRE).forEach(item => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE)
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return ret
}
// 字符传和对象形式的style统一转换为字符串
export function stringifyStyle(
  styles: NormalizedStyle | string | undefined
): string {
  let ret = ''
  if (!styles || isString(styles)) {
    return ret
  }
  for (const key in styles) {
    const value = styles[key]
    const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key)
    if (
      isString(value) ||
      (typeof value === 'number' && isNoUnitNumericStyleProp(normalizedKey))
    ) {
      // only render valid values
      ret += `${normalizedKey}:${value};`
    }
  }
  return ret
}

// 将string array[string] {ket:classStr}  转换为" "字符连接的字符串
export function normalizeClass(value: unknown): string {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}
// 对props中的class style 属性做格式化处理
export function normalizeProps(props: Record<string, any> | null) {
  if (!props) return null
  let { class: klass, style } = props
  if (klass && !isString(klass)) {
    props.class = normalizeClass(klass)
  }
  if (style) {
    props.style = normalizeStyle(style)
  }
  return props
}
