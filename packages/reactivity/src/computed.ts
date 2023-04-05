import { DebuggerOptions, ReactiveEffect } from './effect'
import { Ref, trackRefValue, triggerRefValue } from './ref'
import { isFunction, NOOP } from '@vue/shared'
import { ReactiveFlags, toRaw } from './reactive'
import { Dep } from './dep'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (...args: any[]) => T
export type ComputedSetter<T> = (v: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}

export class ComputedRefImpl<T> {
  public dep?: Dep = undefined

  private _value!: T
  public readonly effect: ReactiveEffect<T>

  public readonly __v_isRef = true
  public readonly [ReactiveFlags.IS_READONLY]: boolean

  public _dirty = true //脏数据的开关 当依赖的值变化时为true 表示再次get时需要重新对值进行计算,否则一直使用缓存的值
  public _cacheable: boolean //是否可以缓存值,SSR模式下不做值的缓存

  constructor(
    getter: ComputedGetter<T>, //getter 函数
    private readonly _setter: ComputedSetter<T>, //setter 函数
    isReadonly: boolean, //只读
    isSSR: boolean
  ) {
    // 当computed effect订阅的dep(即对应的依赖值发生变化)触发triggerEffect,会执行传入的scheduler函数,同时标记computed为脏数据,
    // triggerRefValue继续传递变化,订阅此computed dep的订阅effect也会相应触发更新
    // 只要依赖的值发生变化就会触发,并不会更具computed返回的值不变而不触发更新
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._dirty) {
        this._dirty = true//更改标记位,后续再获取computed value 重新触发副作用函数,重新计算该值
        triggerRefValue(this);
      }
    })
    this.effect.computed = this //保证computed effect会优先于其他普通副作用函数先执行
    this.effect.active = this._cacheable = !isSSR //TODO 服务端渲染不可缓存计算属性
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }

  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    const self = toRaw(this)
    trackRefValue(self) //创建对应的dep对象并与effect互相关联
    if (self._dirty || !self._cacheable) {//没有缓存或者依赖发生变化时,重新运行effect函数得到新的值
      self._dirty = false
      self._value = self.effect.run()! //执行getter函数,返回新的值 同时activeEffect变为self ,computed内的依赖值与改effect互相订阅
    }
    return self._value
  }

  set value(newValue: T) {
    this._setter(newValue)
  }
}

export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions
): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>

  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
