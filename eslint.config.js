import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'src-tauri/target',
      'src-tauri/gen',
      'playwright-report',
      'test-results',
      'src/ipc/bindings.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // AD-1: src/core is pure TypeScript over plain data. No React, no state
    // managers, no Tauri, no IPC.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'react-*'],
              message: 'src/core must stay pure TypeScript (AD-1). No React imports.',
            },
            {
              group: ['zustand', 'zustand/*', 'zundo', 'zundo/*'],
              message: 'src/core must stay pure TypeScript (AD-1). No state-manager imports.',
            },
            {
              group: ['@tauri-apps/*', '@tauri-apps/**'],
              message: 'src/core must stay pure TypeScript (AD-1). No Tauri imports.',
            },
            {
              group: ['@/state/*', '@/features/*', '@/ipc/*', '@/lib/*', '@/components/*'],
              message: 'src/core must not depend on app layers. Dependencies point inward (AD-1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'src/**/*.bench.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**/*.{ts,mjs,js}', '*.config.{ts,js}'],
    rules: {
      'no-console': 'off',
    },
  },
);
