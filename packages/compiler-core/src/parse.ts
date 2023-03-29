import { ErrorHandlingOptions, ParserOptions } from './options'
import { NO, isArray, makeMap, extend } from '@vue/shared'
import {
  ErrorCodes,
  createCompilerError,
  defaultOnError,
  defaultOnWarn
} from './errors'
import {
  assert,
  advancePositionWithMutation,
  advancePositionWithClone,
  isCoreComponent,
  isStaticArgOf
} from './utils'
import {
  Namespaces,
  AttributeNode,
  CommentNode,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  ExpressionNode,
  NodeTypes,
  Position,
  RootNode,
  SourceLocation,
  TextNode,
  TemplateChildNode,
  InterpolationNode,
  createRoot,
  ConstantTypes
} from './ast'
import {
  checkCompatEnabled,
  CompilerCompatOptions,
  CompilerDeprecationTypes,
  isCompatEnabled,
  warnDeprecation
} from './compat/compatConfig'

type OptionalOptions =
  | 'whitespace' //'condense' | 'preserve' 是否保留空格,默认是压缩,不保留空格
  | 'isNativeTag'
  | 'isBuiltInComponent'
  | keyof CompilerCompatOptions
type MergedParserOptions = Omit<Required<ParserOptions>, OptionalOptions> &
  Pick<ParserOptions, OptionalOptions>
type AttributeValue =
  | {
      content: string
      isQuoted: boolean
      loc: SourceLocation
    }
  | undefined

// The default decoder only provides escapes for characters reserved as part of
// the template syntax, and is only used if the custom renderer did not provide
// a platform-specific decoder.
const decodeRE = /&(gt|lt|amp|apos|quot);/g
const decodeMap: Record<string, string> = {
  gt: '>',
  lt: '<',
  amp: '&',
  apos: "'",
  quot: '"'
}

export const defaultParserOptions: MergedParserOptions = {
  delimiters: [`{{`, `}}`],
  getNamespace: () => Namespaces.HTML,
  getTextMode: () => TextModes.DATA,
  isVoidTag: NO,
  isPreTag: NO,
  isCustomElement: NO,
  decodeEntities: (rawText: string): string =>
    rawText.replace(decodeRE, (_, p1) => decodeMap[p1]),
  onError: defaultOnError,
  onWarn: defaultOnWarn,
  comments: __DEV__
}

export const enum TextModes {
  //          | Elements | Entities | End sign              | Inside of
  DATA, //    | ✔        | ✔        | End tags of ancestors |
  RCDATA, //  | ✘        | ✔        | End tag of the parent | <textarea>
  RAWTEXT, // | ✘        | ✘        | End tag of the parent | <style>,<script>
  CDATA,
  ATTRIBUTE_VALUE
}

export interface ParserContext {
  options: MergedParserOptions
  readonly originalSource: string
  source: string
  offset: number
  line: number
  column: number
  inPre: boolean // HTML <pre> tag, preserve whitespaces
  inVPre: boolean // v-pre, do not process directives and interpolations
  onWarn: NonNullable<ErrorHandlingOptions['onWarn']>
}

// 基本的编译函数
export function baseParse(
  content: string,
  options: ParserOptions = {}
): RootNode {
  const context = createParserContext(content, options)
  const start = getCursor(context)

  //parseChildren 先执行,执行完后游标postion的位置会发生变化,getSelection 中end在获取就是处理完children之后节点的位置
  return createRoot(
    parseChildren(context, TextModes.DATA, []),
    getSelection(context, start) //对应的template字符串
  )
}

// 创建编译执行的上下文,主要是处理options(覆盖更新option key的方式合并) ,初始化source content 和游标的位置
function createParserContext(
  content: string,
  rawOptions: ParserOptions
): ParserContext {
  const options = extend({}, defaultParserOptions)

  let key: keyof ParserOptions
  for (key in rawOptions) {
    // @ts-ignore
    options[key] =
      rawOptions[key] === undefined
        ? defaultParserOptions[key]
        : rawOptions[key]
  }
  return {
    options,
    column: 1,
    line: 1,
    offset: 0,
    originalSource: content,//原始的template字符串内容
    source: content,//剩余未解析的template内容
    inPre: false,//是否在pre标签下
    inVPre: false,//是否在v-pre指令下
    onWarn: options.onWarn//警告的处理函数
  }
}

