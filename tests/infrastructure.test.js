import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const source = new URL('../', import.meta.url);

async function json(path, value) {
  await writeFile(path, JSON.stringify(value));
}

async function fixture(t, policy = {}) {
  const parent = await mkdtemp(join(tmpdir(), 'active book-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const common = join(parent, 'active-book-common');
  await cp(new URL('scripts', source), join(common, 'scripts'), { recursive: true });
  await cp(new URL('presets', source), join(common, 'presets'), { recursive: true });
  const configuration = { repositories: { first: '', second: '' }, ...policy };
  await json(join(common, 'package.json'), { type: 'module', activeBook: configuration });
  for (const name of ['first', 'second']) {
    await mkdir(join(parent, name));
    await json(join(parent, name, 'package.json'), { name, private: true });
  }
  const calls = join(parent, 'calls.jsonl');
  const npm = join(parent, 'npm.cjs');
  await writeFile(npm, `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({args, cwd:process.cwd()})+'\\n');
    if (args[0] === 'pkg') console.log(process.env.WORKSPACES || '{}');
    if (args.includes('fail') || (args[0] === 'install' && process.env.FAIL_INSTALL)) process.exit(7);
  `);
  const env = { ...process.env, npm_execpath: npm };
  const run = (script, args = [], extraEnv = {}) => execute(process.execPath,
    [join(common, 'scripts', `${script}.js`), ...args], { cwd: parent, env: { ...env, ...extraEnv } });
  const recorded = async () => {
    try {
      return (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      return [];
    }
  };

  return { parent, common, calls, configuration, run, recorded };
}

test('optional dependency policies are empty; absent and already matching packages cause no install', async (t) => {
  const f = await fixture(t);
  await json(join(f.common, 'package.json'), {
    type: 'module', devDependencies: { tool: '2.0.0' }, activeBook: f.configuration,
  });
  await json(join(f.parent, 'first/package.json'), { devDependencies: { tool: '1.0.0' } });
  await f.run('deps-sync');
  assert.deepEqual(await f.recorded(), []);
  f.configuration.devDependencies = { tool: '1.0.0', absent: '2.0.0' };
  await json(join(f.common, 'package.json'), { type: 'module', activeBook: f.configuration });
  await json(join(f.parent, 'first/package.json'), { devDependencies: { tool: '1.0.0' } });
  await f.run('deps-sync');
  assert.deepEqual(await f.recorded(), []);
});

test('standard sections map to npm flags; changes are grouped and workspaces use native npm discovery', async (t) => {
  const f = await fixture(t, {
    dependencies: { runtime: '2.0.0' },
    devDependencies: { tool: '2.0.0', compiler: '2.0.0', absent: '2.0.0', local: '2.0.0' },
    peerDependencies: { host: '^2.0.0' },
    optionalDependencies: { extra: '2.0.0' },
  });
  await json(join(f.parent, 'first/package.json'), {
    workspaces: ['packages/*'], dependencies: { tool: '^1.0.0' },
    devDependencies: { compiler: '^1.0.0', runtime: '^1.0.0', local: 'file:../local.tgz' },
    peerDependencies: { host: '^1.0.0' }, optionalDependencies: { extra: '^1.0.0' },
  });
  await f.run('deps-sync', ['--repo=first'], {
    WORKSPACES: JSON.stringify({ workspace: { devDependencies: { tool: '^1.0.0' } } }),
  });
  const calls = await f.recorded();
  assert.deepEqual(calls[0].args, ['pkg', 'get', '--workspaces', '--json']);
  const installs = calls.filter((call) => call.args[0] === 'install');
  assert.equal(installs.length, 5);
  assert.ok(installs.some(({ args }) => args.includes('--save-dev') && args.includes('tool@2.0.0') && args.includes('compiler@2.0.0')));
  assert.ok(installs.some(({ args }) => args.includes('--save-prod') && args.includes('runtime@2.0.0')));
  assert.ok(installs.some(({ args }) => args.includes('--save-peer')));
  assert.ok(calls.some(({ args }) => args.includes('set') && args.includes('peerDependencies[host]=^2.0.0')));
  assert.ok(installs.some(({ args }) => args.includes('--save-optional') && args.includes('extra@2.0.0')));
  assert.ok(installs.some(({ args }) => args.includes('--workspace') && args.includes('workspace')));
  assert.ok(installs.every(({ args }) => !args.some((arg) => arg.startsWith('absent@') || arg.startsWith('local@'))));
});

test('ambiguous dual declarations and duplicate policies fail before installation', async (t) => {
  const f = await fixture(t, { peerDependencies: { host: '^1.0.0' } });
  await json(join(f.parent, 'first/package.json'), {
    devDependencies: { host: '1.0.0' }, peerDependencies: { host: '^1.0.0' },
  });
  await assert.rejects(f.run('deps-sync'), /conflicting sections/);
  f.configuration.devDependencies = { host: '1.0.0' };
  await json(join(f.common, 'package.json'), { type: 'module', activeBook: f.configuration });
  await assert.rejects(f.run('deps-sync'), /more than one/);
  assert.deepEqual(await f.recorded(), []);
});

test('npm install failure stops dependency synchronization before the next repository', async (t) => {
  const f = await fixture(t, { devDependencies: { tool: '2.0.0' } });
  for (const name of ['first', 'second']) {
    await json(join(f.parent, name, 'package.json'), { devDependencies: { tool: '1.0.0' } });
  }
  await assert.rejects(f.run('deps-sync', [], { FAIL_INSTALL: '1' }), { code: 1 });
  assert.equal((await f.recorded()).length, 1);
});

test('check groups select only their scripts; missing scripts skip; errors do not stop later checks/repos', async (t) => {
  const checks = {
    typecheck: ['types'], lint: { ts: ['ts'], css: ['css'] },
    test: { unit: ['unit'], component: ['component'], browser: ['browser'] },
  };
  const f = await fixture(t, { checks });
  const scripts = Object.fromEntries(['types', 'ts', 'css', 'unit', 'component', 'browser'].map((name) => [name, 'test']));
  await json(join(f.parent, 'first/package.json'), { scripts });
  for (const [group, expected] of Object.entries({
    check: ['types', 'ts', 'css', 'unit', 'component', 'browser'], typecheck: ['types'],
    lint: ['ts', 'css'], 'lint:ts': ['ts'], 'lint:css': ['css'], test: ['unit', 'component', 'browser'],
    'test:unit': ['unit'], 'test:component': ['component'], 'test:browser': ['browser'],
  })) {
    await rm(f.calls, { force: true });
    await f.run('check', [group, '--repo=first']);
    assert.deepEqual((await f.recorded()).map(({ args }) => args[1]), expected, group);
  }
  f.configuration.checks = { lint: ['fail', 'css', 'missing'] };
  await json(join(f.common, 'package.json'), { type: 'module', activeBook: f.configuration });
  for (const name of ['first', 'second']) {
    await json(join(f.parent, name, 'package.json'), { scripts: { fail: 'fail', css: 'pass' } });
  }
  await rm(f.calls);
  await assert.rejects(f.run('check', ['lint', '--repo=second,first']), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /SKIP missing scripts: missing/);
    assert.match(error.stderr, /Failed checks/);

    return true;
  });
  const calls = await f.recorded();
  assert.equal(calls.length, 4);
  assert.equal(calls[0].cwd, join(f.parent, 'first'));
  assert.equal(calls[3].args[1], 'css');
});

test('bad repo paths and unknown groups are errors; checks continue for available repositories', async (t) => {
  const f = await fixture(t, { checks: { lint: ['lint'] } });
  await rm(join(f.parent, 'first'), { recursive: true });
  await json(join(f.parent, 'second/package.json'), { scripts: { lint: 'pass' } });
  await assert.rejects(f.run('check', ['lint']), { code: 1 });
  assert.equal((await f.recorded()).length, 1);
  await assert.rejects(f.run('check', ['unknown']), /Unknown check group/);
  await assert.rejects(f.run('deps-sync', ['--repo=unknown']), /Unknown repository/);
});

test('init:repo copies minimal presets, preserves existing files and supports explicit force', async (t) => {
  const f = await fixture(t);
  await f.run('init-repo', ['--repo=new-project']);
  const agents = join(f.parent, 'new-project/AGENTS.md');
  assert.match(await readFile(agents, 'utf8'), /active-book-common\/AGENTS.md/);
  await writeFile(agents, 'local rules');
  await f.run('init-repo', ['--repo=new-project']);
  assert.equal(await readFile(agents, 'utf8'), 'local rules');
  await f.run('init-repo', ['--repo=new-project', '--force']);
  assert.notEqual(await readFile(agents, 'utf8'), 'local rules');
});

test('real npm moves prod/dev dependencies, preserves peer ranges and updates workspace manifests/locks', async (t) => {
  const f = await fixture(t, {
    dependencies: { runtime: '1.1.0' }, devDependencies: { tool: '1.1.0' },
    peerDependencies: { host: '>=1.0.0 <2' }, optionalDependencies: { extra: '1.1.0' },
  });
  const archives = new Map();
  const npm = process.env.npm_execpath;
  for (const name of ['runtime', 'tool', 'host', 'extra']) {
    const directory = join(f.parent, name);
    await mkdir(directory);
    await json(join(directory, 'package.json'), { name, version: '1.1.0' });
    await execute(process.execPath, [npm, 'pack', '--ignore-scripts'], { cwd: directory });
    archives.set(name, await readFile(join(directory, `${name}-1.1.0.tgz`)));
  }
  const server = createServer((request, response) => {
    const name = request.url.slice(1).split('/')[0];
    if (request.url.endsWith('.tgz')) {
      response.end(archives.get(name));
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name, 'dist-tags': { latest: '1.1.0' }, versions: {
      '1.1.0': { name, version: '1.1.0', dist: { tarball: `http://127.0.0.1:${server.address().port}/${name}/${name}.tgz` } },
    } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await mkdir(join(f.parent, 'first/packages/a'), { recursive: true });
  await json(join(f.parent, 'first/package.json'), {
    name: 'first', private: true, workspaces: ['packages/*'],
    dependencies: { runtime: '^1.0.0', tool: '^1.0.0' },
    peerDependencies: { host: '^1.0.0' }, optionalDependencies: { extra: '^1.0.0' },
  });
  await json(join(f.parent, 'first/packages/a/package.json'), {
    name: 'workspace-a', version: '1.0.0', devDependencies: { tool: '^1.0.0' },
  });
  await f.run('deps-sync', ['--repo=first'], {
    npm_execpath: npm, npm_config_cache: join(f.parent, 'cache'),
    npm_config_registry: `http://127.0.0.1:${server.address().port}`,
  });
  const manifest = JSON.parse(await readFile(join(f.parent, 'first/package.json'), 'utf8'));
  assert.equal(manifest.dependencies.runtime, '1.1.0');
  assert.equal(manifest.dependencies.tool, undefined);
  assert.equal(manifest.devDependencies.tool, '1.1.0');
  assert.equal(manifest.peerDependencies.host, '>=1.0.0 <2');
  assert.equal(manifest.optionalDependencies.extra, '1.1.0');
  const lock = JSON.parse(await readFile(join(f.parent, 'first/package-lock.json'), 'utf8'));
  assert.equal(lock.packages['packages/a'].devDependencies.tool, '1.1.0');
});
