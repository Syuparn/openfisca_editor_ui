import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // HACK: CORS非対応でブロックされるのを防ぐため指定（動作確認のため固定値を指定しているが、実際には他のサイトも対応させる必要がある）
    proxy: {
      '/proxy': {
        // TODO: 他のサイトにも対応する
        target: 'https://www.fukushi.metro.tokyo.lg.jp',
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/proxy/, ''),
      }
    }
  }
})
