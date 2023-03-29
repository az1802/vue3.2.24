import {
  NodeTransform,
  NodeTypes,
  createSimpleExpression,
  SimpleExpressionNode,
  SourceLocation,
  ConstantTypes
} from '@vue/compiler-core'
import { parseStringStyle } from '@vue/shared'

// Parse inline CSS strings for static style attributes into an object.
// This is a NodeTransform since it works on the static `style` attribute and
// converts it into a dynamic equivalent:
// style="color: red" -> :style='{ "color": "red" }'
// It is then processed by `transformElement` and included in the generated
// props.


//  <div style="height:10px" :style='aaa'>Hello World!</div> => _normalizeStyle([{"height":"10px"}, _ctx.aaa])
// 将style属性转换为指令的形式放入 normalizeStyle指令函数去处理
export const transformStyle: NodeTransform = node => {
  if (node.type === NodeTypes.ELEMENT) {
    node.props.forEach((p, i) => {
      if (p.type === NodeTypes.ATTRIBUTE && p.name === 'style' && p.value) {
        // replace p with an expression node
        node.props[i] = {
          type: NodeTypes.DIRECTIVE,
          name: `bind`,
          arg: createSimpleExpression(`style`, true, p.loc),
          exp: parseInlineCSS(p.value.content, p.loc),
          modifiers: [],
          loc: p.loc
        }
      }
    })
  }
}

// 将inlineStyle  处理为对象的形式
const parseInlineCSS = (
  cssText: string,
  loc: SourceLocation
): SimpleExpressionNode => {
  const normalized = parseStringStyle(cssText)
  return createSimpleExpression(
    JSON.stringify(normalized),
    false,
    loc,
    ConstantTypes.CAN_STRINGIFY
  )
}
