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
  const policy = sections.flatMap((section) => Object.entries(configuration[section] ?? {})
    .map(([name, version]) => ({ name, version, section })));
  if (new Set(policy.map(({ name }) => name)).size !== policy.length) {
    throw new Error('A package appears in more than one activeBook dependency section');
  }
  const errors = [];
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
      for (const { name, version, section } of policy) {
        const declared = sections.filter((section) => Object.hasOwn(manifest[section] ?? {}, name));
        if (!declared.length) {
          continue;
        }
        const context = `[${repository.name}/${workspace ?? 'root'}] ${name}`;
        if (declared.length !== 1 || declared[0] !== section) {
          errors.push(`${context}: category mismatch\n  Expected: ${section}\n  Actual: ${declared.join(', ')}\n  No changes made`);
          continue;
        }
        if (/^(file:|link:|workspace:)|\.tgz$/.test(manifest[section][name])) {
          console.log(`${context}: SKIP local dependency`);
          continue;
        }
        if (manifest[section][name] === version) {
          continue;
        }
        if (!groups.has(section)) {
          groups.set(section, []);
        }
        groups.get(section).push(`${name}@${version}`);
      }
      for (const [section, dependencies] of groups) {
        console.log(`[${repository.name}/${workspace ?? 'root'}] ${section}: ${dependencies.join(' ')}`);
        execFileSync(process.execPath, [process.env.npm_execpath, 'install', ...dependencies, flags[section],
          '--save-exact', '--no-audit', '--no-fund', ...(workspace ? ['--workspace', workspace] : [])], {
          cwd: repository.directory,
          stdio: 'inherit',
        });
        installations++;
      }
    }
    console.log(`[${repository.name}] DONE (${installations} npm installs)`);
  }
  if (errors.length) {
    console.error(`\nConfiguration errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
  console.log(`Finished with ${errors.length} configuration error(s).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
