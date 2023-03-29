export const enum SlotFlags {
  /**
   * Stable slots that only reference slot props or context state. The slot
   * can fully capture its own dependencies so when passed down the parent won't
   * need to force the child to update.
   */
  STABLE = 1,
  /**
   * Slots that reference scope variables (v-for or an outer slot prop), or
   * has conditional structure (v-if, v-for). The parent will need to force
   * the child to update because the slot does not fully capture its dependencies.
   * v-if v-for 指令存在时,插槽是动态的 每次都需要重新渲染
   */
  DYNAMIC = 2,
  /**
   * `<slot/>` being forwarded into a child component. Whether the parent needs
   * to update the child is dependent on what kind of slots the parent itself
   * received. This has to be refined at runtime, when the child's vnode
   * is being created (in `normalizeChildren`)
   * TODO 插槽组件转发到了子组件的内部 这种越层级插槽的处理
   */
  FORWARDED = 3
}

/**
 * Dev only
 */
export const slotFlagsText = {
  [SlotFlags.STABLE]: 'STABLE', //父组件更新不需要强制更新插槽组件,插槽引用的
  [SlotFlags.DYNAMIC]: 'DYNAMIC',  //父组件更新 需要更新插槽组件
  [SlotFlags.FORWARDED]: 'FORWARDED'//插槽组件转发到了子组件的内部 这种越层级插槽的处理
}
