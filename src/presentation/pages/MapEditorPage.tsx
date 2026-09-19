import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { AttachmentId, MapId, NodeId } from '../../domain/mindmap/valueObjects'
import { MapName, NodeId as NodeIdValueObject, NodeText } from '../../domain/mindmap/valueObjects'
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  computeCanvasLayout,
  MIND_MAP_NODE_TYPE,
  type MindMapFlowNode,
} from '../canvasLayout'
import { MindMapCanvasNode } from '../components/MindMapCanvasNode'
import { OutlineEditorContext, type OutlineEditorContextValue } from '../components/OutlineEditorContext'
import { Toolbar } from '../components/Toolbar'
import { useMindMapEditor } from '../hooks/useMindMapEditor'
import { flattenVisibleNodes } from '../outlineTree'

const NODE_TYPES = { [MIND_MAP_NODE_TYPE]: MindMapCanvasNode }

interface MapEditorPageProps {
  mapId: MapId
  onBack: () => void
}

/**
 * マップ編集画面: ノード&エッジのキャンバス表示(React Flow)によるアウトライン編集。
 *
 * ノードの座標はドメイン層に保存せず、木構造から`computeCanvasLayout`で毎回自動計算する
 * (ユーザーが指定要望した「自動レイアウト」方式)。ノードをドラッグして別のノードに
 * 重ねて離すと、そのノードの子として再親子付けされる(`editor.moveNode`)。有効な
 * ドロップ先が無ければ、レイアウトの再計算により元の位置へ自動的に戻る(座標を
 * 保存していないため、これは追加コード無しで自然に実現される)。
 *
 * 「選択(selected)」と「文字入力(editing)」の2モードを持つ(ユーザーフィードバックにより
 * 当初のアウトライン型から変更。詳細は`docs/requirements.md` 4.3節の注記を参照):
 * - ノードをクリックすると選択状態になる(テキストは地の文表示のまま、`<input>`にはならない)
 * - 選択中の`Enter`は(文字入力中と同じく)常に新規の兄弟ノードを追加し、即座にその
 *   文字入力モードに入る。既存ノードのテキストを後から編集したい場合はダブルクリックで
 *   文字入力モードに入る
 * - 文字入力中に`Esc`を押すと、ノードは選択されたまま文字入力モードのみを抜ける
 * - 子ノード追加は選択中・文字入力中どちらも`Tab`で直接作成する(表にある「インデント」
 *   動作としては実装せず、再親子付けはドラッグ&ドロップのみで行う。そのためアウトデント用の
 *   ショートカットは無い)。文字入力中の`Tab`は単語区切り等の標準動作は無いため、そのまま
 *   子ノード作成に割り当てて問題ない
 * - ノード削除(`Backspace`/`Delete`)は、選択中はテキストの有無によらず即削除。文字入力中は
 *   従来通りテキストが空の時のみノード自体を削除する(それ以外は通常の文字削除)
 * - 折りたたみ/展開は選択中のみ`Ctrl+←`(折りたたみ)/`Ctrl+→`(展開)に割り当てる
 *   (文字入力中はテキストカーソルの単語移動という標準動作と衝突するため割り当てない)
 * - 画像添付は選択中・文字入力中どちらでも`Ctrl+I`。ノードへ画像ファイルを直接
 *   ドラッグ&ドロップして添付することもできる
 * - ノード間移動の↑↓: 選択中・文字入力中どちらもDFS順で前後のノードへ移動する
 * - ノード間移動の←→: 選択中のみ、←で親ノードへ、→で最初の子ノードへ移動する
 *   (折りたたまれている場合や子が無い場合、→は何もしない)。文字入力中は標準の
 *   テキストカーソル移動を優先し、ノード間移動には割り当てない
 */