//ancestors为当前解析标签的堆栈信息  返回处理完的子节点信息,并不会处理父节点的结束标签
function parseChildren(
  context: ParserContext,
  mode: TextModes,//字符串解析的模式
  ancestors: ElementNode[]//正在解析的tag栈
): TemplateChildNode[] {
  const parent = last(ancestors)
  const ns = parent ? parent.ns : Namespaces.HTML
  const nodes: TemplateChildNode[] = [] //再递归解析的过程中 nodes 形成闭包,用来存放子节点

  // 当匹配到与栈中 父级标签对应的结束标签 或者  ]]> 则表示一个元素解析完成 使用node记录
  while (!isEnd(context, mode, ancestors)) {
    __TEST__ && assert(context.source.length > 0)
    const s = context.source //还未解析的模版字符串
    let node: TemplateChildNode | TemplateChildNode[] | undefined = undefined

    if (mode === TextModes.DATA || mode === TextModes.RCDATA) { //文本内容的处理
      if (!context.inVPre && startsWith(s, context.options.delimiters[0])) {//{{ 开始 解析为内部的表达式
        // '{{'
        node = parseInterpolation(context, mode) //表达式节点
      } else if (mode === TextModes.DATA && s[0] === '<') { // < 标签开始的标志
        // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
        if (s.length === 1) {
          emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 1)
        } else if (s[1] === '!') { // <! 开始的情况
          // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
          if (startsWith(s, '<!--')) { //注释节点
            node = parseComment(context)
          } else if (startsWith(s, '<!DOCTYPE')) { //html标签解析的处理方式
            // Ignore DOCTYPE by a limitation.
            node = parseBogusComment(context)
          } else if (startsWith(s, '<![CDATA[')) {
            if (ns !== Namespaces.HTML) {
              node = parseCDATA(context, ancestors)
            } else {
              emitError(context, ErrorCodes.CDATA_IN_HTML_CONTENT)
              node = parseBogusComment(context)
            }
          } else {
            emitError(context, ErrorCodes.INCORRECTLY_OPENED_COMMENT)
            node = parseBogusComment(context)
          }
        } else if (s[1] === '/') {// </结束标签
          // https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
          if (s.length === 2) {
            emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 2)
          } else if (s[2] === '>') { // </> 缺少结束标签的名称
            emitError(context, ErrorCodes.MISSING_END_TAG_NAME, 2)
            advanceBy(context, 3)
            continue
          } else if (/[a-z]/i.test(s[2])) { // </1 非法的结束标签,必须以a-z之间的字母开头
            emitError(context, ErrorCodes.X_INVALID_END_TAG)
            parseTag(context, TagType.End, parent)
            continue
          } else { //isEnd已经前置判断了若当前标签为结束标签,会在isEnd处理中找到对应的开始标签
            emitError(
              context,
              ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME,//与开始标签对应的结束标签,标签名错误
              2
            )
            node = parseBogusComment(context)
          }
        } else if (/[a-z]/i.test(s[1])) { // <div 开始标签
          node = parseElement(context, ancestors) //解析开始标签

          // 2.x <template> with no directive compat 兼容vue2.x template标签上只能存在if else else-if v-for v-slot指令
          if (
            __COMPAT__ &&
            isCompatEnabled(
              CompilerDeprecationTypes.COMPILER_NATIVE_TEMPLATE,
              context
            ) &&
            node &&
            node.tag === 'template' &&
            !node.props.some(
              p =>
                p.type === NodeTypes.DIRECTIVE &&
                isSpecialTemplateDirective(p.name)
            )
          ) {
            __DEV__ &&
              warnDeprecation(
                CompilerDeprecationTypes.COMPILER_NATIVE_TEMPLATE,
                context,
                node.loc
              )
            node = node.children
          }
        } else if (s[1] === '?') { // //<? 只能在xml中使用
          emitError(
            context,
            ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME,
            1
          )
          node = parseBogusComment(context)
        } else {
          emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 1) // <1 非法的开始标签
        }
      }
    }
    if (!node) { //没有检测到 开始标签,注释标签,表达式开始符 {{ ,此处当做纯文本进行解析 ,<p>123</p>p标签处理完处理chilren时 这里就是纯文本节点解析
      node = parseText(context, mode)
    }

    if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(nodes, node[i])
      }
    } else {
      pushNode(nodes, node)
    }
  }

  // Whitespace handling strategy like v2  针对于多个连续的空格,注释节点等做一个空格合并或者移除的操作
  let removedWhitespace = false
  if (mode !== TextModes.RAWTEXT && mode !== TextModes.RCDATA) {
    const shouldCondense = context.options.whitespace !== 'preserve'
    for (let i = 0; i < nodes.length; i++) { //文本节点和注释节点空白字符的合并
      const node = nodes[i]
      if (!context.inPre && node.type === NodeTypes.TEXT) {
        if (!/[^\t\r\n\f ]/.test(node.content)) {
          const prev = nodes[i - 1]
          const next = nodes[i + 1]
          // Remove if:
          // - the whitespace is the first or last node, or:
          // - (condense mode) the whitespace is adjacent to a comment, or:
          // - (condense mode) the whitespace is between two elements AND contains newline
          if (
            !prev ||
            !next ||
            (shouldCondense &&
              (prev.type === NodeTypes.COMMENT ||
                next.type === NodeTypes.COMMENT ||
                (prev.type === NodeTypes.ELEMENT &&
                  next.type === NodeTypes.ELEMENT &&
                  /[\r\n]/.test(node.content))))
          ) {
            removedWhitespace = true
            nodes[i] = null as any
          } else {
            // Otherwise, the whitespace is condensed into a single space
            node.content = ' '
          }
        } else if (shouldCondense) { //合并连续的多个空格
          // in condense mode, consecutive whitespaces in text are condensed
          // down to a single space.
          node.content = node.content.replace(/[\t\r\n\f ]+/g, ' ')
        }
      }
      // Remove comment nodes if desired by configuration.
      else if (node.type === NodeTypes.COMMENT && !context.options.comments) {//不保留注释节点,直接将comment vnode设置为null然后后面过滤掉
        removedWhitespace = true
        nodes[i] = null as any
      }
    }
    if (context.inPre && parent && context.options.isPreTag(parent.tag)) {
      // remove leading newline per html spec
      // https://html.spec.whatwg.org/multipage/grouping-content.html#the-pre-element
      const first = nodes[0]
      if (first && first.type === NodeTypes.TEXT) {
        first.content = first.content.replace(/^\r?\n/, '')
      }
    }
  }

  return removedWhitespace ? nodes.filter(Boolean) : nodes
}

