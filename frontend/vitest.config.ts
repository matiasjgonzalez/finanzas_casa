import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      // Las pruebas que escriben con userEvent (tecla por tecla) pueden superar los 5 s por
      // defecto cuando la máquina está ocupada.
      testTimeout: 15_000,
    },
  }),
)
