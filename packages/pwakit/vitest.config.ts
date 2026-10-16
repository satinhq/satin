import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node 25 enables its own Web Storage global, which shadows the DOM test
    // environment's localStorage. Turn it off so tests see the DOM's storage.
    execArgv: ['--no-experimental-webstorage'],
  },
})
