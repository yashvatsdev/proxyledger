import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals, ...nextTs,
  // Existing landing animations use native anchors. Preserve their current markup.
  { files: ['app/page.tsx', 'app/dashboard/dashboard-client.tsx'], rules: { '@next/next/no-html-link-for-pages': 'off' } },
  globalIgnores(['.next/**', 'generated/**', '.pnpm-store/**', 'node_modules.phase1-backup/**', 'coverage/**', 'next-env.d.ts']),
])
