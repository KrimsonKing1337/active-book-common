import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';

import objectNewline from './rules/object-newline.js';

export const importOrder = {
  'newlines-between': 'always-and-inside-groups',
  groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
  pathGroupsExcludedImportTypes: ['builtin'],
};

export default defineConfig({
  extends: [js.configs.recommended, typescript.configs['flat/recommended']],
  plugins: {
    'import-x': importX,
    '@stylistic': stylistic,
    'react-hooks': reactHooks,
    'object-newline': objectNewline,
  },
  languageOptions: {
    parser,
    ecmaVersion: 2021,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: {
    'import-x/order': ['error', importOrder],
    '@stylistic/eol-last': ['error', 'always'],
    '@stylistic/comma-dangle': ['error', 'always-multiline'],
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/indent': ['error', 2],
    '@stylistic/quotes': ['error', 'single'],
    '@stylistic/object-curly-spacing': ['error', 'always'],

    '@stylistic/curly-newline': ['error', {
      'minElements': 1,
    }],

    '@stylistic/padding-line-between-statements': ['error', {
      blankLine: 'always',
      prev: '*',
      next: 'return',
    }],

    '@stylistic/max-len': [
      'error',
      {
        code: 120,
      },
    ],

    'max-lines': [
      'warn',
      {
        max: 150,
        skipBlankLines: true,
        skipComments: true,
      },
    ],

    'object-newline': 'error',
    'import-x/no-default-export': 'warn',
    'curly': ['error', 'all'],

    'no-unneeded-ternary': ['error', {
      defaultAssignment: true,
    }],

    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    '@stylistic/jsx-max-props-per-line': [
      'error',
      {
        maximum: {
          single: 3,
          multi: 1,
        },
      },
    ],

    '@stylistic/jsx-closing-bracket-location': [
      'error',
      {
        nonEmpty: 'tag-aligned',
        selfClosing: 'line-aligned',
      },
    ],

    '@stylistic/jsx-closing-tag-location': 'warn',
    '@stylistic/jsx-first-prop-new-line': ['error', 'multiline'],
    '@stylistic/jsx-curly-brace-presence': ['error', 'never'],
    '@stylistic/jsx-self-closing-comp': 'error',

    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-var-requires': 'off',

    '@typescript-eslint/no-explicit-any': [
      'warn',
      {
        ignoreRestArgs: false,
      },
    ],
  },
});
