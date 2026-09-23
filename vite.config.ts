import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// ビルドごとに変わる識別子。実行中のJSバンドルに焼き込む値(__APP_BUILD_ID__)と、
// 都度サーバーから取得し直せる/version.jsonの値を同じにすることで、開けっ放しの
// タブが古いバンドルのまま動き続けているかどうかをクライアント側で検知できるようにする
// (`useNewVersionAvailable`参照。長時間開いたタブに後から届けたはずの修正が反映されず
// データが失われた、というユーザーからのフィードバックにより追加)。
const buildId = String(Date.now())

/** dist直下に/version.jsonを書き出すだけの最小限のプラグイン。 */
function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
})
