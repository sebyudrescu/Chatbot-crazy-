import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // The application intentionally starts client-side fetches from effects.
      // Keep the established behavior while retaining the core Rules of Hooks.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'data/**',
    'public/widget.js',
    'scripts/**/*.js',
    'worker.js',
  ]),
])
