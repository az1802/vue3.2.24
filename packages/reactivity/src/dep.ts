import { ReactiveEffect, trackOpBit } from './effect'

export type Dep = Set<ReactiveEffect> & TrackedMarkers

/**
 * wasTracked and newTracked maintain the status for several levels of effect
 * tracking recursion. One bit per level is used to define whether the dependency
 * was/is tracked.
 */
type TrackedMarkers = {
  /**
   * wasTracked 已经记录的effect
   */
  w: number
  /**
   * newTracked 新记录的effect
   */
  n: number
}

// dep对象为一个set队列用来存储effects副作K)用列表
export const createDep = (effects?: ReactiveEffect[]): Dep => {
  const dep = new Set<ReactiveEffect>(effects) as Dep //这里使用set会对相同的effect对象进行去重
  dep.w = 0 //通过与位的&操作,存储dep对象已经关联的effect对象
  dep.n = 0 //通过与位的&操作,存储dep对象新关联的effect对象
  return dep
}

// dep中旧的effect 中是否包含当前处理的effect
export const wasTracked = (dep: Dep): boolean => (dep.w & trackOpBit) > 0//表明dep之前已经添加过trackOpBit

// dep中新的effect收集是否包含当前处理的effect
export const newTracked = (dep: Dep): boolean => (dep.n & trackOpBit) > 0 //表明dep之前没有添加过trackOpBit 属于新的track
export const initDepMarkers = ({ deps }: ReactiveEffect) => {
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].w |= trackOpBit // set was tracked dep上标记这个effect,便于后续与new track做对比,然后更新dep
    }
  }
}

// 重新调整effect 对应的依赖
// 重新运行render函数时有些dep可能暂时移除不需要了,所以需要重新对effects中的dep进行调整
export const finalizeDepMarkers = (effect: ReactiveEffect) => {
  const { deps } = effect
  if (deps.length) {
    let ptr = 0
    // fn运行完毕 track完毕之后,循环dep,移除不再与effect关联的dep
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i]
      if (wasTracked(dep) && !newTracked(dep)) { //更新effect的deps(如if else会产生新的订阅者,旧的订阅者更新则不应该触发更新)
        dep.delete(effect)
      } else {
        deps[ptr++] = dep //dep前移保持与该effect的联系
      }
      //clear bits
      // 因为trackOpBit只是临时表示当前effect,当前effect fn运行完毕之后,此trackOpBit失效需要再dep中进行记录的清除
      // w,n只是中间dep与effect建立联系的临时使用的数据标记,处理完毕之后移除改trackOpBit位便于后续trackOpBit的正确使用
      dep.w &= ~trackOpBit
      dep.n &= ~trackOpBit
    }
    deps.length = ptr //这里直接更新length  后面多余的dep对象会被自动移除
  }
}
