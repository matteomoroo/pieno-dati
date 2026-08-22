/**
 * Configurazione ESLint di Pieno.
 * Volutamente essenziale: serve a intercettare errori reali (variabili non
 * usate, promise non gestite, `any` impliciti), non a imporre uno stile.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      'public/data/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    // Astro genera env.d.ts con una triple-slash reference: è la forma
    // idiomatica del framework, non un errore.
    files: ['src/env.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },
  {
    // Il service worker generato vive dentro una template string: non va
    // analizzato come modulo browser.
    files: ['src/pages/sw.js.ts'],
    rules: { 'no-useless-escape': 'off' },
  },
];
