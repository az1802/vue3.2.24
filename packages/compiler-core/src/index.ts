export { baseCompile } from './compile'

// Also expose lower level APIs & types
export {
  CompilerOptions, //编译options
  ParserOptions,//模板解析options
  TransformOptions,//字符串转换为ast语法树options
  CodegenOptions,//ast语法树转换为code时候的options
  HoistTransform,//静态节点转换
  BindingMetadata,
  BindingTypes
} from './options'
export { baseParse, TextModes } from './parse'
export {
  transform,//ast转换函数
  TransformContext,//transform 上下文
  createTransformContext,
  traverseNode,//遍历astnode
  createStructuralDirectiveTransform,//创建结构化指令的transform函数(v-if v-for)
  NodeTransform,//ast单个节点transform
  StructuralDirectiveTransform,//结构化指令转换
  DirectiveTransform//指令转换
} from './transform'
export { generate, CodegenContext, CodegenResult } from './codegen'
export {
  ErrorCodes,
  CoreCompilerError,
  CompilerError,
  createCompilerError
} from './errors'

export * from './ast'
export * from './utils'
export * from './babelUtils'
export * from './runtimeHelpers'

export { getBaseTransformPreset, TransformPreset } from './compile'
export { transformModel } from './transforms/vModel'
export { transformOn } from './transforms/vOn'
export { transformBind } from './transforms/vBind'
export { noopDirectiveTransform } from './transforms/noopDirectiveTransform'
export { processIf } from './transforms/vIf'
export { processFor, createForLoopParams } from './transforms/vFor'
export {
  transformExpression,
  processExpression
} from './transforms/transformExpression'
export {
  buildSlots,
  SlotFnBuilder,
  trackVForSlotScopes,
  trackSlotScopes
} from './transforms/vSlot'
export {
  transformElement,
  resolveComponentType,
  buildProps,
  buildDirectiveArgs,
  PropsExpression
} from './transforms/transformElement'
export { processSlotOutlet } from './transforms/transformSlotOutlet'
export { getConstantType } from './transforms/hoistStatic'
export { generateCodeFrame } from '@vue/shared'

// v2 compat only
export {
  checkCompatEnabled,
  warnDeprecation,
  CompilerDeprecationTypes
} from './compat/compatConfig'