// 连续的文本节点被压入时会被处理为同一个文本节点
function pushNode(nodes: TemplateChildNode[], node: TemplateChildNode): void {
  if (node.type === NodeTypes.TEXT) {
    const prev = last(nodes)
    // Merge if both this and the previous node are text and those are
    // consecutive. This happens for cases like "a < b".
    if (
      prev &&
      prev.type === NodeTypes.TEXT &&
      prev.loc.end.offset === node.loc.start.offset
    ) {
      prev.content += node.content
      prev.loc.end = node.loc.end
      prev.loc.source += node.loc.source
      return
    }
  }

  nodes.push(node)
}

// 处理CDATA形式的数据 一般不会使用到
function parseCDATA(
  context: ParserContext,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  __TEST__ &&
    assert(last(ancestors) == null || last(ancestors)!.ns !== Namespaces.HTML)
  __TEST__ && assert(startsWith(context.source, '<![CDATA['))

  advanceBy(context, 9)
  const nodes = parseChildren(context, TextModes.CDATA, ancestors)
  if (context.source.length === 0) {
    emitError(context, ErrorCodes.EOF_IN_CDATA)
  } else {
    __TEST__ && assert(startsWith(context.source, ']]>'))
    advanceBy(context, 3)
  }

  return nodes
}

// 处理注释节点
function parseComment(context: ParserContext): CommentNode {
  __TEST__ && assert(startsWith(context.source, '<!--'))

  const start = getCursor(context)
  let content: string

  // Regular comment.
  const match = /--(\!)?>/.exec(context.source)
  if (!match) { //非法注释节点
    content = context.source.slice(4)
    advanceBy(context, context.source.length) //直接移动游标至末尾结束编译过程
    emitError(context, ErrorCodes.EOF_IN_COMMENT)
  } else {
    if (match.index <= 3) { //注释节点的关闭标签错误
      emitError(context, ErrorCodes.ABRUPT_CLOSING_OF_EMPTY_COMMENT)
    }
    if (match[1]) {
      emitError(context, ErrorCodes.INCORRECTLY_CLOSED_COMMENT)
    }
    content = context.source.slice(4, match.index) //获取注释内容

    // Advancing with reporting nested comments.
    const s = context.source.slice(0, match.index)
    let prevIndex = 1,
      nestedIndex = 0
    while ((nestedIndex = s.indexOf('<!--', prevIndex)) !== -1) {
      advanceBy(context, nestedIndex - prevIndex + 1)
      if (nestedIndex + 4 < s.length) {//检查注释节点中是否有<!-- 内容 会发出警告
        emitError(context, ErrorCodes.NESTED_COMMENT)
      }
      prevIndex = nestedIndex + 1
    }
    advanceBy(context, match.index + match[0].length - prevIndex + 1)
  }

  return {
    type: NodeTypes.COMMENT, //注释节点
    content,
    loc: getSelection(context, start)
  }
}

// 处理 <!DOCTYPE 形式的注释节点  声明不区分标签大小写。
function parseBogusComment(context: ParserContext): CommentNode | undefined {
  __TEST__ && assert(/^<(?:[\!\?]|\/[^a-z>])/i.test(context.source))

  const start = getCursor(context)
  const contentStart = context.source[1] === '?' ? 1 : 2
  let content: string

  const closeIndex = context.source.indexOf('>')
  if (closeIndex === -1) {
    content = context.source.slice(contentStart)
    advanceBy(context, context.source.length)
  } else {
    content = context.source.slice(contentStart, closeIndex)
    advanceBy(context, closeIndex + 1)
  }

  return {
    type: NodeTypes.COMMENT,
    content,
    loc: getSelection(context, start)
  }
}

