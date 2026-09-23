/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** `vite.config.ts`の`define`でビルド時に焼き込まれる、このバンドル自身のビルドID。 */
declare const __APP_BUILD_ID__: string
