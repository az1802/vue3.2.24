import { VNode, VNodeChild } from '../vnode'
import { isArray, isString, isObject } from '@vue/shared'
import { warn } from '../warning'

/**
 * v-for string
 * @private
 */
export function renderList(
  source: string,
  renderItem: (value: string, index: number) => VNodeChild
): VNodeChild[]

/**
 * v-for number
 */
export function renderList(
  source: number,
  renderItem: (value: number, index: number) => VNodeChild
): VNodeChild[]

/**
 * v-for array
 */
export function renderList<T>(
  source: T[],
  renderItem: (value: T, index: number) => VNodeChild
): VNodeChild[]

/**
 * v-for iterable
 */
export function renderList<T>(
  source: Iterable<T>,
  renderItem: (value: T, index: number) => VNodeChild
): VNodeChild[]

/**
 * v-for object
 */
export function renderList<T>(
  source: T,
  renderItem: <K extends keyof T>(
    value: T[K],
    key: K,
    index: number
  ) => VNodeChild
): VNodeChild[]

/**
 * Actual implementation
 */
export function renderList(
  source: any, //v-for 循环的数组
  renderItem: (...args: any[]) => VNodeChild, //单独每个元素的render函数
  cache?: any[], //TODO 更新时缓存的vnode节点
  index?: number
): VNodeChild[] {
  let ret: VNodeChild[]
  const cached = (cache && cache[index!]) as VNode[] | undefined

  if (isArray(source) || isString(source)) { //字符串也会被当做数组处理
    ret = new Array(source.length)
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(source[i], i, undefined, cached && cached[i])
    }
  } else if (typeof source === 'number') { //数字会从0开始循环
    if (__DEV__ && !Number.isInteger(source)) {
      warn(`The v-for range expect an integer value but got ${source}.`)
    }
    ret = new Array(source)
    for (let i = 0; i < source; i++) {
      ret[i] = renderItem(i + 1, i, undefined, cached && cached[i])
    }
  } else if (isObject(source)) {//优先使用Symbol.iterator进行遍历
    if (source[Symbol.iterator as any]) {
      ret = Array.from(source as Iterable<any>, (item, i) =>
        renderItem(item, i, undefined, cached && cached[i])
      )
    } else {
      const keys = Object.keys(source)
      ret = new Array(keys.length)
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        ret[i] = renderItem(source[key], key, i, cached && cached[i])
      }
    }
  } else {
    ret = []
  }

  if (cache) {
    cache[index!] = ret
  }
  return ret
}
