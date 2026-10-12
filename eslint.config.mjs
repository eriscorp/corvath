import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/coverage/**'] },
  tseslint.configs.recommended,
  // Automatic JSX runtime: corvath compiles JSX via @vitejs/plugin-react's
  // automatic transform and does not import React in its components, so layer
  // the jsx-runtime preset on top of recommended to disable react-in-jsx-scope.
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
  { settings: { react: { version: 'detect' } } },
  eslintConfigPrettier,
  {
    rules: {
      // Return types are inferred throughout this app; requiring explicit
      // annotations is library-oriented noise that doesn't match the codebase.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // TypeScript prop types supersede runtime PropTypes.
      'react/prop-types': 'off',
      // Raw apostrophes/quotes in JSX text render fine; escaping adds noise.
      'react/no-unescaped-entities': 'off',
      // Honour the intentional underscore-prefix "ignore me" convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      // Advisory, not blocking — adding deps blindly can change effect behaviour.
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // The house update-check module's tests and the house chip test are byte
    // copies of the template's, which uses the classic runtime and imports React
    // in each JSX file. Under the jsx-runtime preset above, that import reads as
    // unused. This rule marks it as used, so the copies stay unchanged and a diff
    // against the template shows only real changes (HTOO-516, HTOO-572).
    files: [
      'src/renderer/src/components/__tests__/Update{Notice,CheckButton}.test.tsx',
      'src/renderer/src/themes/__tests__/selectedChip.test.tsx'
    ],
    rules: { 'react/jsx-uses-react': 'error' }
  }
)
