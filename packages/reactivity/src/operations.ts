// using literal strings instead of numbers so that it's easier to inspect
// debugger events

// 触发数据依赖收集的操作
export const enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}

// 触发数据改变的操作类型
export const enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear'
}
