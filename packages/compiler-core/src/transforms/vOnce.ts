import { NodeTransform } from '../transform'
import { findDir } from '../utils'
import { ElementNode, ForNode, IfNode, NodeTypes } from '../ast'
import { SET_BLOCK_TRACKING } from '../runtimeHelpers'

const seen = new WeakSet();//添加节点的引用避免递归调用

//v-once transform
export const transformOnce: NodeTransform = (node, context) => {
  if (node.type === NodeTypes.ELEMENT && findDir(node, 'once', true)) {
    if (seen.has(node) || context.inVOnce) { //在v-once 下的v-once节点不用处理
      return
    }
    seen.add(node)
    context.inVOnce = true;
    context.helper(SET_BLOCK_TRACKING)
    return () => {
      context.inVOnce = false
      const cur = context.currentNode as ElementNode | IfNode | ForNode //TODO 这里为什么是cur 而非直接引用node 可能是担心node节点被移除
      if (cur.codegenNode) {
        cur.codegenNode = context.cache(cur.codegenNode, true /* isVNode */)
      }
    }
  }
}
