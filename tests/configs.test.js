import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { ESLint } from 'eslint';
import stylelint from 'stylelint';
import typescript from 'typescript';

import common, { browser, component, unit } from '@active-book/common/vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

test('core/editor load the shared ESLint parser/plugins/rules and Stylelint property ordering', async () => {
  for (const name of ['core', 'editor']) {
    const cwd = path.resolve(root, `../active-book-${name}`);
    const filename = path.join(cwd, name === 'core' ? 'src/index.ts' : 'apps/editor/src/main.tsx');
    const eslint = await new ESLint({ cwd }).calculateConfigForFile(filename);
    assert.equal(eslint.languageOptions.parser.meta.name, 'typescript-eslint/parser');
    assert.equal(eslint.rules['react-hooks/rules-of-hooks'][0], 2);
    assert.equal(eslint.rules['@stylistic/indent'][1], 2);
    assert.equal(eslint.rules['import-x/order'][1].pathGroups[0].pattern, 'react');
    const styles = await stylelint.resolveConfig(path.join(cwd, 'src/example.scss'), { cwd });
    assert.equal(styles.rules['order/properties-order'][0][0].groupName, 'ContentForPseudoElement');
    assert.ok(styles.plugins.every((plugin) => plugin.startsWith(root)));
  }
});

test('TypeScript profiles retain local module resolution, targets and output paths', () => {
  for (const [name, resolution, target] of [
    ['types', typescript.ModuleResolutionKind.NodeNext, typescript.ScriptTarget.ES2022],
    ['core', typescript.ModuleResolutionKind.Node10, typescript.ScriptTarget.ES2020],
    ['editor/apps/editor', typescript.ModuleResolutionKind.Bundler, typescript.ScriptTarget.ES2022],
  ]) {
    const directory = path.resolve(root, `../active-book-${name}`);
    const config = typescript.getParsedCommandLineOfConfigFile(path.join(directory, 'tsconfig.json'), {}, {
      ...typescript.sys,
      onUnRecoverableConfigFileDiagnostic(error) { assert.fail(error.messageText); },
    });
    assert.equal(config.errors.length, 0, name);
    assert.equal(config.options.strict, true, name);
    assert.equal(config.options.moduleResolution, resolution, name);
    assert.equal(config.options.target, target, name);
    if (name === 'core') {
      assert.equal(config.options.outDir, path.join(directory, 'lib'));
      assert.equal(config.options.declaration, true);
    }
  }
});

test('shared Vitest exports preserve coverage, browser preview and screenshot conventions', () => {
  assert.equal(unit.test.environment, 'node');
  assert.equal(component.test.environment, 'jsdom');
  assert.equal(common.test.coverage.provider, 'v8');
  const preview = browser('preview').test.browser;
  assert.equal(preview.provider.options.launchOptions.slowMo, 300);
  assert.equal(browser('test').test.browser.provider.options.launchOptions.slowMo, 0);
  assert.equal(preview.expect.toMatchScreenshot.resolveScreenshotPath({
    arg: 'control', browserName: 'chromium', platform: 'linux', ext: '.png', root: '/project', testFileName: 'button',
  }), path.join('/project/tests/screenshots/button', 'control-chromium-linux.png'));
});

test('a new project can run real unit/component tests from the shared Vitest profiles', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'active book vitest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'node_modules'));
  for (const [name, source] of [['@active-book/common', root], ['vitest', path.join(root, 'node_modules/vitest')]]) {
    await mkdir(path.dirname(path.join(directory, 'node_modules', name)), { recursive: true });
    await symlink(source, path.join(directory, 'node_modules', name), 'junction');
  }
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(directory, 'vitest.config.ts'), `
    import shared, {unit, component} from '@active-book/common/vitest';
    import {defineConfig, mergeConfig} from 'vitest/config';
    export default mergeConfig(shared, defineConfig({test:{projects:[
      mergeConfig(unit,{extends:true,test:{include:['unit.test.ts']}}),
      mergeConfig(component,{extends:true,test:{include:['component.test.ts']}})
    ]}}));
  `);
  await writeFile(path.join(directory, 'unit.test.ts'), "import {test,expect} from 'vitest'; test('node environment',()=>expect(typeof window).toBe('undefined'));\n");
  await writeFile(path.join(directory, 'component.test.ts'), "import {test,expect} from 'vitest'; test('DOM environment',()=>expect(document.createElement('button').tagName).toBe('BUTTON'));\n");
  const result = await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'),
    'run', '--configLoader', 'runner'], { cwd: directory });
  assert.match(result.stdout, /2 passed/);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'package.json'))).type, 'module');
});
