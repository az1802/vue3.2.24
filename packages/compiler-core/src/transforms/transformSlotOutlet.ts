import { NodeTransform, TransformContext } from '../transform'
import {
  NodeTypes,
  CallExpression,
  createCallExpression,
  ExpressionNode,
  SlotOutletNode,
  createFunctionExpression
} from '../ast'
import { isSlotOutlet, isStaticArgOf, isStaticExp } from '../utils'
import { buildProps, PropsExpression } from './transformElement'
import { createCompilerError, ErrorCodes } from '../errors'
import { RENDER_SLOT } from '../runtimeHelpers'
import { camelize } from '@vue/shared/'

// <slot name='aaa'></slot> 标签的处理
export const transformSlotOutlet: NodeTransform = (node, context) => {
  if (isSlotOutlet(node)) {
    const { children, loc } = node
    const { slotName, slotProps } = processSlotOutlet(node, context)

    const slotArgs: CallExpression['arguments'] = [
      context.prefixIdentifiers ? `_ctx.$slots` : `$slots`,
      slotName,
      '{}',
      'undefined',
      'true'
    ]
    let expectedLen = 2

    if (slotProps) {
      slotArgs[2] = slotProps
      expectedLen = 3
    }

    if (children.length) {
      slotArgs[3] = createFunctionExpression([], children, false, false, loc)
      expectedLen = 4
    }

    if (context.scopeId && !context.slotted) {
      expectedLen = 5
    }
    slotArgs.splice(expectedLen) // remove unused arguments

    node.codegenNode = createCallExpression(
      context.helper(RENDER_SLOT),
      slotArgs,
      loc
    )
  }
}

interface SlotOutletProcessResult {
  slotName: string | ExpressionNode
  slotProps: PropsExpression | undefined
}

export function processSlotOutlet(
  node: SlotOutletNode,
  context: TransformContext
): SlotOutletProcessResult {
  let slotName: string | ExpressionNode = `"default"`
  let slotProps: PropsExpression | undefined = undefined

  const nonNameProps = []
  //循环slot上的props
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      if (p.value) {
        if (p.name === 'name') {
          slotName = JSON.stringify(p.value.content)
        } else {
          p.name = camelize(p.name)
          nonNameProps.push(p)
        }
      }
    } else {//:text='text' :name='a' --> _renderSlot(_ctx.$slots, _ctx.a, { text: _ctx.text })
      if (p.name === 'bind' && isStaticArgOf(p.arg, 'name')) {
        if (p.exp) slotName = p.exp //name为动态值
      } else {
        if (p.name === 'bind' && p.arg && isStaticExp(p.arg)) {
          p.arg.content = camelize(p.arg.content)
        }
        nonNameProps.push(p)
      }
    }
  }

  //nonNameProps 收集组件作用域向外传递的值
  if (nonNameProps.length > 0) {
    const { props, directives } = buildProps(
      node,
      context,
      nonNameProps,
      false,
      false
    )
    slotProps = props//slotProps 对插槽提供的值

    if (directives.length) { //slot标签上不支持自定义指令
      context.onError(
        createCompilerError(
          ErrorCodes.X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET,
          directives[0].loc
        )
      )
    }
  }

  return {
    slotName,
    slotProps
  }
}
