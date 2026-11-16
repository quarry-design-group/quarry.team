// ESLint flat config — pragmatic, fast (non-type-checked), Astro-aware.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.generated.*',
      'infra/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Inline browser scripts in .astro use DOM globals.
    files: ['**/*.astro'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // CommonJS configs (e.g. lighthouserc.cjs) — the package is type:module,
    // so .cjs is the explicit-CJS escape hatch and needs module/require globals.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
);
