import { ElementNode, Namespace, TemplateChildNode, ParentNode } from './ast'
import { TextModes } from './parse'
import { CompilerError } from './errors'
import {
  NodeTransform,
  DirectiveTransform,
  TransformContext
} from './transform'
import { CompilerCompatOptions } from './compat/compatConfig'
import { ParserPlugin } from '@babel/parser'

export interface ErrorHandlingOptions {
  onWarn?: (warning: CompilerError) => void
  onError?: (error: CompilerError) => void
}

// template字符串parse解析过程传入options
export interface ParserOptions
  extends ErrorHandlingOptions,
    CompilerCompatOptions {
  /**
   * e.g. platform native elements, e.g. `<div>` for browsers
   */
  isNativeTag?: (tag: string) => boolean //平台的原生标签
  /**
   * e.g. native elements that can self-close, e.g. `<img>`, `<br>`, `<hr>`
   */
  isVoidTag?: (tag: string) => boolean //自关闭标签
  /**
   * e.g. elements that should preserve whitespace inside, e.g. `<pre>`
   */
  isPreTag?: (tag: string) => boolean//pre标签,内部样式不会嘎变
  /**
   * Platform-specific built-in components e.g. `<Transition>`
   */
  isBuiltInComponent?: (tag: string) => symbol | void //是否是内置组件 Transition TransitionGroup KeepAlive Slot Template
  /**
   * Separate option for end users to extend the native elements list
   */
  isCustomElement?: (tag: string) => boolean | void //是否原生的Element  defineCustomElement web Component
  /**
   * Get tag namespace
   */
  getNamespace?: (tag: string, parent: ElementNode | undefined) => Namespace //获取标签的namespace
  /**
   * Get text parsing mode for this element
   */
  getTextMode?: (
    node: ElementNode,
    parent: ElementNode | undefined
  ) => TextModes
  /**
   * @default ['{{', '}}']
   */
  delimiters?: [string, string] //模板字符串解析符号
  /**
   * Whitespace handling strategy
   */
  whitespace?: 'preserve' | 'condense' //空格符号的处理
  /**
   * Only needed for DOM compilers
   */
  decodeEntities?: (rawText: string, asAttr: boolean) => string
  /**
   * Whether to keep comments in the templates AST.
   * This defaults to `true` in development and `false` in production builds.
   */
  comments?: boolean //对注释的处理
}

export type HoistTransform = (
  children: TemplateChildNode[],
  context: TransformContext,
  parent: ParentNode
) => void

export const enum BindingTypes {
  /**
   * returned from data()
   */
  DATA = 'data',
  /**
   * declared as a prop
   */
  PROPS = 'props',
  /**
   * a local alias of a `<script setup>` destructured prop.
   * the original is stored in __propsAliases of the bindingMetadata object.
   */
  PROPS_ALIASED = 'props-aliased',
  /**
   * a let binding (may or may not be a ref)
   */
  SETUP_LET = 'setup-let',
  /**
   * a const binding that can never be a ref.
   * these bindings don't need `unref()` calls when processed in inlined
   * template expressions.
   */
  SETUP_CONST = 'setup-const',
  /**
   * a const binding that does not need `unref()`, but may be mutated.
   */
  SETUP_REACTIVE_CONST = 'setup-reactive-const',
  /**
   * a const binding that may be a ref.
   */
  SETUP_MAYBE_REF = 'setup-maybe-ref',
  /**
   * bindings that are guaranteed to be refs
   */
  SETUP_REF = 'setup-ref',
  /**
   * declared by other options, e.g. computed, inject
   */
  OPTIONS = 'options'
}

export type BindingMetadata = {
  [key: string]: BindingTypes | undefined
} & {
  __isScriptSetup?: boolean
  __propsAliases?: Record<string, string>
}

// 模板字符串进行转换时候的处理
interface SharedTransformCodegenOptions {
  /**
   * Transform expressions like {{ foo }} to `_ctx.foo`.
   * If this option is false, the generated code will be wrapped in a
   * `with (this) { ... }` block.
   * - This is force-enabled in module mode, since modules are by default strict
   * and cannot use `with`
   * @default mode === 'module'
   */
  prefixIdentifiers?: boolean //标记前缀代码生成模式的
  /**
   * Control whether generate SSR-optimized render functions instead.
   * The resulting function must be attached to the component via the
   * `ssrRender` option instead of `render`.
   *
   * When compiler generates code for SSR's fallback branch, we need to set it to false:
   *  - context.ssr = false
   *
   * see `subTransform` in `ssrTransformComponent.ts`
   */
  ssr?: boolean
  /**
   * Indicates whether the compiler generates code for SSR,
   * it is always true when generating code for SSR,
   * regardless of whether we are generating code for SSR's fallback branch,
   * this means that when the compiler generates code for SSR's fallback branch:
   *  - context.ssr = false
   *  - context.inSSR = true
   */
  inSSR?: boolean
  /**
   * Optional binding metadata analyzed from script - used to optimize
   * binding access when `prefixIdentifiers` is enabled.
   */
  bindingMetadata?: BindingMetadata
  /**
   * Compile the function for inlining inside setup().
   * This allows the function to directly access setup() local bindings.
   */
  inline?: boolean
  /**
   * Indicates that transforms and codegen should try to output valid TS code
   */
  isTS?: boolean
  /**
   * Filename for source map generation.
   * Also used for self-recursive reference in templates
   * @default 'template.vue.html'
   */
  filename?: string
}

