import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import { isArray, NOOP } from '@vue/shared'
import { ComponentInternalInstance, getComponentName } from './component'
import { warn } from './warning'

export interface SchedulerJob extends Function {
  id?: number
  active?: boolean
  computed?: boolean
  /**
   * Indicates whether the effect is allowed to recursively trigger itself
   * when managed by the scheduler.
   *
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   */
  allowRecurse?: boolean
  /**
   * Attached by renderer.ts when setting up a component's render effect
   * Used to obtain component information when reporting max recursive updates.
   * dev only.
   */
  ownerInstance?: ComponentInternalInstance
}

export type SchedulerJobs = SchedulerJob | SchedulerJob[]

let isFlushing = false //正在执行job
let isFlushPending = false

const queue: SchedulerJob[] = [] //调度任务列表
let flushIndex = 0

const pendingPreFlushCbs: SchedulerJob[] = []
let activePreFlushCbs: SchedulerJob[] | null = null
let preFlushIndex = 0

const pendingPostFlushCbs: SchedulerJob[] = []
let activePostFlushCbs: SchedulerJob[] | null = null
let postFlushIndex = 0

const resolvedPromise = /*#__PURE__*/ Promise.resolve() as Promise<any>
let currentFlushPromise: Promise<void> | null = null

let currentPreFlushParentJob: SchedulerJob | null = null

const RECURSION_LIMIT = 100
type CountMap = Map<SchedulerJob, number>

// currentFlushPromise 存在的时候 会将任务当前处理队列的最后 这样会在组件更新任务完全执行完成了 处理新的任务
export function nextTick<T = void>(
  this: T,
  fn?: (this: T) => void
): Promise<void> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

// #2768
// Use binary-search to find a suitable position in the queue,
// so that the queue maintains the increasing order of job's id,
// which can prevent the job from being skipped and also can avoid repeated patching.
// 根据job id使用二分法查找job 所在位置
function findInsertionIndex(id: number) {
  // the start index should be `flushIndex + 1`
  let start = flushIndex + 1
  let end = queue.length

  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJobId = getId(queue[middle])
    middleJobId < id ? (start = middle + 1) : (end = middle)
  }

  return start
}

export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  // 根据job id 找到对应的位置进行插入 先处理子组件的effect  再处理父组件的effect
  // 当父组件更新导致子组件更新,子组件打破单向
  // isFlushing && job.allowRecurse 说就是当队列正处于更新状态中（isFlushing = true） 且允许递归调用（ job.allowRecurse = true）时，将搜索起始位置加一，无法搜索到自身，也就是允许递归调用了。
  if (
    (!queue.length ||
      !queue.includes( //去重判断,多次触发组件的更新时,只会有一个更新job放入到队列之中
        job,
        isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex
      )) &&
    job !== currentPreFlushParentJob
  ) {
    // 添加到队列尾部
    if (job.id == null) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(job.id), 0, job) //按照 job id 自增的顺序添加 保证父组件永远比子组件先更新
    }
    queueFlush() //没有任务在处理的时候会直接执行队列任务,每次加入job就会进行检查
  }
}

// 队列并未开始已执行时 将flushJobs 放入到微任务中
// vue 3 完全抛弃了除了 promise 之外的异步方案，不再支持vue 2 的 Promise > MutationObserver > setImmediate > setTimeout 其他三种异步操作了。
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs) //放入微任务队列
  }
}

// job在队列中且还未运行时,将job从队列中移出
export function invalidateJob(job: SchedulerJob) {
  const i = queue.indexOf(job)
  if (i > flushIndex) {
    queue.splice(i, 1)
  }
}

function queueCb(
  cb: SchedulerJobs,
  activeQueue: SchedulerJob[] | null,
  pendingQueue: SchedulerJob[],
  index: number
) {
  if (!isArray(cb)) {
    if (
      !activeQueue ||
      !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)
    ) {
      pendingQueue.push(cb)
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    pendingQueue.push(...cb)
  }
  queueFlush()
}

export function queuePreFlushCb(cb: SchedulerJob) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex)
}

export function queuePostFlushCb(cb: SchedulerJobs) {
  queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex)
}