export function MapEditorPage({ mapId, onBack }: MapEditorPageProps) {
  const { snapshot, editor } = useMindMapEditor(mapId)

  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  const attachTargetRef = useRef<NodeId | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isDraggingRef = useRef(false)

  const flattened = useMemo(() => {
    if (!snapshot.map) {
      return []
    }
    return flattenVisibleNodes(snapshot.map.rootNode)
    // snapshot.mapは同一インスタンスのまま内部でミューテートされるため、
    // snapshot.version(編集のたびに増える)も依存に含めないと再計算されない。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.map, snapshot.version])

  // 構造・内容が変わるたびにレイアウトを再計算する。ドラッグ中は、ユーザーが
  // 動かしている最中の見た目を保つため再計算をスキップする。
  useEffect(() => {
    if (isDraggingRef.current) {
      return
    }
    if (!snapshot.map) {
      setNodes([])
      setEdges([])
      return
    }
    const layout = computeCanvasLayout(snapshot.map.rootNode)
    setNodes(layout.nodes)
    setEdges(layout.edges)
  }, [snapshot.map, snapshot.version, setNodes, setEdges])

  // マップ読み込み直後、トップレベルノードが1つもなければ最初の空ノードを用意する
  // (「思考のスピードを止めない」ため、すぐ入力を始められるようにする)。
  // 対象ノードのDOM(input)がまだ存在しなくても、selectedNodeId/editingNodeIdへの反映だけで
  // よい(実際のフォーカス移動はMindMapCanvasNode自身のマウント時effectが行うため)。
  useEffect(() => {
    if (snapshot.map && snapshot.map.rootNode.children.length === 0) {
      const newId = editor.addChildNode(snapshot.map.rootNode.id, NodeText.empty())
      setSelectedNodeId(newId.value)
      setEditingNodeId(newId.value)
    }
  }, [snapshot.map, editor])

  const commitText = useCallback(
    (nodeId: NodeId, text: string) => {
      editor.updateText(nodeId, NodeText.of(text))
    },
    [editor],
  )

  const handleToggleCollapse = useCallback(
    (nodeId: NodeId) => {
      editor.toggleCollapse(nodeId)
    },
    [editor],
  )

  const handleAttachClick = useCallback((nodeId: NodeId) => {
    attachTargetRef.current = nodeId
    fileInputRef.current?.click()
  }, [])

  const handleRemoveAttachment = useCallback(
    (nodeId: NodeId, attachmentId: AttachmentId) => {
      editor.removeAttachment(nodeId, attachmentId)
    },
    [editor],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const targetId = attachTargetRef.current
      event.target.value = ''
      attachTargetRef.current = null
      if (file && targetId) {
        void editor.attachImage(targetId, file)
      }
    },
    [editor],
  )

  const handleDropImage = useCallback(
    (nodeId: NodeId, file: File) => {
      void editor.attachImage(nodeId, file)
    },
    [editor],
  )

  const handleWrapperClick = useCallback((nodeId: NodeId) => {
    setEditingNodeId(null)
    setSelectedNodeId(nodeId.value)
  }, [])

  // 選択中のEnterは常に新規の兄弟ノードを作るため、既存ノードのテキストを
  // 後から編集したい場合はダブルクリックで文字入力モードに入る。
  const handleWrapperDoubleClick = useCallback((nodeId: NodeId) => {
    setSelectedNodeId(nodeId.value)
    setEditingNodeId(nodeId.value)
  }, [])

  // ノードが「選択」状態(文字入力モードではない)の時のキー操作。
  const handleSelectedKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, nodeId: NodeId) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      if (isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        editor.undo()
        setEditingNodeId(null)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (
        isCtrlOrCmd &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault()
        editor.redo()
        setEditingNodeId(null)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowUp') {
        event.preventDefault()
        editor.moveUp(nodeId)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowDown') {
        event.preventDefault()
        editor.moveDown(nodeId)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowLeft') {
        event.preventDefault()
        const node = flattened.find((n) => n.id.equals(nodeId))
        if (node && node.children.length > 0 && !node.collapsed) {
          editor.toggleCollapse(nodeId)
        }
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowRight') {
        event.preventDefault()
        const node = flattened.find((n) => n.id.equals(nodeId))
        if (node && node.children.length > 0 && node.collapsed) {
          editor.toggleCollapse(nodeId)
        }
        return
      }
      if (isCtrlOrCmd && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        attachTargetRef.current = nodeId
        fileInputRef.current?.click()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const newId = editor.addSiblingNode(nodeId, NodeText.empty())
        setSelectedNodeId(newId.value)
        setEditingNodeId(newId.value)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const newId = editor.addChildNode(nodeId, NodeText.empty())
        setSelectedNodeId(newId.value)
        setEditingNodeId(newId.value)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const fallback = flattened[index - 1] ?? flattened[index + 1] ?? null
        editor.deleteNode(nodeId)
        setEditingNodeId(null)
        setSelectedNodeId(fallback ? fallback.id.value : null)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const prev = flattened[index - 1]
        if (prev) {
          setSelectedNodeId(prev.id.value)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const next = flattened[index + 1]
        if (next) {
          setSelectedNodeId(next.id.value)
        }
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const root = snapshot.map?.rootNode
        const parent = root?.findParentOf(nodeId)
        if (parent && root && !parent.id.equals(root.id)) {
          setSelectedNodeId(parent.id.value)
        }
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const node = flattened.find((n) => n.id.equals(nodeId))
        const firstChild = node?.children[0]
        if (node && !node.collapsed && firstChild) {
          setSelectedNodeId(firstChild.id.value)
        }
      }
    },
    [editor, flattened, snapshot.map],
  )

  // ノードが「文字入力」状態の時のキー操作。
  const handleEditingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      if (isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        editor.undo()
        setEditingNodeId(null)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (
        isCtrlOrCmd &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault()
        editor.redo()
        setEditingNodeId(null)
        setSelectedNodeId(nodeId.value)
        return
      }
      if (isCtrlOrCmd && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        attachTargetRef.current = nodeId
        fileInputRef.current?.click()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const newId = editor.addSiblingNode(nodeId, NodeText.empty())
        setSelectedNodeId(newId.value)
        setEditingNodeId(newId.value)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const newId = editor.addChildNode(nodeId, NodeText.empty())
        setSelectedNodeId(newId.value)
        setEditingNodeId(newId.value)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (currentText !== '') {
          return
        }
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const fallback = flattened[index - 1] ?? flattened[index + 1] ?? null
        editor.deleteNode(nodeId)
        setEditingNodeId(null)
        setSelectedNodeId(fallback ? fallback.id.value : null)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const prev = flattened[index - 1]
        if (prev) {
          setSelectedNodeId(prev.id.value)
          setEditingNodeId(prev.id.value)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const next = flattened[index + 1]
        if (next) {
          setSelectedNodeId(next.id.value)
          setEditingNodeId(next.id.value)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setEditingNodeId(null)
      }
    },
    [editor, flattened],
  )

  const handleNodeDragStart = useCallback<OnNodeDrag<MindMapFlowNode>>(() => {
    isDraggingRef.current = true
  }, [])

  const handleNodeDragStop = useCallback<OnNodeDrag<MindMapFlowNode>>(
    (_event, draggedNode) => {
      isDraggingRef.current = false

      const centerX = draggedNode.position.x + CANVAS_NODE_WIDTH / 2
      const centerY = draggedNode.position.y + CANVAS_NODE_HEIGHT / 2

      const target = nodes.find(
        (candidate) =>
          candidate.id !== draggedNode.id &&
          centerX >= candidate.position.x &&
          centerX <= candidate.position.x + CANVAS_NODE_WIDTH &&
          centerY >= candidate.position.y &&
          centerY <= candidate.position.y + CANVAS_NODE_HEIGHT,
      )

      if (target) {
        try {
          editor.moveNode(NodeIdValueObject.of(draggedNode.id), NodeIdValueObject.of(target.id))
        } catch {
          // 自分自身の子孫へドロップした場合など、無効な再親子付けは無視して
          // レイアウト再計算により元の位置へ戻す。
        }
      }

      // ドラッグの結果に関わらず、正しいレイアウト位置へスナップさせる
      // (座標を保存しない自動レイアウト方式のため)。
      if (snapshot.map) {
        const layout = computeCanvasLayout(snapshot.map.rootNode)
        setNodes(layout.nodes)
        setEdges(layout.edges)
      }
    },
    [editor, nodes, snapshot.map, setNodes, setEdges],
  )

  const handleRename = useCallback(() => {
    if (!snapshot.map) {
      return
    }
    const next = window.prompt('新しいマップ名', snapshot.map.name.value)
    if (!next || !next.trim()) {
      return
    }
    editor.rename(MapName.of(next.trim()))
  }, [editor, snapshot.map])

  const contextValue: OutlineEditorContextValue = useMemo(
    () => ({
      selectedNodeId,
      editingNodeId,
      commitText,
      handleWrapperClick,
      handleWrapperDoubleClick,
      handleSelectedKeyDown,
      handleEditingKeyDown,
      handleToggleCollapse,
      handleAttachClick,
      handleRemoveAttachment,
      handleDropImage,
    }),
    [
      selectedNodeId,
      editingNodeId,
      commitText,
      handleWrapperClick,
      handleWrapperDoubleClick,
      handleSelectedKeyDown,
      handleEditingKeyDown,
      handleToggleCollapse,
      handleAttachClick,
      handleRemoveAttachment,
      handleDropImage,
    ],
  )

  if (!snapshot.map) {
    return <div className="map-editor-loading">読み込み中…</div>
  }

  return (
    <div className="map-editor-page">
      <Toolbar
        mapName={snapshot.map.name}
        editor={editor}
        onBack={onBack}
        onRename={handleRename}
      />
      <div className="mindmap-canvas">
        <OutlineEditorContext.Provider value={contextValue}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </OutlineEditorContext.Provider>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden-file-input"
        onChange={handleFileInputChange}
      />
    </div>
  )
}
