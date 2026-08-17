import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';

/**
 * Vitest config แยกจาก quasar.config.ts
 *
 * quasar dev/build ใช้ไฟล์ของตัวเองอยู่แล้ว ที่นี่ประกอบเฉพาะสิ่งที่ unit/component test
 * ต้องใช้ — plugin ของ Vue + Quasar และ alias ให้ตรงกับ tsconfig ของโปรเจกต์
 */
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar({ sassVariables: resolve('./src/css/quasar.variables.scss') }),
  ],
  resolve: {
    alias: {
      // alias นี้ quasar สร้างให้เฉพาะตอน dev/build — เทสต้อง stub เอง
      '#q-app/wrappers': resolve('./test/stubs/q-app-wrappers.ts'),
      src: resolve('./src'),
      app: resolve('./'),
      components: resolve('./src/components'),
      layouts: resolve('./src/layouts'),
      pages: resolve('./src/pages'),
      stores: resolve('./src/stores'),
      boot: resolve('./src/boot'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    globals: true,
    setupFiles: ['./test/vitest.setup.ts'],
    server: {
      deps: {
        inline: ['quasar'],
      },
    },
  },
});
