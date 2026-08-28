import { MindMap } from '../../domain/mindmap/MindMap'
import { Node } from '../../domain/mindmap/Node'
import {
  Attachment,
  AttachmentId,
  MapId,
  MapName,
  NodeId,
  NodeText,
} from '../../domain/mindmap/valueObjects'

/** Drive上のJSONスキーマ(architecture.md 4.3節)。 */
export interface MindMapJson {
  schemaVersion: 1
  id: string
  name: string
  updatedAt: string
  root: NodeJson
}

interface NodeJson {
  id: string
  text: string
  collapsed: boolean
  attachments: AttachmentJson[]
  children: NodeJson[]
}

interface AttachmentJson {
  id: string
  driveFileId: string
  addedAt: string
}

export function mindMapToJson(map: MindMap): MindMapJson {
  return {
    schemaVersion: 1,
    id: map.id.value,
    name: map.name.value,
    updatedAt: map.updatedAt.toISOString(),
    root: nodeToJson(map.rootNode),
  }
}

export function mindMapFromJson(json: MindMapJson): MindMap {
  return MindMap.reconstruct(
    MapId.of(json.id),
    MapName.of(json.name),
    nodeFromJson(json.root),
    new Date(json.updatedAt),
  )
}

function nodeToJson(node: Node): NodeJson {
  return {
    id: node.id.value,
    text: node.text.value,
    collapsed: node.collapsed,
    attachments: node.attachments.map(attachmentToJson),
    children: node.children.map(nodeToJson),
  }
}

function nodeFromJson(json: NodeJson): Node {
  return Node.reconstruct(
    NodeId.of(json.id),
    NodeText.of(json.text),
    json.children.map(nodeFromJson),
    json.collapsed,
    json.attachments.map(attachmentFromJson),
  )
}

function attachmentToJson(attachment: Attachment): AttachmentJson {
  return {
    id: attachment.id.value,
    driveFileId: attachment.driveFileId,
    addedAt: attachment.addedAt.toISOString(),
  }
}

function attachmentFromJson(json: AttachmentJson): Attachment {
  return Attachment.reconstruct(AttachmentId.of(json.id), json.driveFileId, new Date(json.addedAt))
}
