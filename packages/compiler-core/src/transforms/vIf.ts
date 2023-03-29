import {
  createStructuralDirectiveTransform,
  TransformContext,
  traverseNode
} from '../transform'
import {
  NodeTypes,
  ElementTypes,
  ElementNode,
  DirectiveNode,
  IfBranchNode,
  SimpleExpressionNode,
  createCallExpression,
  createConditionalExpression,
  createSimpleExpression,
  createObjectProperty,
  createObjectExpression,
  IfConditionalExpression,
  BlockCodegenNode,
  IfNode,
  createVNodeCall,
  AttributeNode,
  locStub,
  CacheExpression,
  ConstantTypes,
  MemoExpression
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { FRAGMENT, CREATE_COMMENT } from '../runtimeHelpers'
import {
  injectProp,
  findDir,
  findProp,
  isBuiltInType,
  makeBlock
} from '../utils'
import { PatchFlags, PatchFlagNames } from '@vue/shared'
import { getMemoedVNodeCall } from '..'

export const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      // #1587: We need to dynamically increment the key based on the current
      // node's sibling nodes, since chained v-if/else branches are
      // rendered at the same depth
      const siblings = context.parent!.children
      let i = siblings.indexOf(ifNode) //找到v-if节点的位置
      let key = 0
      while (i-- >= 0) {
        const sibling = siblings[i];
        if (sibling && sibling.type === NodeTypes.IF) {
          key += sibling.branches.length;
        }
      }

      // Exit callback. Complete the codegenNode when all children have been
      // transformed.
      return () => { //v-if exitFns
        if (isRoot) {
          ifNode.codegenNode = createCodegenNodeForBranch(
            branch,
            key,
            context
          ) as IfConditionalExpression
        } else {
          // attach this branch's codegen node to the v-if root.
          const parentCondition = getParentCondition(ifNode.codegenNode!)
          parentCondition.alternate = createCodegenNodeForBranch(
            branch,
            key + ifNode.branches.length - 1,
            context
          )
        }
      }
    })
  }
)

// target-agnostic transform used for both Client and SSR
export function processIf(
  node: ElementNode, //ast节点
  dir: DirectiveNode, //指令的声明信息
  context: TransformContext,
  processCodegen?: (
    node: IfNode,
    branch: IfBranchNode,
    isRoot: boolean
  ) => (() => void) | undefined
) {
  // v-if  v-else-if 必须存在表达式
  if (
    dir.name !== 'else' &&
    (!dir.exp || !(dir.exp as SimpleExpressionNode).content.trim())
  ) {
    const loc = dir.exp ? dir.exp.loc : node.loc
    context.onError(
      createCompilerError(ErrorCodes.X_V_IF_NO_EXPRESSION, dir.loc) //v-if 没有表达式
    )
    dir.exp = createSimpleExpression(`true`, false, loc)//创建默认为true的表达式,则后续的else不有触发的机会
  }

  if (!__BROWSER__ && context.prefixIdentifiers && dir.exp) {
    // dir.exp can only be simple expression because vIf transform is applied
    // before expression transform.
    dir.exp = processExpression(dir.exp as SimpleExpressionNode, context)
  }

  if (__DEV__ && __BROWSER__ && dir.exp) {//new Function 来验证表达式是否合法
    validateBrowserExpression(dir.exp as SimpleExpressionNode, context)
  }

  if (dir.name === 'if') { //创建新的branch 节点 然后替换原v-if节点
    const branch = createIfBranch(node, dir) ;//创建新的ifNode
    const ifNode: IfNode = {
      type: NodeTypes.IF,
      loc: node.loc,
      branches: [branch]
    }
    // 替换
    context.replaceNode(ifNode)
    if (processCodegen) {
      return processCodegen(ifNode, branch, true)
    }
  } else { // v-else v-else-if
    // locate the adjacent v-if
    const siblings = context.parent!.children
    const comments = []
    let i = siblings.indexOf(node)
    while (i-- >= -1) {
      // v-else 与 v-if中间的空白文本节点 注释节点会被处理不会当做错误
      const sibling = siblings[i]
      if (__DEV__ && sibling && sibling.type === NodeTypes.COMMENT) { //提取前面的注释节点
        context.removeNode(sibling)
        comments.unshift(sibling)
        continue
      }

      // 空白内容的节点移除
      if (
        sibling &&
        sibling.type === NodeTypes.TEXT &&
        !sibling.content.trim().length
      ) {
        context.removeNode(sibling)
        continue
      }

      // 该节点的前置节点 ,因为-v-else v-else-if 会逐渐被处理到NodeTypes.IF节点的branches中
      if (sibling && sibling.type === NodeTypes.IF) {
        // Check if v-else was followed by v-else-if
        if (
          dir.name === 'else-if' &&
          sibling.branches[sibling.branches.length - 1].condition === undefined
        ) {
          context.onError(
            createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, node.loc)
          )
        }

        // move the node to the if node's branches
        context.removeNode() //移除当前节点分支节点
        const branch = createIfBranch(node, dir);//创建新的 NodeTypes.IF_BRANCH节点
        if (
          __DEV__ &&
          comments.length &&
          // #3619 ignore comments if the v-if is direct child of <transition>
          !(
            context.parent &&
            context.parent.type === NodeTypes.ELEMENT &&
            isBuiltInType(context.parent.tag, 'transition')
          )
        ) {
          branch.children = [...comments, ...branch.children]
        }

        // check if user is forcing same key on different branches
        // 检测是否v-if v-else被强制设定为相同的key
        if (__DEV__ || !__BROWSER__) {
          const key = branch.userKey
          if (key) {
            sibling.branches.forEach(({ userKey }) => {
              if (isSameKey(userKey, key)) {
                context.onError(
                  createCompilerError(
                    ErrorCodes.X_V_IF_SAME_KEY,
                    branch.userKey!.loc
                  )
                )
              }
            })
          }
        }

        sibling.branches.push(branch) //将v-else v-else-if 节点压入到v-if节点的branches中
        const onExit = processCodegen && processCodegen(sibling, branch, false)
        // since the branch was removed, it will not be traversed.
        // make sure to traverse here.
        traverseNode(branch, context) //处理分支节点的转换
        // call on exit
        if (onExit) onExit()
        // make sure to reset currentNode after traversal to indicate this
        // node has been removed.
        context.currentNode = null
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, node.loc)
        )
      }
      break
    }
  }
}