// 解析标签元素,
function parseElement(
  context: ParserContext,
  ancestors: ElementNode[]
): ElementNode | undefined {
  __TEST__ && assert(/^<[a-z]/i.test(context.source))

  // Start tag. 存储之前pre的标志变量,这里递归处理形成闭包,后续处理完该节点和子节点,当前是pre边界时直接还原为false
  const wasInPre = context.inPre
  const wasInVPre = context.inVPre

  const parent = last(ancestors) //父节点
  const element = parseTag(context, TagType.Start, parent) //解析当前元素标签 以及 开始标签的属性部分
  const isPreBoundary = context.inPre && !wasInPre //parseTag解析如果当前为pre标签context.inPre会被表示为true,之前不存在inpre则当前标签为pre边界
  const isVPreBoundary = context.inVPre && !wasInVPre//标签上是否存在v-pre质量


  if (element.isSelfClosing || context.options.isVoidTag(element.tag)) { //自闭合标签  不用处理parseChildren
    // #4030 self-closing <pre> tag
    if (isPreBoundary) {//移除pre标签  v-pre指令的影响
      context.inPre = false
    }
    if (isVPreBoundary) {
      context.inVPre = false
    }
    return element
  }

  // Children.
  ancestors.push(element) //当前节点压入栈,解析子节点
  const mode = context.options.getTextMode(element, parent)
  const children = parseChildren(context, mode, ancestors) //递归处理子节点
  ancestors.pop() //当前节点处理完之后出栈

  // 2.x inline-template compat vue2中内联模板的特殊处理
  if (__COMPAT__) {
    const inlineTemplateProp = element.props.find(
      p => p.type === NodeTypes.ATTRIBUTE && p.name === 'inline-template'
    ) as AttributeNode
    if (
      inlineTemplateProp &&
      checkCompatEnabled(
        CompilerDeprecationTypes.COMPILER_INLINE_TEMPLATE,
        context,
        inlineTemplateProp.loc
      )
    ) {
      const loc = getSelection(context, element.loc.end)
      inlineTemplateProp.value = {
        type: NodeTypes.TEXT,
        content: loc.source,
        loc
      }
    }
  }

  element.children = children //父节点与子节点建立联系

  // End tag. 处理完子节点 查看是否存在与之对应的结束标签
  if (startsWithEndTagOpen(context.source, element.tag)) {//处理完直接点之后查看连着的是否是与之对应的结束标签
    parseTag(context, TagType.End, parent)
  } else {//结束标签缺失,报错
    emitError(context, ErrorCodes.X_MISSING_END_TAG, 0, element.loc.start)
    if (context.source.length === 0 && element.tag.toLowerCase() === 'script') { //针对script标签特殊判断
      const first = children[0]
      if (first && startsWith(first.loc.source, '<!--')) {
        emitError(context, ErrorCodes.EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT)
      }
    }
  }

  element.loc = getSelection(context, element.loc.start)

  // 当前为pre边界标签才需要关闭,前面wasInPre为true时 这里的isPreBoundary为false ,不会处理
  if (isPreBoundary) {
    context.inPre = false
  }
  if (isVPreBoundary) {
    context.inVPre = false
  }
  return element
}

const enum TagType {
  Start,
  End
}

// template上的特殊指令
const isSpecialTemplateDirective = /*#__PURE__*/ makeMap(
  `if,else,else-if,for,slot`
)

/**
 * Parse a tag (E.g. `<div id=a>`) with that type (start tag or end tag).
 * 解析开始标签 和 结束标签部分 解析标签上的属性  针对pre标签和v-pre 进行特别的处理 然后返回ast节点
 */
