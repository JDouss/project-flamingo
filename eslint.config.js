import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Standard fetch/subscribe hook patterns set state inside effects;
      // keep the signal but don't fail the build on it.
      'react-hooks/set-state-in-effect': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
