import { MindMapCatalogService } from '../application/MindMapCatalogService'
import { DriveAttachmentStorage } from '../infrastructure/drive/DriveAttachmentStorage'
import { DriveMindMapRepository } from '../infrastructure/drive/DriveMindMapRepository'
import { GoogleAuth } from '../infrastructure/drive/googleAuth'

/**
 * アプリ全体で共有するインフラ/アプリケーションサービスのシングルトン。
 * 個人利用の単一ページSPAのため、DIコンテナは導入せずモジュールスコープの
 * インスタンスとして直接構築する。
 */
export const googleAuth = new GoogleAuth(import.meta.env.VITE_GOOGLE_CLIENT_ID)
export const mindMapRepository = new DriveMindMapRepository(googleAuth)
export const attachmentStorage = new DriveAttachmentStorage(googleAuth)
export const catalogService = new MindMapCatalogService(mindMapRepository)