function parseTag(
  context: ParserContext,
  type: TagType.Start,
  parent: ElementNode | undefined
): ElementNode
function parseTag(
  context: ParserContext,
  type: TagType.End,
  parent: ElementNode | undefined
): void
function parseTag(
  context: ParserContext,
  type: TagType,
  parent: ElementNode | undefined
): ElementNode | undefined {
  __TEST__ && assert(/^<\/?[a-z]/i.test(context.source))
  __TEST__ &&
    assert(
      type === (startsWith(context.source, '</') ? TagType.End : TagType.Start)
    )

  // Tag open.
  const start = getCursor(context)
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)! //匹配开始标签或结束标签
  // /^<\/?([a-z][^\t\r\n\f />]*)/i.exec("<div>")  ['<div', 'div', index: 0, input: '<div>', groups: undefined]
  const tag = match[1]  //获取标签名
  const ns = context.options.getNamespace(tag, parent)

  advanceBy(context, match[0].length)
  advanceSpaces(context)//处理开始标签名之后与属性之间的空格

  // save current state in case we need to re-parse attributes with v-pre
  const cursor = getCursor(context)
  const currentSource = context.source

  // check <pre> tag
  if (context.options.isPreTag(tag)) {
    context.inPre = true
  }

  // Attributes.
  // 解析标签上的所有属性
  let props = parseAttributes(context, type)

  // check v-pre 标记inVPre状态 同时过滤掉v-pre指令
  if (
    type === TagType.Start &&
    !context.inVPre &&
    props.some(p => p.type === NodeTypes.DIRECTIVE && p.name === 'pre')
  ) {
    context.inVPre = true
    // reset context
    extend(context, cursor)
    context.source = currentSource
    // re-parse attrs and filter out v-pre itself
    props = parseAttributes(context, type).filter(p => p.name !== 'v-pre')
  }

  // Tag close.
  let isSelfClosing = false
  if (context.source.length === 0) { //标签上的属性解析错误
    emitError(context, ErrorCodes.EOF_IN_TAG)
  } else {
    isSelfClosing = startsWith(context.source, '/>') //属性解析完毕之后标签以 />结尾
    if (type === TagType.End && isSelfClosing) {
      emitError(context, ErrorCodes.END_TAG_WITH_TRAILING_SOLIDUS)
    }
    advanceBy(context, isSelfClosing ? 2 : 1) //处理开始白起爱弄得结束 /> 或 >
  }

  if (type === TagType.End) { //结束标签 直接返回,后续会对开始标签上属性合理性进行检测
    return
  }

  // 2.x deprecation checks   兼容vue2.x  v-if v-for 指令同时存在一个节点上会发出警告
  if (
    __COMPAT__ &&
    __DEV__ &&
    isCompatEnabled(
      CompilerDeprecationTypes.COMPILER_V_IF_V_FOR_PRECEDENCE,
      context
    )
  ) {
    let hasIf = false
    let hasFor = false
    for (let i = 0; i < props.length; i++) {
      const p = props[i]
      if (p.type === NodeTypes.DIRECTIVE) {
        if (p.name === 'if') {
          hasIf = true
        } else if (p.name === 'for') {
          hasFor = true
        }
      }
      if (hasIf && hasFor) {
        warnDeprecation(
          CompilerDeprecationTypes.COMPILER_V_IF_V_FOR_PRECEDENCE, //v-for 与 v-if 指令一起使用会报出警告
          context,
          getSelection(context, start)
        )
        break
      }
    }
  }

  let tagType = ElementTypes.ELEMENT
  if (!context.inVPre) {//针对slot template 组件 更改tagType
    if (tag === 'slot') {
      tagType = ElementTypes.SLOT
    } else if (tag === 'template') { //template上的结构化指令if,else,else-if,for,slot,会标记为template tagType
      if (
        props.some(
          p =>
            p.type === NodeTypes.DIRECTIVE && isSpecialTemplateDirective(p.name)
        )
      ) {
        tagType = ElementTypes.TEMPLATE
      }
    } else if (isComponent(tag, props, context)) {
      tagType = ElementTypes.COMPONENT
    }
  }

  return {
    type: NodeTypes.ELEMENT,
    ns,
    tag,
    tagType,
    props, //开始标签上的属性节点数组
    isSelfClosing,
    children: [],
    loc: getSelection(context, start),
    codegenNode: undefined // to be created during transform phase
  }
}

// component 标签大写打开  内置核心组件 isBuiltInComponent 非isNativeTag 都会被认为是组件
// 存在v-is :is 属性也会被判定为组件
function isComponent(
  tag: string,
  props: (AttributeNode | DirectiveNode)[],
  context: ParserContext
) {
  const options = context.options
  if (options.isCustomElement(tag)) {
    return false
  }
  if (
    tag === 'component' ||  //内置component 组件的特殊处理
    /^[A-Z]/.test(tag) || //大写开头的标记为组件
    isCoreComponent(tag) || //Teleport Suspense KeepAlive BaseTransition 内置核心组件
    (options.isBuiltInComponent && options.isBuiltInComponent(tag)) || //options 配置的检测内置组件的函数
    (options.isNativeTag && !options.isNativeTag(tag)) //非原生标签
  ) {
    return true
  }
  // at this point the tag should be a native tag, but check for potential "is"
  // casting
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      if (p.name === 'is' && p.value) {
        if (p.value.content.startsWith('vue:')) { //TODO vue:表示哪种组件
          return true
        } else if (
          __COMPAT__ &&
          checkCompatEnabled(
            CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
            context,
            p.loc
          )
        ) {
          return true
        }
      }
    } else { // v-is b-bind:is  都会当做组件处理
      // directive
      // v-is (TODO Deprecate)
      if (p.name === 'is') {
        return true
      } else if (
        // :is on plain element - only treat as component in compat mode
        p.name === 'bind' &&
        isStaticArgOf(p.arg, 'is') &&
        __COMPAT__ &&
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
          context,
          p.loc
        )
      ) {
        return true
      }
    }
  }
}

// 解析属性 结果是数组形式保存所有的属性
function parseAttributes(
  context: ParserContext,
  type: TagType //标签类型 开始标签还是结束标签
): (AttributeNode | DirectiveNode)[] {
  const props = []
  const attributeNames = new Set<string>()
  while ( // 检测到>  /> 表示属性解析完成
    context.source.length > 0 &&
    !startsWith(context.source, '>') &&
    !startsWith(context.source, '/>')
  ) {
    if (startsWith(context.source, '/')) {//<div name / title>  属性中的/会被当做非法字符发出警告,但不会终止编译
      emitError(context, ErrorCodes.UNEXPECTED_SOLIDUS_IN_TAG)
      advanceBy(context, 1)
      advanceSpaces(context)
      continue
    }
    if (type === TagType.End) {//结束标签上不能包含属性
      emitError(context, ErrorCodes.END_TAG_WITH_ATTRIBUTES)
    }

    // 解析单个属性的key value
    const attr = parseAttribute(context, attributeNames)

    // Trim whitespace between class
    // https://github.com/vuejs/core/issues/4251
    if ( // class值之间的空格进行合并
      attr.type === NodeTypes.ATTRIBUTE &&
      attr.value &&
      attr.name === 'class'
    ) {
      attr.value.content = attr.value.content.replace(/\s+/g, ' ').trim() //class属性的值去除空格
    }

    if (type === TagType.Start) {
      props.push(attr)
    }

    if (/^[^\t\r\n\f />]/.test(context.source)) {
      emitError(context, ErrorCodes.MISSING_WHITESPACE_BETWEEN_ATTRIBUTES)
    }
    advanceSpaces(context) //处理属性间的空格
  }
  return props
}

