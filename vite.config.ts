import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pagesはプロジェクトリポジトリを https://<user>.github.io/<repo>/ 配下で配信するため、
  // 本番ビルドのみアセットパスをリポジトリ名でプレフィックスする。
  base: process.env.GITHUB_PAGES ? '/mindmap_drive/' : '/',
})
