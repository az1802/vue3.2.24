import { TrackOpTypes, TriggerOpTypes } from './operations'
import { extend, isArray, isIntegerKey, isMap } from '@vue/shared'
import { EffectScope, recordEffectScope } from './effectScope'
import {
  createDep,
  Dep,
  finalizeDepMarkers,
  initDepMarkers,
  newTracked,
  wasTracked
} from './dep'
import { ComputedRefImpl } from './computed'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>() //存放  target key 对应的dep对象 track时生成并收集effect trigger时取出执行

// The number of effects currently being tracked recursively.
// 用于记录位于响应上下文中的effect嵌套层次数
let effectTrackDepth = 0

// 二进制位，每一位用于标识当前effect嵌套层级的依赖收集的启用状态
export let trackOpBit = 1

/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 * 表示最大标记的位数
 */
const maxMarkerBits = 30

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

// 当前活跃的effect
export let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')


// dep与effect是多对多的关系  响应式数据发生更新时,运行effect执行相关副作用函数
export class ReactiveEffect<T = any> {
  active = true  // 用于标识副作用函数是否位于响应式上下文中被执行
  deps: Dep[] = []  // 副作用函数持有它所在的所有依赖集合的引用，用于从这些依赖集合删除自身
  parent: ReactiveEffect | undefined = undefined  //TODO 指针为，用于嵌套 effect 执行后动态切换 activeEffect

  /**
   * Can be attached after creation
   * @internal
   */
  computed?: ComputedRefImpl<T>
  /**
   * @internal
   */
  allowRecurse?: boolean //是否自身调用的标识
  /**
   * @internal
   */
  private deferStop?: boolean //延迟运行stop

  onStop?: () => void
  // dev only  会很影响性能,所以生产环境不适用
  onTrack?: (event: DebuggerEvent) => void //跟踪依赖的记录
  // dev only
  onTrigger?: (event: DebuggerEvent) => void //跟踪依赖的触发,这里面做过多复杂的操作可能会严重影响性能

  constructor(
    public fn: () => T, //运行fn track动作进行相关依赖收集
    public scheduler: EffectScheduler | null = null, //TODO 自定义effect的调度行为,与直接运行fn函数的区别
    scope?: EffectScope
  ) {
    this.fn = fn;
    this.scheduler = scheduler;
    recordEffectScope(this, scope) //scope.effects.push(this)
  }

  run() {
    if (!this.active) { //若当前 ReactiveEffect 对象脱离响应式上下文,那么其对应的副作用函数被执行时不会再收集依赖
      return this.fn()
    }
    // 注意this.parent 当前effect运行时的前一effet 与 局部变量parent 为了避免重复effect的运行
    let parent: ReactiveEffect | undefined = activeEffect
    let lastShouldTrack = shouldTrack //缓存上一个effect运行时shouldTrack的状态,
    while (parent) { // TODOparent 主要为scopeEffect服务,避免父级effect重新运行
      if (parent === this) {
        return
      }
      parent = parent.parent
    }
    try {
      this.parent = activeEffect//effect嵌套使用时,parent存储父级的effect对象,当子effect执行完之后activeEffect可以恢复到正确的值
      activeEffect = this
      shouldTrack = true

      trackOpBit = 1 << ++effectTrackDepth //新的标记位 表示effect


      if (effectTrackDepth <= maxMarkerBits) { //避免依赖的递归收集,形成死循环
        initDepMarkers(this)//effect其相关的effect中的dep也对该effect进行收集,这样形成一个依赖的链条,触发的时候也可以进行相关的依赖触发
      } else {
        cleanupEffect(this) //当前effect形成了多方互相依赖,清除当前effect相关的dep
      }
      return this.fn() //fn函数内可能嵌套effect,嵌套的effect运行时外层effect.parent指向子effect
    } finally {
      if (effectTrackDepth <= maxMarkerBits) {
        finalizeDepMarkers(this)// 用于对曾经跟踪过，但本次副作用函数执行时没有跟踪的依赖采取删除操作。新跟踪的 和 本轮跟踪过的都会被保留
      }

      trackOpBit = 1 << --effectTrackDepth // << --effectTrackDepth 右移动 effectTrackDepth 位

      activeEffect = this.parent
      shouldTrack = lastShouldTrack
      this.parent = undefined

      if (this.deferStop) { //延迟处理effect.stop
        this.stop()
      }
    }
  }

  stop() {
    // stopped while running itself - defer the cleanup
    if (activeEffect === this) { //当前正在运行的effect需要stop会先更改deferStop标志,当run函数运行到末尾时,再进行stop
      this.deferStop = true
    } else if (this.active) {
      cleanupEffect(this)
      if (this.onStop) {
        this.onStop()
      }
      this.active = false
    }
  }
}

