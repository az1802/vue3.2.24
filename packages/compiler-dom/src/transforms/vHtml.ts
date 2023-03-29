import {
  DirectiveTransform,
  createObjectProperty,
  createSimpleExpression
} from '@vue/compiler-core'
import { createDOMCompilerError, DOMErrorCodes } from '../errors'

export const transformVHtml: DirectiveTransform = (dir, node, context) => {
  const { exp, loc } = dir
  if (!exp) {
    context.onError( //v-html确实表达式
      createDOMCompilerError(DOMErrorCodes.X_V_HTML_NO_EXPRESSION, loc)
    )
  }
  if (node.children.length) { //v-html将会覆盖子节点的内容
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_HTML_WITH_CHILDREN, loc)
    )
    node.children.length = 0
  }
  return {
    props: [
      createObjectProperty(
        createSimpleExpression(`innerHTML`, true, loc),
        exp || createSimpleExpression('', true)
      )
    ]
  }
}