// 创建一个新的if vnode 节点
function createIfBranch(node: ElementNode, dir: DirectiveNode): IfBranchNode {
  const isTemplateIf = node.tagType === ElementTypes.TEMPLATE
  return {
    type: NodeTypes.IF_BRANCH,
    loc: node.loc,
    condition: dir.name === 'else' ? undefined : dir.exp,//条件表达式
    children: isTemplateIf && !findDir(node, 'for') ? node.children : [node],//template 不含v-for时特俗处理
    userKey: findProp(node, `key`),
    isTemplateIf
  }
}

function createCodegenNodeForBranch(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext
): IfConditionalExpression | BlockCodegenNode | MemoExpression {
  if (branch.condition) {
    return createConditionalExpression(
      branch.condition,
      createChildrenCodegenNode(branch, keyIndex, context),
      // make sure to pass in asBlock: true so that the comment node call
      // closes the current block.
      createCallExpression(context.helper(CREATE_COMMENT), [
        __DEV__ ? '"v-if"' : '""',
        'true'
      ])
    ) as IfConditionalExpression
  } else {
    return createChildrenCodegenNode(branch, keyIndex, context)
  }
}


// 处理分支节点下子节点的codegen
function createChildrenCodegenNode(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext
): BlockCodegenNode | MemoExpression {
  const { helper } = context
  const keyProperty = createObjectProperty(
    `key`,
    createSimpleExpression(
      `${keyIndex}`,
      false,
      locStub,
      ConstantTypes.CAN_HOIST
    )
  )
  const { children } = branch
  const firstChild = children[0]
  const needFragmentWrapper =
    children.length !== 1 || firstChild.type !== NodeTypes.ELEMENT
  if (needFragmentWrapper) { //多个子节点 使用 fragment 包裹
    if (children.length === 1 && firstChild.type === NodeTypes.FOR) { // v-if v-for 同时使用
      // optimize away nested fragments when child is a ForNode
      const vnodeCall = firstChild.codegenNode!
      injectProp(vnodeCall, keyProperty, context)
      return vnodeCall
    } else {
      let patchFlag = PatchFlags.STABLE_FRAGMENT
      let patchFlagText = PatchFlagNames[PatchFlags.STABLE_FRAGMENT]
      // check if the fragment actually contains a single valid child with
      // the rest being comments
      if (
        __DEV__ &&
        !branch.isTemplateIf &&
        children.filter(c => c.type !== NodeTypes.COMMENT).length === 1
      ) {
        patchFlag |= PatchFlags.DEV_ROOT_FRAGMENT
        patchFlagText += `, ${PatchFlagNames[PatchFlags.DEV_ROOT_FRAGMENT]}`
      }

      return createVNodeCall(
        context,
        helper(FRAGMENT),
        createObjectExpression([keyProperty]),
        children,
        patchFlag + (__DEV__ ? ` /* ${patchFlagText} */` : ``),
        undefined,
        undefined,
        true,
        false,
        false /* isComponent */,
        branch.loc
      )
    }
  } else {
    const ret = (firstChild as ElementNode).codegenNode as
      | BlockCodegenNode
      | MemoExpression
    const vnodeCall = getMemoedVNodeCall(ret)
    // Change createVNode to createBlock.
    if (vnodeCall.type === NodeTypes.VNODE_CALL) {
      makeBlock(vnodeCall, context)
    }
    // inject branch key
    injectProp(vnodeCall, keyProperty, context)
    return ret
  }
}

// 节点类型一样
function isSameKey(
  a: AttributeNode | DirectiveNode | undefined,
  b: AttributeNode | DirectiveNode
): boolean {
  if (!a || a.type !== b.type) {
    return false
  }
  if (a.type === NodeTypes.ATTRIBUTE) {
    if (a.value!.content !== (b as AttributeNode).value!.content) {
      return false
    }
  } else {
    // directive
    const exp = a.exp!
    const branchExp = (b as DirectiveNode).exp!
    if (exp.type !== branchExp.type) {
      return false
    }
    if (
      exp.type !== NodeTypes.SIMPLE_EXPRESSION ||
      exp.isStatic !== (branchExp as SimpleExpressionNode).isStatic ||
      exp.content !== (branchExp as SimpleExpressionNode).content
    ) {
      return false
    }
  }
  return true
}

// 查找父级表达式节点
function getParentCondition(
  node: IfConditionalExpression | CacheExpression
): IfConditionalExpression {
  while (true) {
    if (node.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
      if (node.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
        node = node.alternate
      } else {
        return node
      }
    } else if (node.type === NodeTypes.JS_CACHE_EXPRESSION) {
      node = node.value as IfConditionalExpression
    }
  }
}