//相关的所有dep中移除effect自身
function cleanupEffect(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) { // TODO 为什么采用这种方式进行deps 队列的情况  此处也未清除dep中 effect中存储的此dep对象
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

// 通过tack trigger可以跟踪依赖的收集和触发
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

// 传入附中用fn返回effect运行函数
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner {
  if ((fn as ReactiveEffectRunner).effect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const _effect = new ReactiveEffect(fn)
  if (options) {
    extend(_effect, options)
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  if (!options || !options.lazy) { //大多数使用时是直接运行副作用函数,lazy默认为false
    _effect.run()
  }

  // runner函数关联了effect值,当runner被再次传入到effect时便有了函数开头的处理,提取fn
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect
  return runner
}

export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}

export let shouldTrack = true
const trackStack: boolean[] = []

// 利用一个栈来保shouldTrack的状态,pauseTracking,enableTrackingenableTracking需要和resetTracking成对的出现,否则最后执行完栈可能非空出现错误
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

// 重置track为上一个状态
export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

// 对target构建一个map对象 对 target key 构建一个对应的dep set队列,懒加载没有则创建dep set队列
export function track(target: object, type: TrackOpTypes, key: unknown) {
  if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }

    //可以跟踪track的记录信息
    const eventInfo = __DEV__
      ? { effect: activeEffect, target, type, key }
      : undefined

    trackEffects(dep, eventInfo)
  }
}

// dep队列中添加effect对象互相记录关联,多个effects会被包装为一个dep进行处理
export function trackEffects(
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo //开发环境中会有相信的 依赖相关信息
) {
  let shouldTrack = false
  if (effectTrackDepth <= maxMarkerBits) {
    if (!newTracked(dep)) { //dep.n中还未收集该effect
      // 每一个effect 追踪开始前trackOpBit 左移动一位 形成一个独特的标识位 结束时右移动一位 effect回到前一个未处理的effect
      dep.n |= trackOpBit // set newly tracked
      shouldTrack = !wasTracked(dep) //dep旧的effect队列中已经存在该effect
    }
  } else { //TODO 超出深度范围时 已经相互添加依赖之后不会重复处理
    // Full cleanup mode.
    shouldTrack = !dep.has(activeEffect!)
  }

  if (shouldTrack) {
    // dep 与 effect 互相订阅添加各自的依赖关系
    dep.add(activeEffect!)
    activeEffect!.deps.push(dep)
    if (__DEV__ && activeEffect!.onTrack) {//开发环境中可以添加自定义的依赖跟踪调试信息
      activeEffect!.onTrack({
        effect: activeEffect!,
        ...debuggerEventExtraInfo!
      })
    }
  }
}

// 获取target key 对应的dep对象 然后执行里面的effect
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  let deps: (Dep | undefined)[] = [] //存储需要进行相关更新的dep
  if (type === TriggerOpTypes.CLEAR) { //清楚操作,所有key的effect都要执行
    // collection being cleared
    // trigger all effects for target
    deps = [...depsMap.values()]
  } else if (key === 'length' && isArray(target)) { // 改变数组length 会使得length后面的数组项的dep都进行处理
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        deps.push(dep)
      }
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    if (key !== void 0) {//普通对象这里就会进行依赖的收集
      deps.push(depsMap.get(key))
    }

    // also run for iteration key on ADD | DELETE | Map.SET
    //  ITERATE_KEY MAP_KEY_ITERATE_KEY是对对象进行了迭代操作这里也需要进行dep的处理
    switch (type) {
      //ADD DELETE
      case TriggerOpTypes.ADD:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } else if (isIntegerKey(key)) {//数组push,pop,unshift,shift,splice会引起length的变化触发trigger
          // new index added to array -> length changes
          deps.push(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET://对象的处理方式i map设置值
        if (isMap(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }

  const eventInfo = __DEV__
    ? { target, type, key, newValue, oldValue, oldTarget }
    : undefined

  if (deps.length === 1) {
    if (deps[0]) {
      if (__DEV__) {
        triggerEffects(deps[0], eventInfo)
      } else {
        triggerEffects(deps[0])
      }
    }
  } else {
    // 将dep队列中的effect取出,然后集中到一个dep里面 再调度执行所有effect,这里相同的effect会在createDep中被处理
    const effects: ReactiveEffect[] = []
    for (const dep of deps) {
      if (dep) {
        effects.push(...dep)
      }
    }
    //dep是set对象所以会自动进行去重
    if (__DEV__) {
      triggerEffects(createDep(effects), eventInfo)
    } else {
      triggerEffects(createDep(effects))//createDep返回的dep对象会将effect去重
    }
  }
}

// 调度执行所有的effect对象
export function triggerEffects(
  dep: Dep | ReactiveEffect[],
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // spread into array for stabilization
  const effects = isArray(dep) ? dep : [...dep]
  // !先处理所有计算属性effect,计算属性和data一样属于数据级别 后续的render函数,watchEffect可能会使用到,如果不先处理后续采用的值可能不是最新值
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
}

// 单个effect的调度执行
function triggerEffect(
  effect: ReactiveEffect,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // effect === activeEffect时 若允许allowRecurse 才会运行effect 调度函数
  if (effect !== activeEffect || effect.allowRecurse) {
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo))
    }

    //运行副作用函数,renderEffect 会有自己的scheduler:() => queueJob(update),
    if (effect.scheduler) {
      effect.scheduler()
    } else {//同步运行
      effect.run()
    }
  }
}
