import assert from 'node:assert/strict';
import { test } from 'node:test';

import stylistic from '@stylistic/eslint-plugin';
import { Linter } from 'eslint';

import commonConfig from '../../eslint.js';

const linter = new Linter();

const config = [{
  plugins: { '@stylistic': stylistic },
  rules: {
    '@stylistic/array-bracket-newline': commonConfig.rules['@stylistic/array-bracket-newline'],
    '@stylistic/array-element-newline': commonConfig.rules['@stylistic/array-element-newline'],
  },
}];

const verifyAndFix = (code) => linter.verifyAndFix(code, config);

test('arrays of at most two elements remain compact', () => {
  const code = 'const values = [1, 2];';
  const result = verifyAndFix(code);

  assert.equal(result.output, code);
  assert.deepEqual(result.messages, []);
});

test('arrays of three or more elements get brackets and elements on separate lines', () => {
  const result = verifyAndFix('const values = [1, 2, 3];');

  assert.deepEqual(result.messages, []);
  assert.match(result.output, /\[\s*\n\s*1,\s*\n\s*2,\s*\n\s*3\s*\n\s*\]/);
});

test('array destructuring of three or more elements gets the same layout', () => {
  const result = verifyAndFix('const [first, second, third] = values;');

  assert.deepEqual(result.messages, []);
  assert.match(result.output, /\[\s*\n\s*first,\s*\n\s*second,\s*\n\s*third\s*\n\s*\]/);
});

test('formatting remains stable after a second --fix run', () => {
  const first = verifyAndFix('const values = [1, 2, 3, 4];');
  const second = verifyAndFix(first.output);

  assert.deepEqual(first.messages, []);
  assert.deepEqual(second.messages, []);
  assert.equal(second.output, first.output);
  assert.equal(second.fixed, false);
});
