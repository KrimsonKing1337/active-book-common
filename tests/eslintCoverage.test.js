import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ESLint } from 'eslint';

import common, { globals } from '../configs/linters/eslint.js';

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: common });

test('JavaScript retains undefined-name checks while TypeScript keeps its recommended rules', async () => {
  const javascript = await eslint.calculateConfigForFile('example.js');
  const typescript = await eslint.calculateConfigForFile('example.ts');
  const [result] = await eslint.lintText('missingValue();\n', { filePath: 'example.js' });

  assert.equal(javascript.rules['no-undef'][0], 2);
  assert.equal(typescript.rules['no-undef'][0], 0);
  assert.equal(typescript.rules['@typescript-eslint/no-require-imports'][0], 2);
  assert.equal(typescript.rules['react-hooks/exhaustive-deps'][0], 1);
  assert.equal(typescript.rules['max-lines'][0], 1);
  assert(result.messages.some((message) => message.ruleId === 'no-undef'));
});

test('CJS tools can use Node require without inheriting TypeScript-only restrictions', async () => {
  const node = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...common, { languageOptions: { globals: globals.node } }],
  });
  const [result] = await node.lintText('module.exports = require(\'node:path\');\n', { filePath: 'tool.cjs' });

  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
});

test('shared defaults do not grant Node or test globals to browser code', async () => {
  const config = await eslint.calculateConfigForFile('application.js');

  assert.equal(config.languageOptions.globals?.process, undefined);
  assert.equal(config.languageOptions.globals?.expect, undefined);
});

test('common runner selects TS, JS and CSS once without invoking aggregate commands', async () => {
  const { activeBook, scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lintScripts = Object.values(activeBook.checks.lint).flat();

  assert.deepEqual(lintScripts, [
    'lint:ts:check',
    'lint:js:check',
    'lint:css:check',
  ]);
  assert.equal(new Set(lintScripts).size, lintScripts.length);
  assert.equal(scripts['lint:js'], 'node scripts/check.js lint:js');
});