/* 解析单个属性 先解析属性key 游标前进 再解析val
  指令属性
  arg: undefined // 指令参数 v-bind:arg   即解析出arg
  exp: {type: 4, content: 'b', isStatic: false, constType: 0, loc: {…}} // 指令表达式的值
  loc: {start: {…}, end: {…}, source: 'v-if="b"'} //属性字符串位置
  modifiers: [] //指令修饰符
  name: "if" //指令名称
  type: 7
*/
function parseAttribute(
  context: ParserContext,
  nameSet: Set<string>
): AttributeNode | DirectiveNode {
  __TEST__ && assert(/^[^\t\r\n\f />]/.test(context.source))

  // Name.
  const start = getCursor(context)
  const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)!
  const name = match[0] //匹配属性名()

  if (nameSet.has(name)) {// 重复属性 报错提示
    emitError(context, ErrorCodes.DUPLICATE_ATTRIBUTE)
  }
  nameSet.add(name)

  if (name[0] === '=') {//属性=左边缺少key值
    emitError(context, ErrorCodes.UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME)
  }
  {
    const pattern = /["'<]/g
    let m: RegExpExecArray | null
    while ((m = pattern.exec(name))) {//属性名中包含非法字符
      emitError(
        context,
        ErrorCodes.UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME,
        m.index
      )
    }
  }

  advanceBy(context, name.length)

  // Value
  let value: AttributeValue = undefined

  if (/^[\t\r\n\f ]*=/.test(context.source)) {  //name   =  "123" =左边的空格会被忽略,不存在=是value为undefined
    advanceSpaces(context) //处理属性间的空格 换行符
    advanceBy(context, 1) //处理=号
    advanceSpaces(context) //处理=后面的空格
    value = parseAttributeValue(context)
    if (!value) {
      emitError(context, ErrorCodes.MISSING_ATTRIBUTE_VALUE) //缺少属性值
    }
  }

  // 前面只是获取 = 左边的值作为name  右边的值作为value  然后在对name value进行更加细分的处理
  const loc = getSelection(context, start)

  if (!context.inVPre && /^(v-[A-Za-z0-9-]|:|\.|@|#)/.test(name)) { //处理属性是指令的情况
    const match =
      /(?:^v-([a-z0-9-]+))?(?:(?::|^\.|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(
        name
      )!

    let isPropShorthand = startsWith(name, '.')
    let dirName = // match[1] 存在表明是v-开头的属性  . : 均表示v-bind 否则默认添加指令slot
      match[1] ||
      (isPropShorthand || startsWith(name, ':')
        ? 'bind' // : 是v-bind属性的简写
        : startsWith(name, '@') //@时间名称的简写
        ? 'on'
        : 'slot') //不以.
    let arg: ExpressionNode | undefined

    if (match[2]) { //指令参数的处理
      const isSlot = dirName === 'slot'
      const startOffset = name.lastIndexOf(match[2])
      const loc = getSelection(
        context,
        getNewPosition(context, start, startOffset),
        getNewPosition(
          context,
          start,
          startOffset + match[2].length + ((isSlot && match[3]) || '').length
        )
      )
      let content = match[2]
      let isStatic = true

      // v-slot:[name] 表示质量参数为动态
      if (content.startsWith('[')) {
        isStatic = false

        if (!content.endsWith(']')) {
          emitError(
            context,
            ErrorCodes.X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END
          )
          content = content.slice(1)
        } else {
          content = content.slice(1, content.length - 1) //动态指令的内容
        }
      } else if (isSlot) { //v-slot:  动态插槽
        // #1241 special case for v-slot: vuetify relies extensively on slot
        // names containing dots. v-slot doesn't have any modifiers and Vue 2.x
        // supports such usage so we are keeping it consistent with 2.x.
        content += match[3] || ''
      }

      // 指令参数
      arg = {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content,
        isStatic,
        constType: isStatic
          ? ConstantTypes.CAN_STRINGIFY
          : ConstantTypes.NOT_CONSTANT,
        loc
      }
    }

    if (value && value.isQuoted) {
      const valueLoc = value.loc
      valueLoc.start.offset++
      valueLoc.start.column++
      valueLoc.end = advancePositionWithClone(valueLoc.start, value.content)
      valueLoc.source = valueLoc.source.slice(1, -1)// "\"b\""  存在一层转移 所有需要裁剪掉
    }

    const modifiers = match[3] ? match[3].slice(1).split('.') : [] //指令修饰符
    if (isPropShorthand) modifiers.push('prop')

    // 2.x compat v-bind:foo.sync -> v-model:foo
    if (__COMPAT__ && dirName === 'bind' && arg) {
      if (
        modifiers.includes('sync') &&
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_V_BIND_SYNC,
          context,
          loc,
          arg.loc.source
        )
      ) {
        dirName = 'model'
        modifiers.splice(modifiers.indexOf('sync'), 1)
      }

      if (__DEV__ && modifiers.includes('prop')) {
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_V_BIND_PROP,
          context,
          loc
        )
      }
    }

    return {
      type: NodeTypes.DIRECTIVE,
      name: dirName,
      exp: value && {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content: value.content,
        isStatic: false,
        // Treat as non-constant by default. This can be potentially set to
        // other values by `transformExpression` to make it eligible for hoisting.
        constType: ConstantTypes.NOT_CONSTANT,
        loc: value.loc
      },
      arg, //指令参数
      modifiers,//指令修饰符
      loc
    }
  }

  // missing directive name or illegal directive name
  if (!context.inVPre && startsWith(name, 'v-')) {
    emitError(context, ErrorCodes.X_MISSING_DIRECTIVE_NAME)
  }

  return {
    type: NodeTypes.ATTRIBUTE,
    name,
    value: value && {
      type: NodeTypes.TEXT,
      content: value.content,
      loc: value.loc
    },
    loc
  }
}

// 根据" '的匹配 对属性值的解析处理
function parseAttributeValue(context: ParserContext): AttributeValue {
  const start = getCursor(context)
  let content: string

  const quote = context.source[0]
  const isQuoted = quote === `"` || quote === `'`
  if (isQuoted) { // 使用" '包裹的值
    // Quoted value.
    advanceBy(context, 1);

    const endIndex = context.source.indexOf(quote)
    if (endIndex === -1) { //非法属性值,后续template字符串不处理  直接截取完
      content = parseTextData(
        context,
        context.source.length,
        TextModes.ATTRIBUTE_VALUE
      )
    } else {
      content = parseTextData(context, endIndex, TextModes.ATTRIBUTE_VALUE)
      advanceBy(context, 1)
    }
  } else { //TODO 此情况的处理
    // Unquoted boolean 属性 没有属性值
    const match = /^[^\t\r\n\f >]+/.exec(context.source)
    if (!match) {
      return undefined
    }
    const unexpectedChars = /["'<=`]/g
    let m: RegExpExecArray | null
    while ((m = unexpectedChars.exec(match[0]))) {
      emitError(
        context,
        ErrorCodes.UNEXPECTED_CHARACTER_IN_UNQUOTED_ATTRIBUTE_VALUE,
        m.index
      )
    }
    content = parseTextData(context, match[0].length, TextModes.ATTRIBUTE_VALUE)
  }

  return { content, isQuoted, loc: getSelection(context, start) }
}

// 解析模板字符串{{***}}内的表达式
function parseInterpolation(
  context: ParserContext,
  mode: TextModes
): InterpolationNode | undefined {
  const [open, close] = context.options.delimiters // open {{   close }}
  __TEST__ && assert(startsWith(context.source, open))

  //查找表达式结束的位置
  const closeIndex = context.source.indexOf(close, open.length)
  if (closeIndex === -1) { //缺少与{{ 对应的}}结束的位置
    emitError(context, ErrorCodes.X_MISSING_INTERPOLATION_END)
    return undefined
  }

  const start = getCursor(context)
  advanceBy(context, open.length)
  const innerStart = getCursor(context)
  const innerEnd = getCursor(context)
  const rawContentLength = closeIndex - open.length //表达式长度
  const rawContent = context.source.slice(0, rawContentLength)//表达式内容
  const preTrimContent = parseTextData(context, rawContentLength, mode)// {{'&lt;' + name}}中的&lt;字符会被转换 <
  const content = preTrimContent.trim()
  const startOffset = preTrimContent.indexOf(content)
  if (startOffset > 0) { //处理扣空白字符
    advancePositionWithMutation(innerStart, rawContent, startOffset)
  }
  const endOffset =
    rawContentLength - (preTrimContent.length - content.length - startOffset)
  advancePositionWithMutation(innerEnd, rawContent, endOffset)
  advanceBy(context, close.length) //处理完表达式,游标向前移动

  return {
    type: NodeTypes.INTERPOLATION, //插值表达式
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION, //简单表达式
      isStatic: false,
      // Set `isConstant` to false by default and will decide in transformExpression
      constType: ConstantTypes.NOT_CONSTANT,
      content,
      loc: getSelection(context, innerStart, innerEnd)
    },
    loc: getSelection(context, start)
  }
}

// 解析文本字符串
function parseText(context: ParserContext, mode: TextModes): TextNode {
  __TEST__ && assert(context.source.length > 0)

  // 结束的标识符
  const endTokens =
    mode === TextModes.CDATA ? [']]>'] : ['<', context.options.delimiters[0]]

  let endIndex = context.source.length
  //第一个 {  或者 <  取两者中较远的字符作为结束标识符 中间的内容会被解析为文本节点 }
  for (let i = 0; i < endTokens.length; i++) {
    const index = context.source.indexOf(endTokens[i], 1)
    if (index !== -1 && endIndex > index) {
      endIndex = index
    }
  }

  __TEST__ && assert(endIndex > 0)

  const start = getCursor(context)
  const content = parseTextData(context, endIndex, mode) //处理之后advanceBy会更新context中游标的位置

  return {
    type: NodeTypes.TEXT,
    content,
    loc: getSelection(context, start)
  }
}

/**
 * Get text data with a given length from the current location.
 * This translates HTML entities in the text data.
 * 针对&lt;这些实体字符使用decodeEntities方法进行转换
 */
function parseTextData(
  context: ParserContext,
  length: number,
  mode: TextModes
): string {
  // 截取文本字符串
  const rawText = context.source.slice(0, length)
  advanceBy(context, length) //移动游标
  if (
    mode === TextModes.RAWTEXT ||
    mode === TextModes.CDATA ||
    !rawText.includes('&')
  ) {
    return rawText
  } else {
    // DATA or RCDATA containing "&"". Entity decoding required.
    return context.options.decodeEntities(
      rawText,
      mode === TextModes.ATTRIBUTE_VALUE //是否作为属性
    )
  }
}

// 获取游标的位置
function getCursor(context: ParserContext): Position {
  const { column, line, offset } = context
  return { column, line, offset }
}

//根据start end 位置获取代码片段
function getSelection(
  context: ParserContext,
  start: Position,
  end?: Position//不传入则会当前游标所处的位置
): SourceLocation {
  end = end || getCursor(context)
  return {
    start,
    end,
    source: context.originalSource.slice(start.offset, end.offset) //利用开始和结束位置offset的差值来截取内容
  }
}

//栈中末尾的节点数据
function last<T>(xs: T[]): T | undefined {
  return xs[xs.length - 1]
}

// 查看source字符串是否以searchString开头 用来匹配标签 属性 等
function startsWith(source: string, searchString: string): boolean {
  return source.startsWith(searchString)
}

// 游标前进的位数 numberOfCharacters,然后更新source
function advanceBy(context: ParserContext, numberOfCharacters: number): void {
  const { source } = context
  __TEST__ && assert(numberOfCharacters <= source.length)
  advancePositionWithMutation(context, source, numberOfCharacters)
  context.source = source.slice(numberOfCharacters) //更新还未处理的template 字符串
}

// 正则匹配空白字符,然后移动游标位置
function advanceSpaces(context: ParserContext): void {
  const match = /^[\t\r\n\f ]+/.exec(context.source)
  if (match) {
    advanceBy(context, match[0].length)
  }
}

//前进numberOfCharacters长度然后返回新的pos,但并不对context中的pos进行实际的改动
function getNewPosition(
  context: ParserContext,
  start: Position,
  numberOfCharacters: number
): Position {
  return advancePositionWithClone(
    start,
    context.originalSource.slice(start.offset, numberOfCharacters),
    numberOfCharacters
  )
}

// 根据parse解析的位置来创建编译错误
function emitError(
  context: ParserContext,
  code: ErrorCodes,
  offset?: number, //出错位置 偏移量
  loc: Position = getCursor(context)
): void {
  if (offset) {
    loc.offset += offset
    loc.column += offset
  }
  context.options.onError(
    createCompilerError(code, {
      start: loc,
      end: loc,
      source: ''
    })
  )
}

// 是否匹配到了对应的开始标签
function isEnd(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): boolean {
  const s = context.source

  switch (mode) {
    case TextModes.DATA:
      if (startsWith(s, '</')) {
        // TODO: probably bad performance 堆栈上向上查找是否有对应的开始标签 查找最近的一个
        for (let i = ancestors.length - 1; i >= 0; --i) {
          if (startsWithEndTagOpen(s, ancestors[i].tag)) {
            return true
          }
        }
      }
      break

    case TextModes.RCDATA:
    case TextModes.RAWTEXT: { //自闭和标签的处理
      const parent = last(ancestors)
      if (parent && startsWithEndTagOpen(s, parent.tag)) {
        return true
      }
      break
    }

    case TextModes.CDATA:
      if (startsWith(s, ']]>')) {
        return true
      }
      break
  }

  return !s
}

// 查看是否以tag标签结果
function startsWithEndTagOpen(source: string, tag: string): boolean {
  return (
    startsWith(source, '</') &&
    source.slice(2, 2 + tag.length).toLowerCase() === tag.toLowerCase() &&
    /[\t\r\n\f />]/.test(source[2 + tag.length] || '>') //结束标签上不存在任何属性 tag  与 >之间只能有空格和换行符
  )
}
