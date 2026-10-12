import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    // `original-fs` is an Electron built-in (the fs without the asar patch), not
    // a package, so Rollup cannot resolve it and externalizeDepsPlugin does not
    // list it. The portable sweep needs it; see src/main/portableSweep.ts.
    build: { rollupOptions: { external: ['original-fs'] } }
  },
  preload: {
    // A SANDBOXED preload (webPreferences.sandbox: true) may only `require`
    // electron itself — it has no node module resolution. externalizeDepsPlugin
    // otherwise leaves `require("@electron-toolkit/preload")` in the output, which
    // then throws at load and takes the whole bridge with it. Excluding it from
    // externalization bundles it in, so `require("electron")` is all that remains.
    // This is the real blocker behind the usual "our preload needs node" claim.
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })]
  },
  renderer: {
    // './' is required for file:// in production; '/' is required for HMR in dev
    base: command === 'build' ? './' : '/',
    publicDir: resolve('resources'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      hmr: true
    },
    build: {
      outDir: 'out/renderer'
    }
  }
}))
