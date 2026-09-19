import type { Edge, Node as FlowNode } from '@xyflow/react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { Node as DomainNode } from '../domain/mindmap/Node'

export const CANVAS_NODE_WIDTH = 220
export const CANVAS_NODE_HEIGHT = 44
const HORIZONTAL_GAP = 90
const VERTICAL_GAP = 20

// App.cssの`.attachment-thumbnail`(96px)+`.attachment-viewer`の上下余白(8px)分、
// 添付ありノードは`.mindmap-node`が縦に伸びる。nodeSizeの1単位(ノード高さ+隙間)に
// 換算し、余分に確保すべき間隔の目安として使う(実測ではなく概算)。
const ATTACHMENT_EXTRA_HEIGHT_PX = 96 + 8
const ATTACHMENT_EXTRA_SEPARATION_UNITS = Math.ceil(ATTACHMENT_EXTRA_HEIGHT_PX / (CANVAS_NODE_HEIGHT + VERTICAL_GAP))

export const MIND_MAP_NODE_TYPE = 'mindMapNode'

export interface CanvasNodeData extends Record<string, unknown> {
  node: DomainNode
}

export type MindMapFlowNode = FlowNode<CanvasNodeData>

function extraSeparationUnits(node: DomainNode): number {
  return node.attachments.length > 0 ? ATTACHMENT_EXTRA_SEPARATION_UNITS : 0
}

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
  const layout = tree<DomainNode>()
    .nodeSize([CANVAS_NODE_HEIGHT + VERTICAL_GAP, CANVAS_NODE_WIDTH + HORIZONTAL_GAP])
    .separation((a, b) => {
      // 画像添付付きノードはサムネイル分`.mindmap-node`が縦に大きく伸びるため、
      // 標準の間隔(nodeSize)のままだと隣接ノードと重なり合ってしまう。
      // d3-hierarchyはノードごとの可変サイズを直接サポートしないため、
      // 添付ありノードの間隔を広めに見積もって重なりを避ける(近似値。
      // `.attachment-viewer`のサムネイル高さ96px+余白分をnodeSize単位に換算)。
      const base = a.parent === b.parent ? 1 : 2
      return base + (extraSeparationUnits(a.data) + extraSeparationUnits(b.data)) / 2
    })
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
