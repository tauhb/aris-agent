import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['**/lib/**', '**/node_modules/**', 'design/**', '.dsh-home/**', 'out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/*/client/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
)
