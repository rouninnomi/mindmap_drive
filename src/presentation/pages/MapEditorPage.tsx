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
import { useCallback, useEffect, useMemo, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
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
 * 要件定義4.3節の表と異なる点(通常のテキスト入力と衝突するため実装時に調整した。
 * 詳細は`docs/requirements.md` 4.3節の注記を参照):
 * - 子ノード追加: 表では「Tab」だが、MindMup本来の挙動(ドラッグでの再親子付けと
 *   同様に「インデント」)として実装。新規の子ノードは「Enterで兄弟追加→Tabで
 *   インデント」、またはドラッグ&ドロップで作成する
 * - 折りたたみ/展開: 表では「/」または「F」だが、テキスト入力中に文字として
 *   衝突するため`Ctrl+/`に変更
 * - 画像添付: 表では「I」だが、同様の理由で`Ctrl+I`に変更
 * - ノード間移動の←→: テキストカーソルの左右移動という標準動作を優先し、
 *   ノード間移動には割り当てない(↑↓のみ、DFS順で前後のノードへ移動する)
 * - Esc(「ルートに戻る/表示リセット」): v1にズーム機能はないため、
 *   フォーカスを外す(blur)動作として扱う
 */
export function MapEditorPage({ mapId, onBack }: MapEditorPageProps) {
  const { snapshot, editor } = useMindMapEditor(mapId)

  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const inputsRef = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusRef = useRef<string | null>(null)
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
  useEffect(() => {
    if (snapshot.map && snapshot.map.rootNode.children.length === 0) {
      const newId = editor.addChildNode(snapshot.map.rootNode.id, NodeText.empty())
      pendingFocusRef.current = newId.value
    }
  }, [snapshot.map, editor])

  // レイアウト(nodes state)が実際に反映された後にフォーカスを復元する。
  // snapshot.versionではなくnodesを依存にするのは、setNodesが新しい描画を
  // スケジュールしてから実際にDOMへ反映されるまでに1レンダー分のずれがあるため。
  //
  // React Flow自身も内部の寸法計測(ResizeObserver)に伴い独自にnodesを
  // 更新することがあり、対象ノードのinputがまだ登録される前にこの effect が
  // 先に発火することがある。そのため、対象inputが見つかった時だけ
  // pendingFocusRefを消費する(見つからなければ何もせず、次のnodes変化を待って
  // 再試行する)。
  useEffect(() => {
    const id = pendingFocusRef.current
    if (!id) {
      return
    }
    const el = inputsRef.current.get(id)
    if (el) {
      pendingFocusRef.current = null
      el.focus()
    }
  }, [nodes])

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) {
      inputsRef.current.set(id, el)
    } else {
      inputsRef.current.delete(id)
    }
  }, [])

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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      if (isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        pendingFocusRef.current = nodeId.value
        editor.undo()
        return
      }
      if (
        isCtrlOrCmd &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault()
        pendingFocusRef.current = nodeId.value
        editor.redo()
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowUp') {
        event.preventDefault()
        editor.moveUp(nodeId)
        pendingFocusRef.current = nodeId.value
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowDown') {
        event.preventDefault()
        editor.moveDown(nodeId)
        pendingFocusRef.current = nodeId.value
        return
      }
      if (isCtrlOrCmd && event.key === '/') {
        event.preventDefault()
        editor.toggleCollapse(nodeId)
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
        pendingFocusRef.current = newId.value
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (event.shiftKey) {
          editor.outdent(nodeId)
        } else {
          editor.indent(nodeId)
        }
        pendingFocusRef.current = nodeId.value
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
        pendingFocusRef.current = fallback ? fallback.id.value : null
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const prev = flattened[index - 1]
        if (prev) {
          inputsRef.current.get(prev.id.value)?.focus()
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const next = flattened[index + 1]
        if (next) {
          inputsRef.current.get(next.id.value)?.focus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.currentTarget.blur()
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
      registerInput,
      commitText,
      handleKeyDown,
      handleToggleCollapse,
      handleAttachClick,
      handleRemoveAttachment,
    }),
    [registerInput, commitText, handleKeyDown, handleToggleCollapse, handleAttachClick, handleRemoveAttachment],
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
