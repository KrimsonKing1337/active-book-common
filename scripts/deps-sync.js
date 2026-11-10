import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { configuration, readPackage, repositories } from './common.js';

const sections = ['dependencies', 'devDependencies'];
const { values } = parseArgs({ options: { repo: { type: 'string', multiple: true } } });

try {
  if (Object.keys(configuration.dependencies ?? {}).some((name) =>
    Object.hasOwn(configuration.devDependencies ?? {}, name))) {
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
      for (const section of sections) {
        const updates = [];
        for (const [name, version] of Object.entries(configuration[section] ?? {})) {
          const declared = sections.filter((section) => Object.hasOwn(manifest[section] ?? {}, name));
          if (!declared.length) {
            continue;
          }
          if (declared.length !== 1 || declared[0] !== section) {
            errors.push(`[${repository.name}/${workspace ?? 'root'}] ${name}: expected ${section}, actual ${declared.join(', ')}; no changes made`);
            continue;
          }
          const current = manifest[section][name];
          if (current !== version && !/^(file:|link:|workspace:)|\.tgz$/.test(current)) {
            updates.push(`${name}@${version}`);
          }
        }
        if (!updates.length) {
          continue;
        }
        console.log(`[${repository.name}/${workspace ?? 'root'}] ${section}: ${updates.join(' ')}`);
        execFileSync(process.execPath, [process.env.npm_execpath, 'install', ...updates,
          section === 'dependencies' ? '--save-prod' : '--save-dev', '--save-exact', '--no-audit', '--no-fund',
          ...(workspace ? ['--workspace', workspace] : [])], { cwd: repository.directory, stdio: 'inherit' });
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
