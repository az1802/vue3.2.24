import { CompilerOptions } from './options'
import { baseParse } from './parse'
import { transform, NodeTransform, DirectiveTransform } from './transform'
import { generate, CodegenResult } from './codegen'
import { RootNode } from './ast'
import { isString, extend } from '@vue/shared'
import { transformIf } from './transforms/vIf'
import { transformFor } from './transforms/vFor'
import { transformExpression } from './transforms/transformExpression'
import { transformSlotOutlet } from './transforms/transformSlotOutlet'
import { transformElement } from './transforms/transformElement'
import { transformOn } from './transforms/vOn'
import { transformBind } from './transforms/vBind'
import { trackSlotScopes, trackVForSlotScopes } from './transforms/vSlot'
import { transformText } from './transforms/transformText'
import { transformOnce } from './transforms/vOnce'
import { transformModel } from './transforms/vModel'
import { transformFilter } from './compat/transformFilter'
import { defaultOnError, createCompilerError, ErrorCodes } from './errors'
import { transformMemo } from './transforms/vMemo'

export type TransformPreset = [
  NodeTransform[],
  Record<string, DirectiveTransform>
]

// 不同指令对ast 节点的操作
export function getBaseTransformPreset(
  prefixIdentifiers?: boolean
): TransformPreset {
  return [
    [
      transformOnce,
      transformIf,
      transformMemo,
      transformFor,
      ...(__COMPAT__ ? [transformFilter] : []), //兼容vue2的过滤器处理
      ...(!__BROWSER__ && prefixIdentifiers
        ? [
            // order is important
            trackVForSlotScopes,
            transformExpression
          ]
        : __BROWSER__ && __DEV__
        ? [transformExpression]
        : []),
      transformSlotOutlet,
      transformElement,
      trackSlotScopes,
      transformText
    ],
    {
      on: transformOn,
      bind: transformBind,
      model: transformModel
    }
  ]
}

// we name it `baseCompile` so that higher order compilers like
// @vue/compiler-dom can export `compile` while re-exporting everything else.
// 核心的编译流程,options 提供了注入了很多工具方法,compile中使用
export function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  const onError = options.onError || defaultOnError
  const isModuleMode = options.mode === 'module' //
  /* istanbul ignore if */
  // TODO 对options 合法性的校验 浏览器下不支持prefixIdentifiers, es module
  if (__BROWSER__) {
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (isModuleMode) {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }

  const prefixIdentifiers =
    !__BROWSER__ && (options.prefixIdentifiers === true || isModuleMode)
  if (!prefixIdentifiers && options.cacheHandlers) {
    onError(createCompilerError(ErrorCodes.X_CACHE_HANDLER_NOT_SUPPORTED))
  }
  if (options.scopeId && !isModuleMode) {//scopeId 仅在es module下支持
    onError(createCompilerError(ErrorCodes.X_SCOPE_ID_NOT_SUPPORTED))
  }

  // template自渡船解析为ast语法树
  const ast = isString(template) ? baseParse(template, options) : template
  console.log('ast: ', JSON.parse(JSON.stringify(ast)));
  // 获取节点的指令转换 和 普通转换方法
  const [nodeTransforms, directiveTransforms] =
    getBaseTransformPreset(prefixIdentifiers)

  if (!__BROWSER__ && options.isTS) {
    const { expressionPlugins } = options
    if (!expressionPlugins || !expressionPlugins.includes('typescript')) {
      options.expressionPlugins = [...(expressionPlugins || []), 'typescript']
    }
  }

  // 根据不同的指令,属性对ast语法树进行转换
  transform(
    ast,
    extend({}, options, {
      prefixIdentifiers,
      nodeTransforms: [
        ...nodeTransforms,
        ...(options.nodeTransforms || []) // user transforms 自定义的node transform
      ],
      directiveTransforms: extend(
        {},
        directiveTransforms, // core 默认指令
        options.directiveTransforms || {} // user transforms
      )
    })
  )
  console.log('ast transform: ', ast);
  // 根据新的语法树生成render函数代码
  return generate(
    ast,
    extend({}, options, {
      prefixIdentifiers
    })
  )
}
