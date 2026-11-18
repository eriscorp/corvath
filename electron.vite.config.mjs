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
    // electron itself — it has no node module resolution. The preload imports
    // only `electron`, so externalizing every dependency leaves
    // `require("electron")` as the one require. A new package import here
    // would be left as a `require` that throws at load and takes the whole
    // bridge with it; the A1 release check greps the built file for this.
    plugins: [externalizeDepsPlugin()]
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
