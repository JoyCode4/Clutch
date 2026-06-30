import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''),
    'import.meta.env.VITE_LLM_API_KEY': JSON.stringify(process.env.VITE_LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''),
    'import.meta.env.VITE_LLM_PROVIDER': JSON.stringify(process.env.VITE_LLM_PROVIDER || process.env.LLM_PROVIDER || ''),
    'import.meta.env.VITE_LLM_MODEL': JSON.stringify(process.env.VITE_LLM_MODEL || process.env.LLM_MODEL || ''),
    'import.meta.env.VITE_LLM_BASE_URL': JSON.stringify(process.env.VITE_LLM_BASE_URL || process.env.LLM_BASE_URL || ''),
    'import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_OAUTH_CLIENT_ID || ''),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
})
