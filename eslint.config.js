// ESLint flat config. `npm run lint:js` runs it with --max-warnings=0.
import js from '@eslint/js';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      '.wrangler/',
      'playwright-report/',
      'test-results/',
      'node_modules/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  noUnsanitized.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'stylelint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Never build HTML from strings. Use h() in src/client/dom.ts.
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'Use h() from src/client/dom.ts. The CSP blocks HTML strings.',
        },
        {
          property: 'outerHTML',
          message: 'Use h() from src/client/dom.ts. The CSP blocks HTML strings.',
        },
        { object: 'document', property: 'write', message: 'Not allowed.' },
      ],
      'no-restricted-globals': ['error', { name: 'eval', message: 'Not allowed.' }],
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      'no-console': ['error', { allow: ['error', 'warn', 'log'] }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Object lookups here use fixed keys from code, not user input.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Mocks and fixtures: these strict rules flag ordinary test patterns.
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
);
