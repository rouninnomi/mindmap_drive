const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** アプリ専用フォルダの名前(architecture.md 4.2節)。 */
export const APP_FOLDER_NAME = 'MindMapDrive'

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>
}

export async function authorizedFetch(
  auth: AccessTokenProvider,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await auth.getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    throw new Error(`Drive API request failed: ${response.status} ${response.statusText} (${url})`)
  }
  return response
}

/** アプリ専用フォルダを検索し、なければ作成してそのfileIdを返す。 */
export async function ensureAppFolder(auth: AccessTokenProvider): Promise<string> {
  const query = encodeURIComponent(
    `mimeType='${FOLDER_MIME_TYPE}' and name='${APP_FOLDER_NAME}' and trashed=false`,
  )
  const searchResponse = await authorizedFetch(
    auth,
    `${DRIVE_FILES_URL}?q=${query}&spaces=drive&fields=files(id)`,
  )
  const searchResult = (await searchResponse.json()) as { files: { id: string }[] }
  const existing = searchResult.files[0]
  if (existing) {
    return existing.id
  }

  const createResponse = await authorizedFetch(auth, `${DRIVE_FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME_TYPE }),
  })
  const created = (await createResponse.json()) as { id: string }
  return created.id
}

/** メタデータとバイナリ本体を1リクエストで送るmultipart/relatedボディを組み立てる。 */
function buildMultipartBody(metadata: Record<string, unknown>, content: Blob, contentType: string, boundary: string): Blob {
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  const mediaPartHeader = `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
  const closeDelimiter = `\r\n--${boundary}--`
  return new Blob([metadataPart, mediaPartHeader, content, closeDelimiter])
}

/** 新規ファイルをメタデータ+本体つきで作成する。 */
export async function createFileWithContent(
  auth: AccessTokenProvider,
  metadata: Record<string, unknown>,
  content: Blob,
  contentType: string,
): Promise<{ id: string }> {
  const boundary = `mindmap_drive_${crypto.randomUUID()}`
  const body = buildMultipartBody(metadata, content, contentType, boundary)
  const response = await authorizedFetch(auth, `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return (await response.json()) as { id: string }
}

/** 既存ファイルのメタデータと本体を1リクエストで更新する。 */
export async function updateFileContent(
  auth: AccessTokenProvider,
  fileId: string,
  metadata: Record<string, unknown>,
  content: Blob,
  contentType: string,
): Promise<void> {
  const boundary = `mindmap_drive_${crypto.randomUUID()}`
  const body = buildMultipartBody(metadata, content, contentType, boundary)
  await authorizedFetch(auth, `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

export async function getFileContent(auth: AccessTokenProvider, fileId: string): Promise<string> {
  const response = await authorizedFetch(auth, `${DRIVE_FILES_URL}/${fileId}?alt=media`)
  return response.text()
}

export async function getFileBlob(auth: AccessTokenProvider, fileId: string): Promise<Blob> {
  const response = await authorizedFetch(auth, `${DRIVE_FILES_URL}/${fileId}?alt=media`)
  return response.blob()
}

export async function deleteFile(auth: AccessTokenProvider, fileId: string): Promise<void> {
  await authorizedFetch(auth, `${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' })
}
