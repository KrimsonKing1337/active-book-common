import { describe, it } from 'node:test';

import { RuleTester } from 'eslint';
import parser from '@typescript-eslint/parser';

import { rule } from '../array-elements-per-line.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const invalid = (code, output, count = 1) => ({
  code,
  output,
  errors: Array.from({ length: count }, () => ({ messageId: 'maxTwo' })),
});

tester.run('active-book/array-elements-per-line', rule, {
  valid: [
    'const values = [];',
    'const values = [1];',
    'const values = [1, 2];',
    'const values = [1, 2,\n  3, 4];',
    'const values = [1,\n  2,\n  3];',
    'const values = [...previous, 2,\n  3];',
    'const [first, second,\n  third, fourth] = values;',
    'type Pair = [string, number];',
    'type Triple = [string, number,\n  boolean];',
    'useEffect(() => {}, [a, b]);',
    'useEffect(() => {}, [a, b,\n  c]);',
  ],

  invalid: [
    invalid(
      'const values = [1, 2, 3];',
      'const values = [1, 2,\n  3];',
    ),

    invalid(
      'const values = [1, 2, 3, 4, 5];',
      'const values = [1, 2,\n  3, 4,\n  5];',
      2,
    ),

    invalid(
      'const values = [\n  1, 2, 3,\n  4, 5\n];',
      'const values = [\n  1, 2,\n  3,\n  4, 5\n];',
    ),

    invalid(
      'const values = [...previous, next, last];',
      'const values = [...previous, next,\n  last];',
    ),

    invalid(
      'const [first, second, third] = values;',
      'const [first, second,\n  third] = values;',
    ),

    invalid(
      'type Triple = [string, number, boolean];',
      'type Triple = [string, number,\n  boolean];',
    ),

    invalid(
      'useEffect(() => {}, [a, b, c]);',
      'useEffect(() => {}, [a, b,\n  c]);',
    ),

    invalid(
      'const values = [1, 2, /* keep */ 3];',
      'const values = [1, 2, /* keep */\n  3];',
    ),
  ],
});
