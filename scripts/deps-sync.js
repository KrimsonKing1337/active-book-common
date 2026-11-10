import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { configuration, readPackage, repositories } from './common.js';

const flags = {
  dependencies: '--save-prod',
  devDependencies: '--save-dev',
  peerDependencies: '--save-peer',
  optionalDependencies: '--save-optional',
};
const sections = Object.keys(flags);
const { values } = parseArgs({ options: { repo: { type: 'string', multiple: true } } });

try {
  const policy = new Map();
  for (const section of sections) {
    for (const [name, version] of Object.entries(configuration[section] ?? {})) {
      if (policy.has(name)) {
        throw new Error(`${name} appears in more than one activeBook dependency section`);
      }
      policy.set(name, { section, version });
    }
  }

  for (const repository of repositories(values.repo)) {
    const manifest = readPackage(repository.directory);
    const packages = [{ manifest }];
    if (manifest.workspaces) {
      const output = execFileSync(process.execPath, [process.env.npm_execpath, 'pkg', 'get', '--workspaces', '--json'], {
        cwd: repository.directory,
        encoding: 'utf8',
      });
      packages.push(...Object.entries(JSON.parse(output)).map(([workspace, manifest]) => ({ workspace, manifest })));
    }

    let installations = 0;
    for (const { manifest, workspace } of packages) {
      const groups = new Map();
      for (const [name, expected] of policy) {
        const declared = sections.filter((section) => Object.hasOwn(manifest[section] ?? {}, name));
        if (!declared.length) {
          continue;
        }
        if (declared.some((section) => /^(file:|link:|workspace:)|\.tgz$/.test(manifest[section][name]))) {
          console.log(`[${repository.name}/${workspace ?? 'root'}] SKIP local ${name}`);
          continue;
        }
        if (declared.length > 1) {
          throw new Error(`[${repository.name}/${workspace ?? 'root'}] ${name}: conflicting sections ${declared.join(', ')}`);
        }
        const current = declared[0];
        if (current === expected.section && manifest[current][name] === expected.version) {
          continue;
        }
        if (current !== expected.section && [current, expected.section]
          .some((section) => section === 'peerDependencies' || section === 'optionalDependencies')) {
          throw new Error(`[${repository.name}/${workspace ?? 'root'}] ${name}: ${current} -> ${expected.section} changes dependency semantics; resolve explicitly`);
        }
        if (!groups.has(expected.section)) {
          groups.set(expected.section, []);
        }
        groups.get(expected.section).push({ name, version: expected.version });
      }
      for (const [section, dependencies] of groups) {
        const specs = dependencies.map(({ name, version }) => `${name}@${version}`);
        const workspaceArgs = workspace ? ['--workspace', workspace] : [];
        console.log(`[${repository.name}/${workspace ?? 'root'}] ${section}: ${specs.join(' ')}`);
        // npm install host@range narrows the saved range. Set peer declarations
        // with npm first, then install without package arguments to preserve them.
        if (section === 'peerDependencies') {
          execFileSync(process.execPath, [process.env.npm_execpath, 'pkg', 'set',
            ...dependencies.map(({ name, version }) => `${section}[${name}]=${version}`), ...workspaceArgs], {
            cwd: repository.directory,
            stdio: 'inherit',
          });
        }
        execFileSync(process.execPath, [process.env.npm_execpath, 'install',
          ...(section === 'peerDependencies' ? [] : specs), flags[section], '--save-exact',
          '--no-audit', '--no-fund', ...workspaceArgs], {
          cwd: repository.directory,
          stdio: 'inherit',
        });
        installations++;
      }
    }
    console.log(`[${repository.name}] ${installations ? `DONE (${installations} npm installs)` : 'OK: no changes'}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
