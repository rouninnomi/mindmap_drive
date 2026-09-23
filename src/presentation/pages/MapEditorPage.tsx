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
import type { Node as DomainNode } from '../../domain/mindmap/Node'
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
 * - 文字入力中の`Shift+Enter`は、カーソル位置でテキストを分割する(`MindMap.splitNode`)。
 *   カーソルより前のテキストは現在のノードに残し、後ろのテキストを持つ新しい兄弟ノードを
 *   直後に挿入して、即座にその文字入力モードに入る
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
 * - ノード間移動の↑↓: 選択中・文字入力中どちらも同じ親を持つ前後の兄弟ノードへ移動する
 *   (子孫へは移動しない。DFS順だと子ノードへ入り込んでしまい直感に反するため、
 *   ユーザーフィードバックにより兄弟間のみに変更した)
 * - ノード間移動の←→: 選択中のみ、←で親ノードへ、→で最初の子ノードへ移動する
 *   (折りたたまれている場合や子が無い場合、→は何もしない)。文字入力中は標準の
 *   テキストカーソル移動を優先し、ノード間移動には割り当てない
 * - 文字入力中、日本語入力などIME変換中(`event.isComposing`)は`handleEditingKeyDown`の
 *   先頭で処理をスキップし、ショートカットとして扱わない(怠ると変換確定のEnterで
 *   兄弟ノードが作られ、文章入力の途中で編集が中断されてしまう)。同様に、変換確定前の
 *   通常のキー入力では`MindMapCanvasNode.tsx`側で`commitIfChanged`自体を呼ばない
 *   (変換途中の未確定文字列を`<input>`の`value`へ反映し直す再レンダリングが走ると、
 *   ブラウザが変換を強制的に確定・中断してしまうため)
 * - 文字入力中のドメインへのコミット(`commitText`)は、Enter/Tab/Esc/↑↓/Undo/Redoなど
 *   ノードを離れる操作の直前と、`blur`時のみ行う(`MindMapCanvasNode.tsx`の
 *   `isTextCommitTriggerKey`参照)。普通の文字入力のたびにコミットしていると、
 *   自動保存(1.5秒デバウンス)やUndoスタックへの記録が一文字ごとに発生し、連続して
 *   文字を打っている最中に自動保存が頻繁に挟まってしまうため(ユーザーフィードバックに
 *   より変更)
 * - `Ctrl+クリック`/`Shift+クリック`で同じ親を持つ兄弟ノードを複数選択できる
 *   (`multiSelectedIds`。異なる親のノードは選択できない仕様とした。ユーザー
 *   フィードバックにより追加)。複数選択中に`Enter`を押すと、選択したノードを兄弟内の
 *   並び順で1つに統合する(`MindMap.mergeNodes`。テキストは改行連結、子・添付は
 *   先頭ノードへ集約)。`Esc`で複数選択を解除する。複数選択中は他のショートカットは
 *   何もしない(単一ノードに対する操作と意味が衝突するため)
 * - `Ctrl+Shift+→`でマップ内の全ノードを展開、`Ctrl+Shift+←`で全折りたたみする
 *   (`MindMap.expandAll`/`collapseAll`。単一ノードの折りたたみ/展開(`Ctrl+←`/`Ctrl+→`)と
 *   対応させた割り当て。全展開はブラウザの検索(Ctrl+F)で全文検索できるようにする用途を
 *   想定。特定ノードの操作ではないためwindowレベルで拾う。当初`Ctrl+Shift+9`/`Ctrl+Shift+0`
 *   だったが、環境によってはブラウザのタブ切り替えショートカットと衝突したため
 *   `Ctrl+Shift+←→`に変更した。ユーザーフィードバックにより追加・変更)
 * - 選択中の`Ctrl+C`/`Ctrl+X`でノードをコピー/切り取りし(`clipboardRef`。OSの
 *   クリップボードとは独立したアプリ内蔵のクリップボードで、画像添付用に既存の
 *   `Ctrl+V`貼り付け(`MindMapCanvasNode.tsx`の`handlePaste`)とは別経路)、貼り付け先の
 *   ノードを選択して`Ctrl+V`で押すとその直後に新しい兄弟ノードとして貼り付ける
 *   (`MindMap.pasteAfter`)。切り取りは即座に元のノードを削除する(OSのカット&ペースト
 *   と同様)。複数選択中の`Ctrl+C`/`Ctrl+X`は選択した兄弟ノードすべてを並び順で
 *   まとめてコピー/切り取りし(`MindMap.deleteNodes`で1回のUndo単位にまとめる)、
 *   `Ctrl+V`で貼り付けるとその並び順のまま連続する兄弟ノードとして挿入される。
 *   貼り付けは`Node.cloneWithNewIds`で全ノードのIDを再採番するため、同じ内容を
 *   複数回貼り付けたりコピー元が残っている状態で貼り付けたりしてもID重複は起きない。
 *   文字入力中は`Ctrl+C`/`Ctrl+X`/`Ctrl+V`を横取りせず、`<input>`のネイティブな
 *   テキスト選択コピー&ペーストをそのまま使えるようにする(選択中のみのショートカット)
 */
