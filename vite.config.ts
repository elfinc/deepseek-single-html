import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { viteSingleFile } from 'vite-plugin-singlefile';
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  base: '/deepseek-single-html/',
  plugins: [
    vue(),
    vueJsx(),
    viteSingleFile(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'docs',
    cssCodeSplit: false, // 避免 CSS 拆分
    assetsInlineLimit: 100000000, // 允许内联更大资源, 100MB
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
