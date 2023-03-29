import { hasChanged } from '@vue/shared'
import { currentBlock, isBlockTreeEnabled, VNode } from '../vnode'

export function withMemo(
  memo: any[],
  render: () => VNode<any, any>,
  cache: any[],//render函数存入的cache[]
  index: number//下标值用来获取具体的值
) {
  const cached = cache[index] as VNode | undefined
  if (cached && isMemoSame(cached, memo)) {//混存值的比较
    return cached
  }
  const ret = render()

  // shallow clone
  ret.memo = memo.slice()
  return (cache[index] = ret)
}

// 对比新旧依赖值是否一样
export function isMemoSame(cached: VNode, memo: any[]) {
  const prev: any[] = cached.memo!
  if (prev.length != memo.length) {
    return false
  }

  for (let i = 0; i < prev.length; i++) {
    if (hasChanged(prev[i], memo[i])) {
      return false
    }
  }

  // make sure to let parent block track it when returning cached
  // TODO 什么时候处理
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(cached)
  }
  return true
}
