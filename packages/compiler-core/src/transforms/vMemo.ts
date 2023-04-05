import { NodeTransform } from '../transform'
import { findDir, makeBlock } from '../utils'
import {
  createCallExpression,
  createFunctionExpression,
  ElementTypes,
  MemoExpression,
  NodeTypes,
  PlainElementNode
} from '../ast'
import { WITH_MEMO } from '../runtimeHelpers'

const seen = new WeakSet()


/**
 * v-memo 仅用于性能至上场景中的微小优化，应该很少需要。最常见的情况可能是有助于渲染海量 v-for 列表 (长度超过 1000 的情况)：
 *   _withMemo([_ctx.a,_ctx.b], () => (_openBlock(), _createElementBlock("div", { "'": "" }, [
      _hoisted_1
    ])), _cache, 0) //0表示缓存值的位置
 */
export const transformMemo: NodeTransform = (node, context) => {
  if (node.type === NodeTypes.ELEMENT) {
    const dir = findDir(node, 'memo')
    if (!dir || seen.has(node)) { //与v-once类型 v-memo下的v-memo节点不用处理
      return
    }
    seen.add(node);
    return () => {
      const codegenNode =
        node.codegenNode ||
        (context.currentNode as PlainElementNode).codegenNode
      if (codegenNode && codegenNode.type === NodeTypes.VNODE_CALL) {
        // non-component sub tree should be turned into a block
        if (node.tagType !== ElementTypes.COMPONENT) {
          makeBlock(codegenNode, context)
        }

        node.codegenNode = createCallExpression(context.helper(WITH_MEMO), [ //_withMemo(_ctx.a)
          dir.exp!,
          createFunctionExpression(undefined, codegenNode), //codegenNode 作为函数的返回值
          `_cache`, // function render(_ctx, _cache, $props, $setup, $data, $options)   cache由render函数传入
          String(context.cached++) //缓存的节点下标
        ]) as MemoExpression
      }
    }
  }
}