// transform 转换过程中的参数
export interface TransformOptions
  extends SharedTransformCodegenOptions,
    ErrorHandlingOptions,
    CompilerCompatOptions {
  /**
   * An array of node transforms to be applied to every AST node.
   * 节点的转换数组,会作用在每一个ast节点上
   */
  nodeTransforms?: NodeTransform[]
  /**
   * An object of { name: transform } to be applied to every directive attribute
   * node found on element nodes.
   * 指令的转换数组会作用在每一个有指令的ast节点上
   */
  directiveTransforms?: Record<string, DirectiveTransform | undefined>
  /**
   * An optional hook to transform a node being hoisted.
   * used by compiler-dom to turn hoisted nodes into stringified HTML vnodes.
   * @default null
   * 静态节点被提升,加快后续render函数运行
   */
  transformHoist?: HoistTransform | null
  /**
   * If the pairing runtime provides additional built-in elements, use this to
   * mark them as built-in so the compiler will generate component vnodes
   * for them.
   */
  isBuiltInComponent?: (tag: string) => symbol | void
  /**
   * Used by some transforms that expects only native elements
   */
  isCustomElement?: (tag: string) => boolean | void
  /**
   * Transform expressions like {{ foo }} to `_ctx.foo`.
   * If this option is false, the generated code will be wrapped in a
   * `with (this) { ... }` block.
   * - This is force-enabled in module mode, since modules are by default strict
   * and cannot use `with`
   * @default mode === 'module'
   */
  prefixIdentifiers?: boolean
  /**
   * Hoist static VNodes and props objects to `_hoisted_x` constants
   * @default false
   */
  hoistStatic?: boolean //静态提升
  /**
   * Cache v-on handlers to avoid creating new inline functions on each render,
   * also avoids the need for dynamically patching the handlers by wrapping it.
   * e.g `@click="foo"` by default is compiled to `{ onClick: foo }`. With this
   * option it's compiled to:
   * ```js
   * { onClick: _cache[0] || (_cache[0] = e => _ctx.foo(e)) }
   * ```
   * - Requires "prefixIdentifiers" to be enabled because it relies on scope
   * analysis to determine if a handler is safe to cache.
   * 缓存内联函数,比如事件,每次只是真正运行的函数,包裹函数不会发生变化,这样不用重新移除 添加事件
   * @default false
   */
  cacheHandlers?: boolean //对一些内联方法函数,在render的过程中进行环境 下次render 进行重复利用
  /**
   * A list of parser plugins to enable for `@babel/parser`, which is used to
   * parse expressions in bindings and interpolations.
   * https://babeljs.io/docs/en/next/babel-parser#plugins
   */
  expressionPlugins?: ParserPlugin[] //解析表达式 会使用babel进行转义来兼容es5
  /**
   * SFC scoped styles ID
   */
  scopeId?: string | null //样式的scoped Id
  /**
   * Indicates this SFC template has used :slotted in its styles
   * Defaults to `true` for backwards compatibility - SFC tooling should set it
   * to `false` if no `:slotted` usage is detected in `<style>` 使用:slotted (selector)来控制slot中的样式
   */
  slotted?: boolean
  /**
   * SFC `<style vars>` injection string
   * Should already be an object expression, e.g. `{ 'xxxx-color': color }`
   * needed to render inline CSS variables on component root
   */
  ssrCssVars?: string
}

// 编码生成时的
export interface CodegenOptions extends SharedTransformCodegenOptions {
  /**
   * - `module` mode will generate ES module import statements for helpers
   * and export the render function as the default export.
   * - `function` mode will generate a single `const { helpers... } = Vue`
   * statement and return the render function. It expects `Vue` to be globally
   * available (or passed by wrapping the code with an IIFE). It is meant to be
   * used with `new Function(code)()` to generate a render function at runtime.
   * @default 'function'
   * module 会生成module形式的代码字符串  functioN 则是render function 字符串
   */
  mode?: 'module' | 'function'
  /**
   * Generate source map?
   * @default false
   */
  sourceMap?: boolean
  /**
   * SFC scoped styles ID
   */
  scopeId?: string | null
  /**
   * Option to optimize helper import bindings via variable assignment
   * (only used for webpack code-split)
   * @default false
   * TODO 导入的优化,将一些辅助函数提升单独打包,避免重复导入
   */
  optimizeImports?: boolean
  /**
   * Customize where to import runtime helpers from.
   * @default 'vue'
   */
  runtimeModuleName?: string
  /**
   * Customize where to import ssr runtime helpers from/**
   * @default 'vue/server-renderer'
   */
  ssrRuntimeModuleName?: string
  /**
   * Customize the global variable name of `Vue` to get helpers from
   * in function mode
   * @default 'Vue'
   */
  runtimeGlobalName?: string
}

export type CompilerOptions = ParserOptions & TransformOptions & CodegenOptions
