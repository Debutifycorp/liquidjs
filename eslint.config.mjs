import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

// LiquidJS's lint rules (eslint-config-standard 12 and @typescript-eslint/recommended, with upstream's overrides) on ESLint's flat config. neostandard is standard's flat-config successor; the rules it adds since standard 12 are off, so upstream's code keeps its style and upstream merges stay clean.
export default [
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['node_modules/', 'dist/', 'demo/', 'coverage/', 'docs/', '**/private.*', 'spec/liquid-spec/', '**/.*'] },
  ...neostandard({ ts: true, noJsx: true, env: ['browser', 'node', 'mocha'] }),
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts'] })),
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      'no-dupe-class-members': 'off',
      'no-useless-constructor': 'off',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/array-bracket-spacing': 'off',
      '@stylistic/object-curly-newline': 'off',
      'object-shorthand': 'off',
      'no-prototype-builtins': 'off',
      'no-void': 'off',
      '@stylistic/indent': ['error', 2]
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: false }]
    }
  },
  { files: ['**/filters/*.ts', 'src/shopify/**/*.ts', 'test/shopify/**/*.ts'], rules: { camelcase: 'off' } },
  { files: ['**/*.js', '**/*.cjs', '**/*.mjs', 'test/**/*.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['test/**/*.ts'], rules: { '@typescript-eslint/no-deprecated': 'off', 'no-unused-expressions': 'off', '@typescript-eslint/no-unused-expressions': 'off', 'no-new': 'off' } },
  { files: ['test/e2e/**'], rules: { 'no-var': 'off', 'prefer-const': 'off' } },
  { files: ['benchmark/**'], rules: { 'no-unused-expressions': 'off' } }
]
