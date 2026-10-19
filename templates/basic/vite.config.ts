import react from '@vitejs/plugin-react'
import { defineApp, satinApp } from '@satinhq/kit/vite'
import { defineConfig } from 'vite'
import { app } from './src/app.ts'

export default defineConfig({
  plugins: [react(), satinApp(defineApp(app))],
})
