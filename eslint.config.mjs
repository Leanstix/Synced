import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'android/**', 'ios/**', 'dist/**', '.expo/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-empty-function': 'off' } },
  { files: ['scripts/*.mts'], languageOptions: { globals: { console: 'readonly', process: 'readonly' } } },
);
