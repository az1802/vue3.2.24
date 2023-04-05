import { isFunction } from '@vue/shared'
import { currentInstance } from './component'
import { currentRenderingInstance } from './componentRenderContext'
import { warn } from './warning'

export interface InjectionKey<T> extends Symbol {}

// 默认实例从父级继承provides ,当组件自身需要使用provide提供值时,以父级provides为原型创建新的provides对象
export function provide<T>(key: InjectionKey<T> | string | number, value: T) {
  if (!currentInstance) {
    if (__DEV__) {
      warn(`provide() can only be used inside setup().`)
    }
  } else {
    let provides = currentInstance.provides
    // by default an instance inherits its parent's provides object
    // but when it needs to provide values of its own, it creates its
    // own provides object using parent provides object as prototype.
    // this way in `inject` we can simply look up injections from direct
    // parent and let the prototype chain do the work.
    // 默认组件实例继承父组件实例对象的provides object 当自己需要provide时则创建新的provides对象,然后再进行添加,因此给予原型链的向上查找,相同的key会使用离自己最近的父组件
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {//如果当前组件有对外提供provide则基于parentProvides为原型构造一个新的对象,这样后代组件使用时会沿着原型链向父级查找对应的key
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    // TS doesn't allow symbol as index type
    provides[key as string] = value
  }
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T,
  treatDefaultAsFactory?: false
): T
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T | (() => T),
  treatDefaultAsFactory: true
): T
export function inject(
  key: InjectionKey<any> | string,
  defaultValue?: unknown,
  treatDefaultAsFactory = false //默认值是否使用工厂函数生成
) {
  // fallback to `currentRenderingInstance` so that this can be called in
  // a functional component
   // 获取当前组件实例
  const instance = currentInstance || currentRenderingInstance
  if (instance) {
    // #2400
    // to support `app.use` plugins,
    // fallback to appContext's `provides` if the instance is at root
      // 获取父组件上的 provides 对象
    const provides =
      instance.parent == null
        ? instance.vnode.appContext && instance.vnode.appContext.provides
        : instance.parent.provides

    if (provides && (key as string | symbol) in provides) { // 如果能取到，则返回值
      // TS doesn't allow symbol as index type
      return provides[key as string]
    } else if (arguments.length > 1) { //存在默认值的情况处理
      return treatDefaultAsFactory && isFunction(defaultValue)
        ? defaultValue.call(instance.proxy)
        : defaultValue
    } else if (__DEV__) {
      warn(`injection "${String(key)}" not found.`)
    }
  } else if (__DEV__) { //options形式的组件此时还没有组件实例对象
    warn(`inject() can only be used inside setup() or functional components.`)
  }
}