// 递归清楚pre类型的回调任务
export function flushPreFlushCbs(
  seen?: CountMap,
  parentJob: SchedulerJob | null = null
) {
  if (pendingPreFlushCbs.length) {
    currentPreFlushParentJob = parentJob
    activePreFlushCbs = [...new Set(pendingPreFlushCbs)]
    pendingPreFlushCbs.length = 0
    if (__DEV__) {
      seen = seen || new Map()
    }
    for (
      preFlushIndex = 0;
      preFlushIndex < activePreFlushCbs.length;
      preFlushIndex++
    ) {
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePreFlushCbs[preFlushIndex])
      ) {
        continue
      }
      activePreFlushCbs[preFlushIndex]()
    }
    activePreFlushCbs = null
    preFlushIndex = 0
    currentPreFlushParentJob = null
    // recursively flush until it drains 递归调用,处理完所有pre类型任务
    flushPreFlushCbs(seen, parentJob)
  }
}

// 清除类型为post的回调任务(一些需要渲染完成后再执行的钩子函数都会在这个阶段执行，比如 mounted hook 等等。)
export function flushPostFlushCbs(seen?: CountMap) {
  // flush any pre cbs queued during the flush (e.g. pre watchers)
  flushPreFlushCbs()
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)]
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    // 已经存在activePostFlushCbs,则将任务放入运行中的队列中,等待队列循环到后续执行
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }

    activePostFlushCbs = deduped
    if (__DEV__) {
      seen = seen || new Map()
    }

    activePostFlushCbs.sort((a, b) => getId(a) - getId(b))

    // 循环执行job
    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length; //activePostFlushCbs.length 会存在动态变化的可能,所以必须使用数组length
      postFlushIndex++
    ) {
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePostFlushCbs[postFlushIndex])
      ) {
        continue
      }
      activePostFlushCbs[postFlushIndex]()
    }
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

const getId = (job: SchedulerJob): number =>
  job.id == null ? Infinity : job.id

// 顺序执行队列任务
function flushJobs(seen?: CountMap) {
  isFlushPending = false //是否等待执行
  isFlushing = true //正在执行
  if (__DEV__) {
    seen = seen || new Map()
  }

  flushPreFlushCbs(seen) //清空pre队列

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.

  // 在更新前，重新排序好更新队列 queue 的顺序
  // 这确保了:
  // 1. 组件都是从父组件向子组件进行更新的。（因为父组件都在子组件之前创建的
  // 所以子组件的渲染的 effect 的优先级比较低）
  // 2. 如果父组件在更新前卸载了组件，这次更新将会被跳过。
  queue.sort((a, b) => getId(a) - getId(b))

  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job && job.active !== false) { //job.active !== false 来剔除被 unmount 卸载的组件，卸载的组件会有 active = false 的标记。
        if (__DEV__ && check(job)) {
          continue
        }
        // console.log(`running:`, job.id)
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    flushIndex = 0
    queue.length = 0

    flushPostFlushCbs(seen)  // 执行后置队列任务

    isFlushing = false
    currentFlushPromise = null //充值当前微任务为null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 后置队列任务产生了新的job  则递归运行flushJobs
    if (
      queue.length ||
      pendingPreFlushCbs.length ||
      pendingPostFlushCbs.length
    ) {
      flushJobs(seen)
    }
  }
}

// 函数调用进行计算 避免递归更新 造成卡死  递归调用的上限为100
function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob) {
  if (!seen.has(fn)) {
    seen.set(fn, 1)
  } else {
    const count = seen.get(fn)!
    if (count > RECURSION_LIMIT) { //大于100次调用会被判定为递归更新
      const instance = fn.ownerInstance
      const componentName = instance && getComponentName(instance.type)
      warn(
        `Maximum recursive updates exceeded${
          componentName ? ` in component <${componentName}>` : ``
        }. ` +
          `This means you have a reactive effect that is mutating its own ` +
          `dependencies and thus recursively triggering itself. Possible sources ` +
          `include component template, render function, updated hook or ` +
          `watcher source function.`
      )
      return true
    } else {
      seen.set(fn, count + 1)
    }
  }
}
