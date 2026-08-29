import type { Edge, Node as FlowNode } from '@xyflow/react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { Node as DomainNode } from '../domain/mindmap/Node'

export const CANVAS_NODE_WIDTH = 220
export const CANVAS_NODE_HEIGHT = 44
const HORIZONTAL_GAP = 90
const VERTICAL_GAP = 20

export const MIND_MAP_NODE_TYPE = 'mindMapNode'

export interface CanvasNodeData extends Record<string, unknown> {
  node: DomainNode
}

export type MindMapFlowNode = FlowNode<CanvasNodeData>

/**
 * MindMap集約の木構造から、React Flow用のノード/エッジ配列を算出する
 * (自動レイアウト方式。ノードの位置はドメイン層に保存しない)。
 * 折りたたまれたノードの子孫はレイアウト計算から除外する。
 * 非表示のルートノード自体は描画しない。
 */
export function computeCanvasLayout(root: DomainNode): {
  nodes: MindMapFlowNode[]
  edges: Edge[]
} {
  if (root.children.length === 0) {
    return { nodes: [], edges: [] }
  }

  const hierarchyRoot = hierarchy(root, (n) => (n.collapsed ? undefined : [...n.children]))
  const layout = tree<DomainNode>().nodeSize([
    CANVAS_NODE_HEIGHT + VERTICAL_GAP,
    CANVAS_NODE_WIDTH + HORIZONTAL_GAP,
  ])
  const positioned = layout(hierarchyRoot)

  const nodes: MindMapFlowNode[] = []
  const edges: Edge[] = []

  positioned.each((h) => {
    if (h.data === root) {
      return
    }
    nodes.push({
      id: h.data.id.value,
      type: MIND_MAP_NODE_TYPE,
      // d3-hierarchyの水平ツリーレイアウトでは深さ(y)を横方向、兄弟順(x)を縦方向として使う
      position: { x: h.y, y: h.x },
      data: { node: h.data },
      draggable: true,
      selectable: false,
    })
    if (h.parent && h.parent.data !== root) {
      edges.push({
        id: `${h.parent.data.id.value}->${h.data.id.value}`,
        source: h.parent.data.id.value,
        target: h.data.id.value,
        type: 'smoothstep',
      })
    }
  })

  return { nodes, edges }
}
