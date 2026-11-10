import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { commonRoot, loadConfiguration, parseOptions, readJson, readManifests, readRepositories } from '../scripts/repositories.js';
import { findNpmCli, runNpm } from '../scripts/npm.js';
import { findVersions, isRegistryVersion, synchronize } from '../scripts/dependencies/versions.js';
import { checkRepositories, orderRepositories } from '../scripts/check/checks.js';

const execute = promisify(execFile);

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'active book-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  return directory;
}

async function json(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture(t) {
  const parent = await temporaryDirectory(t);
  const root = join(parent, 'common');
  const directory = join(parent, 'repo');
  await cp(join(commonRoot, 'scripts'), join(root, 'scripts'), { recursive: true });
  const configuration = {
    repositories: { repo: '' },
    sharedDependencies: { shared: '1.1.0' },
  };
  await json(join(root, 'package.json'), { type: 'module', activeBook: configuration });
  await json(join(directory, 'package.json'), {
    name: 'repo',
    private: true,
    version: '0.1.0',
    workspaces: ['packages/*'],
    devDependencies: { shared: '^1.0.0' },
  });
  await json(join(directory, 'packages/a/package.json'), {
    name: 'workspace-a',
    version: '1.0.0',
    dependencies: { shared: '~1.0.0', special: 'file:local.tgz' },
    peerDependencies: { shared: '>=1.0.0' },
  });
  await json(join(directory, 'packages/b/package.json'), {
    name: 'workspace-b',
    version: '1.0.0',
    optionalDependencies: { shared: '1.0.0' },
  });
  const repository = { name: 'repo', directory, manifests: await readManifests(directory) };

  return { parent, root, directory, configuration, repository };
}

test('repo filters, explicit/default paths and unavailable/invalid repositories', async (t) => {
  const { root, configuration, directory } = await fixture(t);
  assert.deepEqual(parseOptions(['--repo', 'a,b', '--repo=c']).repositories, ['a', 'b', 'c']);
  assert.throws(() => parseOptions(['--repo', '']), /requires/);
  assert.throws(() => parseOptions(['--wat']), /Unknown option/);
  assert.throws(() => parseOptions(['--browser']), /Unknown option/);
  const settings = { ...configuration, repositories: { repo: '', alias: directory, missing: '../absent' } };
  const result = await readRepositories({ root, configuration: settings });
  assert.deepEqual(result.available.map((repo) => repo.name), ['repo', 'alias']);
  assert.match(result.errors[0], /missing.*package.json/);
  await assert.rejects(readRepositories({ root, configuration: settings, repositories: ['unknown'] }), /Unknown repository/);
  await writeFile(join(directory, 'package.json'), '{broken');
  assert.equal((await readRepositories({ root, configuration: settings, repositories: ['repo'] })).errors.length, 1);
});

test('configuration rejects ranges, malformed sections and ActiveBook version synchronization', async (t) => {
  const { root, configuration } = await fixture(t);
  for (const sharedDependencies of [{ shared: '^1.0.0' }, { shared: 1 }, { '@active-book/core': '1.0.0' }, { 'activeBook-core': '1.0.0' }]) {
    await json(join(root, 'package.json'), { activeBook: { ...configuration, sharedDependencies } });
    await assert.rejects(loadConfiguration(root), /exact npm version|cannot be synchronized/);
  }
  await json(join(root, 'package.json'), { activeBook: { ...configuration, repositories: { repo: 42 } } });
  await assert.rejects(loadConfiguration(root), /repository entry/);
});

test('workspaces support object form, globs, exclusions, duplicate names and malformed sections', async (t) => {
  const { directory } = await fixture(t);
  const rootPackage = await readJson(join(directory, 'package.json'));
  rootPackage.workspaces = { packages: ['packages/*', '!packages/b'] };
  await json(join(directory, 'package.json'), rootPackage);
  assert.equal((await readManifests(directory)).length, 2);
  rootPackage.workspaces = ['!packages/b', 'packages/*'];
  await json(join(directory, 'package.json'), rootPackage);
  assert.equal((await readManifests(directory)).length, 2);
  rootPackage.workspaces = ['packages/*', '!packages/b', 'packages/b'];
  await json(join(directory, 'package.json'), rootPackage);
  assert.equal((await readManifests(directory)).length, 3);
  await json(join(directory, 'packages/b/nested/package.json'), { name: 'nested' });
  rootPackage.workspaces = ['packages/**', '!packages/b'];
  await json(join(directory, 'package.json'), rootPackage);
  assert.equal((await readManifests(directory)).length, 2);
  rootPackage.workspaces = ['!!packages\\*'];
  await json(join(directory, 'package.json'), rootPackage);
  assert.equal((await readManifests(directory)).length, 3);
  rootPackage.workspaces = ['packages/*'];
  await json(join(directory, 'package.json'), rootPackage);
  await json(join(directory, 'packages/b/package.json'), { name: 'workspace-a' });
  await assert.rejects(readManifests(directory), /duplicate workspace/);
  rootPackage.workspaces = ['../outside'];
  await json(join(directory, 'package.json'), rootPackage);
  await assert.rejects(readManifests(directory), /stay inside/);
  delete rootPackage.workspaces;
  rootPackage.dependencies = ['shared'];
  await json(join(directory, 'package.json'), rootPackage);
  await assert.rejects(readManifests(directory), /Invalid dependencies/);
});

test('only registry semver selectors are eligible for synchronization', () => {
  for (const value of ['1.0.0', '^1.2.3', '~1.0', '*', '>= 1.0.0 <2', '1.0 - 2.0', '1.x || 2.x', '1.2.3-beta.1+build']) {
    assert.equal(isRegistryVersion(value), true, value);
  }
  for (const value of ['file:../shared', '../archive.tgz', '1.0.0.tgz', 'https://example.com/a.tgz', 'git+ssh://example.com', 'github:owner/repo', 'npm:alias@1.0.0', 'workspace:*', 'latest', 'vnext', '']) {
    assert.equal(isRegistryVersion(value), false, value);
  }
});

test('deps:check reads all sections/workspaces, reports drift and changes no files from another cwd', async (t) => {
  const { root, parent, repository } = await fixture(t);
  const before = await Promise.all(repository.manifests.map((manifest) => readFile(manifest.path, 'utf8')));
  const records = findVersions(repository, { shared: '1.1.0', absent: '3.0.0' });
  assert.equal(records.length, 4);
  assert.equal(findVersions(repository, { constructor: '1.0.0' }).length, 0);
  await assert.rejects(execute(process.execPath, [join(root, 'scripts/dependencies/check.js'), '--repo', 'repo'], { cwd: parent }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /workspace-a|packages.a.package.json/);
    assert.match(error.stdout, /peerDependencies.shared: >=1.0.0 -> 1.1.0/);

    return true;
  });
  const after = await Promise.all(repository.manifests.map((manifest) => readFile(manifest.path, 'utf8')));
  assert.deepEqual(after, before);
});

