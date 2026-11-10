import { describe, it } from 'node:test';

import { RuleTester } from 'eslint';
import parser from '@typescript-eslint/parser';

import { rule } from './object-newline.js';

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

const invalid = (code, output) => ({
  code,
  output,
  errors: [{ messageId: 'multiline' }],
});

tester.run('active-book/object-newline', rule, {
  valid: [
    'const point = { x: 10 };',
    'const point = { x: 10, y: 20 };',
    'const { id, instance } = payload;',
    'const merged = { ...defaults, ...options };',

    `const point = {
  x: 10,
  y: 20,
};`,

    `const point = {
  x: 10,
  y: 20,
  z: 30,
};`,

    `const {
  id,
  instance,
  lifecycle,
} = payload;`,

    "import { a, b } from './module';",

    `import {
  a,
  b,
  c,
} from './module';`,

    "export { a, b } from './module';",

    'type Point = { x: number; y: number };',
    'interface Point { x: number; y: number; }',
    'enum State { A, B }',

    'useEffect(() => {}, [a, b, c]);',
    'const values = [a, b, c];',
  ],

  invalid: [
    invalid(
      'const point = { x: 10, y: 20, z: 30 };',
      `const point = {
  x: 10,
  y: 20,
  z: 30
};`,
    ),

    invalid(
      'const { id, instance, lifecycle } = payload;',
      `const {
  id,
  instance,
  lifecycle
} = payload;`,
    ),

    invalid(
      'const merged = { ...defaults, x: 10, y: 20 };',
      `const merged = {
  ...defaults,
  x: 10,
  y: 20
};`,
    ),

    invalid(
      'const { x, y, ...rest } = payload;',
      `const {
  x,
  y,
  ...rest
} = payload;`,
    ),

    invalid(
      'createPoint({ x: 10, y: 20, z: 30 });',
      `createPoint({
  x: 10,
  y: 20,
  z: 30
});`,
    ),

    invalid(
      "import { a, b, c } from './module';",
      `import {
  a,
  b,
  c
} from './module';`,
    ),

    invalid(
      "import Base, { a, b, c } from './module';",
      `import Base, {
  a,
  b,
  c
} from './module';`,
    ),

    invalid(
      "import type { Props, State, Context } from './types';",
      `import type {
  Props,
  State,
  Context
} from './types';`,
    ),

    invalid(
      "export { a, b, c } from './module';",
      `export {
  a,
  b,
  c
} from './module';`,
    ),

    invalid(
      'type Point = { x: number; y: number; z: number };',
      `type Point = {
  x: number;
  y: number;
  z: number
};`,
    ),

    invalid(
      'interface Point { x: number; y: number; z: number; }',
      `interface Point {
  x: number;
  y: number;
  z: number;
}`,
    ),

    invalid(
      'enum State { A, B, C }',
      `enum State {
  A,
  B,
  C
}`,
    ),

    invalid(
      'const data = { a: 1, /* note */ b: 2, c: 3 };',
      `const data = {
  a: 1, /* note */
  b: 2,
  c: 3
};`,
    ),

    invalid(
      `const point = {
  x: 10, y: 20,
  z: 30,
};`,
      `const point = {
  x: 10,
  y: 20,
  z: 30,
};`,
    ),
  ],
});
