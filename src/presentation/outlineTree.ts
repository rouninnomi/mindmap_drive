import type { Node } from '../domain/mindmap/Node'

/** 折りたたみを考慮し、画面に表示される順序でノードを平坦化する(キーボードでの上下移動に使う)。 */
export function flattenVisibleNodes(root: Node): Node[] {
  const result: Node[] = []
  const visit = (node: Node): void => {
    for (const child of node.children) {
      result.push(child)
      if (!child.collapsed) {
        visit(child)
      }
    }
  }
  visit(root)
  return result
}
