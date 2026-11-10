import { readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { dependencySections } from '../repositories.js';
import { runNpm } from '../npm.js';

// Registry semver selectors only. Aliases, tags, URLs, git, workspace:, file:
// and tarballs require an explicit decision and are never rewritten.
export function isRegistryVersion(version) {
  const selector = /^(?:[~^<>=]{1,2})?v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z.-]+)?$/;
  const tokens = version.trim().replace(/([~^<>=])\s+/g, '$1').split(/\s*\|\|\s*|\s+-\s+|\s+/);

  return tokens.every((token) => selector.test(token));
}

export function findVersions(repository, sharedDependencies) {
  const records = [];
  for (const manifest of repository.manifests) {
    for (const section of dependencySections) {
      for (const [name, expected] of Object.entries(sharedDependencies)) {
        const dependencies = manifest.package[section];
        if (!dependencies || !Object.hasOwn(dependencies, name)) {
          continue;
        }
        const current = dependencies[name];
        records.push({ manifest, section, name, current, expected, special: !isRegistryVersion(current) });
      }
    }
  }

  return records;
}

export function reportVersions(repository, records, log = console.log) {
  for (const record of records) {
    const location = relative(repository.directory, record.manifest.path);
    const status = record.special ? 'SKIP special' : record.current === record.expected ? 'OK' : 'MISMATCH';
    log(`[${repository.name}] ${location} ${record.section}.${record.name}: ${record.current} -> ${record.expected} (${status})`);
  }
  if (!records.length) {
    log(`[${repository.name}] SKIP: no shared dependencies declared`);
  }
}

export async function synchronize(repository, records, npm = runNpm) {
  const changes = records.filter((record) => !record.special && record.current !== record.expected);
  if (!changes.length) {
    return false;
  }

  // Keep original bytes for rollback if npm fails. npm alone writes the lock.
  const snapshots = new Map();
  for (const manifest of repository.manifests) {
    snapshots.set(manifest.path, await readFile(manifest.path));
  }
  const lockPath = resolve(repository.directory, 'npm-shrinkwrap.json');
  const packageLockPath = resolve(repository.directory, 'package-lock.json');
  for (const path of [lockPath, packageLockPath]) {
    try {
      snapshots.set(path, await readFile(path));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  try {
    for (const manifest of new Set(changes.map((record) => record.manifest))) {
      const original = snapshots.get(manifest.path).toString('utf8');
      const updated = JSON.parse(original);
      for (const record of changes.filter((record) => record.manifest === manifest)) {
        updated[record.section][record.name] = record.expected;
      }
      const indent = original.match(/\n([\t ]+)"/)?.[1] ?? '  ';
      const newline = original.includes('\r\n') ? '\r\n' : '\n';
      const text = JSON.stringify(updated, null, indent).replace(/\n/g, newline);
      await writeFile(manifest.path, `${text}${original.endsWith('\n') ? newline : ''}`);
    }
    await npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=true'], repository.directory);
  } catch (error) {
    for (const [path, bytes] of snapshots) {
      await writeFile(path, bytes);
    }
    // An unsuccessful first lock generation must not leave a partial lock behind.
    for (const path of [lockPath, packageLockPath]) {
      if (!snapshots.has(path)) {
        await rm(path, { force: true });
      }
    }
    throw error;
  }

  return true;
}
