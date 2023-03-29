import {
  isArray,
  isMap,
  isObject,
  isFunction,
  isPlainObject,
  isSet,
  objectToString,
  isString
} from './index'

/**
 * For converting {{ interpolation }} values to displayed strings.
 * 数组和对象 转化为json 字符串输出
 * @private
 */
export const toDisplayString = (val: unknown): string => {
  return isString(val)
    ? val
    : val == null
    ? ''
    : isArray(val) ||
      (isObject(val) &&
        (val.toString === objectToString || !isFunction(val.toString)))
    ? JSON.stringify(val, replacer, 2)
    : String(val)
}

// JSON 序列化时针对map set ref object 采取不同形式的输出
const replacer = (_key: string, val: any): any => {
  // can't use isRef here since @vue/shared has no deps
  if (val && val.__v_isRef) {
    return replacer(_key, val.value)
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce((entries, [key, val]) => {
        ;(entries as any)[`${key} =>`] = val
        return entries
      }, {})
    }
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()]
    }
  } else if (isObject(val) && !isArray(val) && !isPlainObject(val)) {
    return String(val)
  }
  return val
}