export function MapEditorPage({ mapId, onBack }: MapEditorPageProps) {
  const { snapshot, editor } = useMindMapEditor(mapId)

  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set())

  const attachTargetRef = useRef<NodeId | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isDraggingRef = useRef(false)
  // ノードのコピー&ペースト用のアプリ内蔵クリップボード。OSのクリップボードとは
  // 独立しており、再レンダリングを引き起こす必要が無いためuseStateではなくrefで持つ。
  const nodeClipboardRef = useRef<DomainNode[] | null>(null)

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

  // 全展開/全折りたたみは特定のノードに対する操作ではないため、個々のノードの
  // フォーカスに依存せず常に効くようwindowレベルで拾う。当初`Ctrl+Shift+9`/
  // `Ctrl+Shift+0`を採用していたが、`Ctrl+9`と誤認識してブラウザのタブ切り替え
  // ショートカットと衝突する環境があったため、単一ノードの折りたたみ/展開
  // (`Ctrl+←`/`Ctrl+→`)と対応させて`Ctrl+Shift+←`(一括折りたたみ)/
  // `Ctrl+Shift+→`(一括展開)に変更した(ユーザーフィードバックにより変更)。
  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent): void => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey
      if (!isCtrlOrCmd || !event.shiftKey) {
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        editor.expandAll()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        editor.collapseAll()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [editor])

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
    setMultiSelectedIds(new Set())
  }, [])

  // Ctrl+クリック: クリックしたノードの複数選択への追加/除外を切り替える。
  // 直前の単一選択(selectedNodeId)も自動的に複数選択へ組み入れる。異なる親を持つ
  // ノードを追加しようとした場合は、複数選択の仕様(兄弟のみ)に反するため
  // そのノードだけの新しい選択としてやり直す。
  const handleWrapperCtrlClick = useCallback(
    (nodeId: NodeId) => {
      setEditingNodeId(null)
      const root = snapshot.map?.rootNode
      const clickedParent = root?.findParentOf(nodeId) ?? null
      setMultiSelectedIds((prev) => {
        let base = prev
        if (base.size === 0 && selectedNodeId && selectedNodeId !== nodeId.value && root) {
          const anchorParent = root.findParentOf(NodeIdValueObject.of(selectedNodeId))
          if (anchorParent && anchorParent === clickedParent) {
            base = new Set([selectedNodeId])
          }
        }
        if (base.size > 0 && root) {
          const [existingId] = base
          const existingParent = existingId ? root.findParentOf(NodeIdValueObject.of(existingId)) : null
          if (existingParent && existingParent !== clickedParent) {
            base = new Set()
          }
        }
        const next = new Set(base)
        if (next.has(nodeId.value)) {
          next.delete(nodeId.value)
        } else {
          next.add(nodeId.value)
        }
        return next
      })
      setSelectedNodeId(nodeId.value)
    },
    [selectedNodeId, snapshot.map],
  )

  // Shift+クリック: 直前の単一選択(アンカー)からクリックしたノードまでの、
  // 兄弟内での連続範囲を複数選択にする。親が異なる場合は通常のクリックとして扱う。
  const handleWrapperShiftClick = useCallback(
    (nodeId: NodeId) => {
      setEditingNodeId(null)
      const root = snapshot.map?.rootNode
      const anchorId = selectedNodeId
      if (!root || !anchorId) {
        setSelectedNodeId(nodeId.value)
        setMultiSelectedIds(new Set())
        return
      }
      const anchorParent = root.findParentOf(NodeIdValueObject.of(anchorId))
      const targetParent = root.findParentOf(nodeId)
      if (!anchorParent || anchorParent !== targetParent) {
        setSelectedNodeId(nodeId.value)
        setMultiSelectedIds(new Set())
        return
      }
      const anchorIndex = anchorParent.indexOfChild(NodeIdValueObject.of(anchorId))
      const targetIndex = anchorParent.indexOfChild(nodeId)
      const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
      const range = anchorParent.children.slice(start, end + 1).map((n) => n.id.value)
      setMultiSelectedIds(new Set(range))
      setSelectedNodeId(nodeId.value)
    },
    [selectedNodeId, snapshot.map],
  )

  // ↑↓での移動は同じ親を持つ兄弟間のみとする(親子間の移動は←→が担う)。
  const findSibling = useCallback(
    (nodeId: NodeId, offset: number): DomainNode | null => {
      const parent = snapshot.map?.rootNode.findParentOf(nodeId)
      if (!parent) {
        return null
      }
      const index = parent.indexOfChild(nodeId)
      return parent.children[index + offset] ?? null
    },
    [snapshot.map],
  )

  // 複数選択中(multiSelectedIds + アンカーのnodeId)の兄弟ノードを、ツリー上の
  // 並び順に揃えて実体(DomainNode)で返す(コピー/切り取り用)。異なる親を持つ
  // ノード同士は複数選択できない仕様のため、いずれか1つの親から全ノードが見つかる。
  const collectSelectedSiblingNodes = useCallback(
    (anchorNodeId: NodeId): DomainNode[] | null => {
      const root = snapshot.map?.rootNode
      if (!root) {
        return null
      }
      const ids = Array.from(new Set([...multiSelectedIds, anchorNodeId.value]))
      const parent = root.findParentOf(NodeIdValueObject.of(ids[0]))
      if (!parent) {
        return null
      }
      const sorted = [...ids].sort(
        (a, b) =>
          parent.indexOfChild(NodeIdValueObject.of(a)) - parent.indexOfChild(NodeIdValueObject.of(b)),
      )
      return sorted.map((id) => parent.children.find((child) => child.id.value === id)).filter(
        (n): n is DomainNode => n !== undefined,
      )
    },
    [multiSelectedIds, snapshot.map],
  )

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

      // Ctrl+クリック/Shift+クリックで2つ以上選択中は、単一ノード向けの通常の
      // ショートカットとは意味が衝突するため扱わない。Enterで統合、Escで選択解除、
      // Ctrl+C/Ctrl+Xでの複数ノードまとめてのコピー/切り取りのみ行う。
      if (multiSelectedIds.size > 0) {
        if (event.key === 'Enter') {
          event.preventDefault()
          const targetIds = Array.from(new Set([...multiSelectedIds, nodeId.value])).map((v) =>
            NodeIdValueObject.of(v),
          )
          const mergedId = editor.mergeNodes(targetIds)
          setMultiSelectedIds(new Set())
          setSelectedNodeId(mergedId.value)
        } else if (event.key === 'Escape') {
          setMultiSelectedIds(new Set())
        } else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') {
          event.preventDefault()
          const selected = collectSelectedSiblingNodes(nodeId)
          if (selected && selected.length > 0) {
            nodeClipboardRef.current = selected.map((n) => n.clone())
          }
        } else if (isCtrlOrCmd && event.key.toLowerCase() === 'x') {
          event.preventDefault()
          const selected = collectSelectedSiblingNodes(nodeId)
          const root = snapshot.map?.rootNode
          if (selected && selected.length > 0 && root) {
            nodeClipboardRef.current = selected.map((n) => n.clone())
            // 削除後は、切り取ったノード群の親(常に選択集合には含まれない)を
            // 選択状態にする。ルート直下(トップレベル)をすべて切り取った場合は
            // 非表示のルートノードには選択が戻らないようnullにする。
            const parent = root.findParentOf(selected[0].id)
            editor.deleteNodes(selected.map((n) => n.id))
            setMultiSelectedIds(new Set())
            setSelectedNodeId(parent && !parent.id.equals(root.id) ? parent.id.value : null)
          }
        }
        return
      }

      if (isCtrlOrCmd && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        const node = snapshot.map?.rootNode.findById(nodeId)
        if (node) {
          nodeClipboardRef.current = [node.clone()]
        }
        return
      }
      if (isCtrlOrCmd && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        const node = snapshot.map?.rootNode.findById(nodeId)
        if (node) {
          nodeClipboardRef.current = [node.clone()]
          const index = flattened.findIndex((n) => n.id.equals(nodeId))
          const fallback = flattened[index - 1] ?? flattened[index + 1] ?? null
          editor.deleteNode(nodeId)
          setEditingNodeId(null)
          setSelectedNodeId(fallback ? fallback.id.value : null)
        }
        return
      }
      if (isCtrlOrCmd && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        const clipboard = nodeClipboardRef.current
        if (clipboard && clipboard.length > 0) {
          const newIds = editor.pasteAfter(nodeId, clipboard)
          setSelectedNodeId(newIds[newIds.length - 1].value)
        }
        return
      }

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
      if (isCtrlOrCmd && !event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        const node = flattened.find((n) => n.id.equals(nodeId))
        if (node && node.children.length > 0 && !node.collapsed) {
          editor.toggleCollapse(nodeId)
        }
        return
      }
      if (isCtrlOrCmd && !event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        const node = flattened.find((n) => n.id.equals(nodeId))
        if (node && node.children.length > 0 && node.collapsed) {
          editor.toggleCollapse(nodeId)
        }
        return
      }
      // Ctrl+Shift+←/→は一括折りたたみ/展開(windowレベルのグローバルハンドラで処理)の
      // ためのショートカットなので、ここでは何もせず下の無修飾の矢印キー処理にも
      // 流さない(isCtrlOrCmdの分岐だけでは`!isCtrlOrCmd`を前提にしている以降の処理と
      // 衝突するため、ここで確実に止める)。
      if (isCtrlOrCmd && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
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
        const parentNode = flattened.find((n) => n.id.equals(nodeId))
        if (parentNode?.collapsed) {
          editor.toggleCollapse(nodeId)
        }
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
        const prev = findSibling(nodeId, -1)
        if (prev) {
          setSelectedNodeId(prev.id.value)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const next = findSibling(nodeId, 1)
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
    [editor, flattened, snapshot.map, findSibling, multiSelectedIds, collectSelectedSiblingNodes],
  )

  // ノードが「文字入力」状態の時のキー操作。
  const handleEditingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => {
      // 日本語入力などIMEでの変換候補確定時もEnter/Escapeのkeydownが発火するため、
      // 変換中(isComposing)はショートカットとして扱わずIMEにそのまま渡す。これを
      // 怠ると、変換確定のEnterで兄弟ノードが作られ文章入力の途中で編集が中断される。
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return
      }

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
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        const cursor = event.currentTarget.selectionStart ?? currentText.length
        const before = currentText.slice(0, cursor)
        const after = currentText.slice(cursor)
        const newId = editor.splitNode(nodeId, NodeText.of(before), NodeText.of(after))
        setSelectedNodeId(newId.value)
        setEditingNodeId(newId.value)
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
        const parentNode = flattened.find((n) => n.id.equals(nodeId))
        if (parentNode?.collapsed) {
          editor.toggleCollapse(nodeId)
        }
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
        const prev = findSibling(nodeId, -1)
        if (prev) {
          setSelectedNodeId(prev.id.value)
          setEditingNodeId(prev.id.value)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const next = findSibling(nodeId, 1)
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
    [editor, flattened, findSibling],
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
      multiSelectedIds,
      commitText,
      handleWrapperClick,
      handleWrapperCtrlClick,
      handleWrapperShiftClick,
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
      multiSelectedIds,
      commitText,
      handleWrapperClick,
      handleWrapperCtrlClick,
      handleWrapperShiftClick,
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
