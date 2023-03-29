import { RendererOptions } from '@vue/runtime-core'

export const svgNS = 'http://www.w3.org/2000/svg'

const doc = (typeof document !== 'undefined' ? document : null) as Document

const templateContainer = doc && /*#__PURE__*/ doc.createElement('template')


// 浏览器环境下,对dom节点的操作方法
export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  remove: child => { //child节点自身移除
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },
  // 创建tag标签名的dom节点,is属性会进行特别处理
  createElement: (tag, isSVG, is, props): Element => {
    const el = isSVG
      ? doc.createElementNS(svgNS, tag)
      : doc.createElement(tag, is ? { is } : undefined)

    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }

    return el
  },
  // 创建text文本节点
  createText: text => doc.createTextNode(text),
  // 创建注释节点
  createComment: text => doc.createComment(text),
  // 设置节点文本内容
  setText: (node, text) => {
    node.nodeValue = text
  },
  // 设置元素的文本内容
  setElementText: (el, text) => {
    el.textContent = text
  },
  // 父节点
  parentNode: node => node.parentNode as Element | null,
  // 相邻的兄弟节点,需要注意文本为''的文本节点,下一个相邻兄弟节点不存在则返回null
  nextSibling: node => node.nextSibling,

  querySelector: selector => doc.querySelector(selector),

  setScopeId(el, id) {
    el.setAttribute(id, '')
  },
  //克隆dom节点 cloneNode操作dom节点上的value也会被复制.在vue patch算法中value属性会被放置在_value中
  cloneNode(el) {
    const cloned = el.cloneNode(true)
    // #3072
    // - in `patchDOMProp`, we store the actual value in the `el._value` property.
    // - normally, elements using `:value` bindings will not be hoisted, but if
    //   the bound value is a constant, e.g. `:value="true"` - they do get
    //   hoisted.
    // - in production, hoisted nodes are cloned when subsequent inserts, but
    //   cloneNode() does not copy the custom property we attached.
    // - This may need to account for other custom DOM properties we attach to
    //   elements in addition to `_value` in the future.
    if (`_value` in el) {
      ;(cloned as any)._value = (el as any)._value
    }
    return cloned
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  // 静态节点只能是通过vue的compiled templates 生成的.template的处理过程中vue会处理其中的安全新问题
  // anthor表示插入的锚点,content插入在anchor节点前
  // TODO start 和end的具体内容  start 和 end是用来处理vue多根节点的情况
  insertStaticContent(content, parent, anchor, isSVG, start, end) {
    // <parent> before | first ... last | anchor </parent>
    const before = anchor ? anchor.previousSibling : parent.lastChild
    // #5308 can only take cached path if:
    // - has a single root node
    // - nextSibling info is still available
    if (start && (start === end || start.nextSibling)) {
      // cached
      while (true) {
        parent.insertBefore(start!.cloneNode(true), anchor)
        if (start === end || !(start = start!.nextSibling)) break
      }
    } else {
      // fresh insert TODO 这里使用innerHTML插入节点,所以内容可能不安全
      templateContainer.innerHTML = isSVG ? `<svg>${content}</svg>` : content
      const template = templateContainer.content
      if (isSVG) {
        // remove outer svg wrapper
        const wrapper = template.firstChild!
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild)
        }
        template.removeChild(wrapper)
      }
      parent.insertBefore(template, anchor)
    }
    return [
      // first
      before ? before.nextSibling! : parent.firstChild!,
      // last
      anchor ? anchor.previousSibling! : parent.lastChild!
    ]
  }
}