test('sync preserves package versions/sections and skips specials and absent dependencies', async (t) => {
  const { repository, directory } = await fixture(t);
  const records = findVersions(repository, { shared: '1.1.0', special: '2.0.0', absent: '3.0.0' });
  const calls = [];
  await synchronize(repository, records, (args, cwd) => calls.push({ args, cwd }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, directory);
  assert.ok(calls[0].args.includes('--package-lock-only'));
  assert.ok(calls[0].args.includes('--ignore-scripts'));
  const manifests = await readManifests(directory);
  assert.equal(manifests[0].package.version, '0.1.0');
  assert.equal(manifests[0].package.dependencies, undefined);
  assert.equal(manifests[0].package.devDependencies.shared, '1.1.0');
  assert.equal(manifests[1].package.dependencies.special, 'file:local.tgz');
  assert.equal(manifests[1].package.peerDependencies.shared, '1.1.0');
  assert.equal(manifests[2].package.optionalDependencies.shared, '1.1.0');
  assert.ok(manifests.every((manifest) => !manifest.package.dependencies?.absent));
  const refreshed = { ...repository, manifests };
  assert.equal(await synchronize(refreshed, findVersions(refreshed, { shared: '1.1.0' }), () => assert.fail()), false);
});

test('npm failure restores exact manifest and lock bytes, including no-lock repositories', async (t) => {
  const { repository, directory } = await fixture(t);
  const before = await Promise.all(repository.manifests.map((manifest) => readFile(manifest.path, 'utf8')));
  const lockPath = join(directory, 'package-lock.json');
  const originalLock = '{"lockfileVersion":3,"packages":{}}\n';
  await writeFile(lockPath, originalLock);
  const fail = async () => {
    await writeFile(lockPath, 'partial lock');
    throw new Error('npm failed');
  };
  const records = findVersions(repository, { shared: '1.1.0' });
  await assert.rejects(synchronize(repository, records, fail), /npm failed/);
  assert.equal(await readFile(lockPath, 'utf8'), originalLock);
  assert.deepEqual(await Promise.all(repository.manifests.map((manifest) => readFile(manifest.path, 'utf8'))), before);
  await rm(lockPath);
  await assert.rejects(synchronize(repository, records, fail), /npm failed/);
  await assert.rejects(readFile(lockPath), { code: 'ENOENT' });
});

test('checks follow actual package dependencies, propagate failures and keep browser tests opt-in', async () => {
  const types = { name: 'types', directory: '/types', manifests: [{ package: { name: '@active-book/types', scripts: { typecheck: 'tsc' } } }] };
  const core = { name: 'core', directory: '/core', manifests: [{ package: { name: '@active-book/core', devDependencies: { '@active-book/types': '*' }, scripts: { typecheck: 'tsc', 'test:unit': 'jest', 'test:browser': 'browser' } } }] };
  const editor = { name: 'editor', directory: '/editor', manifests: [{ package: { name: 'editor', dependencies: { '@active-book/core': '*' }, scripts: {} } }] };
  assert.deepEqual(orderRepositories([editor, core, types]), [types, core, editor]);
  const calls = [];
  const logs = [];
  const result = await checkRepositories({
    repositories: [editor, core, types], configuration: {}, log: (value) => logs.push(value),
    npm(args, cwd) {
      calls.push([args, cwd]);
      if (cwd === '/core') {
        throw new Error('npm exit 7');
      }
    },
  });
  assert.equal(result, 1);
  assert.equal(calls[0][1], '/types');
  assert.ok(calls.every(([args]) => !args.includes('test:browser') && !args.includes('install')));
  assert.ok(logs.some((line) => line.includes('editor] SKIPPED')));
  assert.ok(logs.some((line) => line.includes('exit 7')));
  calls.length = 0;
  assert.equal(await checkRepositories({ repositories: [core], configuration: {}, browser: true, log() {}, npm: (args) => calls.push(args) }), 0);
  assert.deepEqual(calls, [['run', 'test:browser']]);
  types.manifests[0].package.dependencies = { editor: '*' };
  assert.throws(() => orderRepositories([editor, core, types]), /cycle/);
});

test('npm process errors retain exit status and working directory', async (t) => {
  const directory = await temporaryDirectory(t);
  assert.throws(() => runNpm(['run', 'missing'], directory), /exit [1-9]/);
  assert.throws(() => runNpm(['--version'], join(directory, 'missing')), /Cannot start npm/);
});

test('real npm updates root/workspace locks with an isolated local registry and no install', async (t) => {
  const { root, directory } = await fixture(t);
  // Remove the intentionally nonexistent archive from this npm integration case.
  const workspacePath = join(directory, 'packages/a/package.json');
  const workspace = await readJson(workspacePath);
  delete workspace.dependencies.special;
  await json(workspacePath, workspace);
  const server = createServer((request, response) => {
    const address = server.address();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      name: 'shared', 'dist-tags': { latest: '1.1.0' },
      versions: {
        '1.1.0': { name: 'shared', version: '1.1.0', dist: { tarball: `http://127.0.0.1:${address.port}/shared.tgz`, shasum: '0'.repeat(40) } },
      },
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const env = {
    ...process.env,
    npm_config_registry: `http://127.0.0.1:${server.address().port}`,
    npm_config_cache: join(root, 'cache'),
    npm_execpath: findNpmCli(),
  };
  await execute(process.execPath, [join(root, 'scripts/dependencies/sync.js'), '--repo=repo'], { env });
  const lock = await readJson(join(directory, 'package-lock.json'));
  assert.equal(lock.packages[''].devDependencies.shared, '1.1.0');
  assert.equal(lock.packages['packages/a'].dependencies.shared, '1.1.0');
  assert.equal(lock.packages['packages/b'].optionalDependencies.shared, '1.1.0');
  assert.equal(lock.packages['node_modules/shared'].version, '1.1.0');
  await assert.rejects(readFile(join(directory, 'node_modules/shared/package.json')), { code: 'ENOENT' });
  await execute(process.execPath, [join(root, 'scripts/dependencies/check.js'), '--repo=repo'], { env });
});
