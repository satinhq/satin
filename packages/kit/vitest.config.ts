import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'legacy-glass-diagnostic-regression',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('/glass/MaterialEffectRoot.tsx')) return
        // Model the boolean literal emitted by old consumer builds. Vitest turns
        // custom import.meta.env defines into strings, which misses the old === true branch.
        return source.replaceAll('import.meta.env.SATIN_DIAGNOSTIC_GLASS_OFF', 'true')
      },
    },
  ],
  test: {
    // Node 25 enables its own Web Storage global, which shadows the DOM test
    // environment's localStorage. Turn it off so tests see the DOM's storage.
    execArgv: ['--no-experimental-webstorage'],
  },
})
