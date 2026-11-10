import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { configuration, readPackage, repositories } from './common.js';

const sections = ['dependencies', 'devDependencies'];

const parsedArgs = parseArgs({
  options: {
    repo: {
      type: 'string',
      multiple: true,
    },
  },
});

const readPackages = (directory) => {
  const manifest = readPackage(directory);
  const packages = [{ manifest }];

  if (!manifest.workspaces) {
    return packages;
  }

  const output = execFileSync(process.execPath, [
    process.env.npm_execpath,
    'pkg',
    'get',
    '--workspaces',
    '--json',
  ], {
    cwd: directory,
    encoding: 'utf8',
  });

  const workspaces = JSON.parse(output);

  for (const [workspace, workspaceManifest] of Object.entries(workspaces)) {
    packages.push({
      workspace,
      manifest: workspaceManifest,
    });
  }

  return packages;
};

const findUpdates = ({ manifest, section, location }) => {
  const updates = [];
  const errors = [];

  for (const [name, version] of Object.entries(configuration[section] ?? {})) {
    const declaredSections = sections.filter((sectionCur) => {
      return Object.hasOwn(manifest[sectionCur] ?? {}, name);
    });

    if (!declaredSections.length) {
      continue;
    }

    if (declaredSections.length !== 1 || declaredSections[0] !== section) {
      const declaredSectionsJoined = declaredSections.join(', ');

      const errorName = `[${location}] ${name}`;
      const expected = `expected ${section}`;
      const actual = `actual ${declaredSectionsJoined}`;
      const end = 'no changes made';

      const fullErrorMessage = `${errorName}: ${expected}, ${actual}; ${end}`;

      errors.push(fullErrorMessage);

      continue;
    }

    const currentVersion = manifest[section][name];

    const isLocalDependency = /^(file:|link:|workspace:)|\.tgz$/.test(currentVersion);

    if (currentVersion === version || isLocalDependency) {
      continue;
    }

    updates.push(`${name}@${version}`);
  }

  return { updates, errors };
};

try {
  const dependencies = configuration.dependencies ?? {};
  const devDependencies = configuration.devDependencies ?? {};

  const duplicates = Object.keys(dependencies).filter((nameCur) => {
    return Object.hasOwn(devDependencies, nameCur);
  });

  if (duplicates.length) {
    const duplicatesJoined = duplicates.join(', ');

    throw new Error(`Packages declared in multiple dependency sections: ${duplicatesJoined}`);
  }

  const errors = [];

  for (const repositoryCur of repositories(parsedArgs.values.repo)) {
    const { name, directory } = repositoryCur;

    const packages = readPackages(directory);

    let installations = 0;

    for (const { manifest, workspace } of packages) {
      const root = workspace ?? 'root';
      const location = `${name}/${root}`;

      for (const sectionCur of sections) {
        const foundUpdated = findUpdates({
          manifest,
          section: sectionCur,
          location,
        });

        const { updates, errors: conflicts } = foundUpdated;

        errors.push(...conflicts);

        if (!updates.length) {
          continue;
        }

        const saveFlag = sectionCur === 'dependencies' ? '--save-prod' : '--save-dev';
        const workspaceArgs = workspace ? ['--workspace', workspace] : [];

        const args = [
          process.env.npm_execpath,
          'install',
          ...updates,
          saveFlag,
          '--save-exact',
          '--no-audit',
          '--no-fund',
          ...workspaceArgs,
        ];

        const messageName = `[${location}] ${sectionCur}`;
        const updatesJointed = updates.join(' ');

        console.log(`${messageName}: ${updatesJointed}`);

        execFileSync(process.execPath, args, {
          cwd: directory,
          stdio: 'inherit',
        });

        installations++;
      }
    }

    console.log(`[${name}] DONE (${installations} npm installs)`);
  }

  if (errors.length) {
    const errorsJointed = errors.join('\n');

    console.error(`\nConfiguration errors:\n${errorsJointed}`);

    process.exitCode = 1;
  }

  console.log(`Finished with ${errors.length} configuration error(s).`);
} catch (error) {
  console.error(error.message);

  process.exitCode = 1;
}
