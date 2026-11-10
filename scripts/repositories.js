import { glob, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, matchesGlob, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const commonRoot = fileURLToPath(new URL('../', import.meta.url));
export const dependencySections = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseOptions(args = process.argv.slice(2), allowBrowser = false) {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: 'string', multiple: true },
      ...(allowBrowser ? { browser: { type: 'boolean', default: false } } : {}),
    },
    strict: true,
    allowPositionals: false,
  });
  const repositories = values.repo?.flatMap((value) => value.split(','));
  if (repositories?.some((name) => !name.trim())) {
    throw new Error('--repo requires a repository name');
  }

  return { repositories, browser: values.browser ?? false };
}

export async function loadConfiguration(root = commonRoot) {
  const { activeBook } = await readJson(resolve(root, 'package.json'));
  if (!isObject(activeBook) || !isObject(activeBook.repositories) || !isObject(activeBook.sharedDependencies)) {
    throw new Error('activeBook.repositories and activeBook.sharedDependencies must be objects');
  }
  for (const [name, path] of Object.entries(activeBook.repositories)) {
    if (!name || /[\\/]/.test(name) || name === '.' || name === '..' || typeof path !== 'string') {
      throw new Error(`Invalid repository entry: ${name}`);
    }
  }
  const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;
  for (const [name, version] of Object.entries(activeBook.sharedDependencies)) {
    if (!name || typeof version !== 'string' || !exactVersion.test(version)) {
      throw new Error(`sharedDependencies.${name} must be an exact npm version`);
    }
    const prerelease = version.split('+')[0].split('-').slice(1).join('-');
    if (prerelease.split('.').some((part) => /^0\d+$/.test(part))) {
      throw new Error(`sharedDependencies.${name} has an invalid numeric prerelease identifier`);
    }
    if (name.startsWith('@active-book/') || /^active-?book(?:-|$)/i.test(name)) {
      throw new Error(`ActiveBook package cannot be synchronized: ${name}`);
    }
  }
  for (const field of ['checks', 'browserChecks']) {
    if (activeBook[field] === undefined) {
      continue;
    }
    if (!isObject(activeBook[field])) {
      throw new Error(`activeBook.${field} must be an object`);
    }
    for (const [name, scripts] of Object.entries(activeBook[field])) {
      if (!Object.hasOwn(activeBook.repositories, name) || !Array.isArray(scripts)
        || scripts.some((script) => typeof script !== 'string' || !script)) {
        throw new Error(`Invalid activeBook.${field}.${name}`);
      }
    }
  }

  return activeBook;
}

function isWithin(root, path) {
  const relativePath = relative(root, path);

  return relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

export async function readManifests(root) {
  const rootPath = resolve(root, 'package.json');
  const rootPackage = await readJson(rootPath);
  const manifests = [{ path: rootPath, directory: root, package: rootPackage }];
  const patterns = rootPackage.workspaces?.packages ?? rootPackage.workspaces ?? [];
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string')) {
    throw new Error(`Invalid workspaces in ${rootPath}`);
  }

  const workspacePaths = new Set();
  const includedPatterns = [];
  let excludedPatterns = [];
  // npm keeps earlier exclusions unless a later positive pattern explicitly
  // matches them. A general packages/* must not undo an earlier !packages/a.
  for (const pattern of patterns) {
    const negationLength = pattern.match(/^!+/)?.[0].length ?? 0;
    const excluded = negationLength % 2 === 1;
    const directoryPattern = pattern.slice(negationLength).replace(/\\/g, '/');
    if (!directoryPattern || isAbsolute(directoryPattern) || directoryPattern.split(/[\\/]/).includes('..')) {
      throw new Error(`Workspace must stay inside ${root}: ${pattern}`);
    }
    const normalized = directoryPattern.replace(/\/$/, '');
    if (excluded) {
      excludedPatterns.push(normalized);
    } else {
      excludedPatterns = excludedPatterns.filter((negative) => !matchesGlob(normalized, negative));
      includedPatterns.push(`${normalized}/package.json`);
    }
  }
  if (includedPatterns.length) {
    const exclude = ['**/node_modules/**', '**/.git/**', ...excludedPatterns.map((pattern) => `${pattern}/**`)];
    for await (const packagePath of glob(includedPatterns, { cwd: root, exclude })) {
      workspacePaths.add(resolve(root, packagePath));
    }
  }

  const names = new Set();
  const realRoot = await realpath(root);
  for (const path of [...workspacePaths].sort()) {
    if (path === rootPath || !isWithin(realRoot, await realpath(path))) {
      throw new Error(`Invalid workspace path: ${path}`);
    }
    const workspacePackage = await readJson(path);
    if (typeof workspacePackage.name !== 'string' || !workspacePackage.name || names.has(workspacePackage.name)) {
      throw new Error(`Missing or duplicate workspace name in ${path}`);
    }
    names.add(workspacePackage.name);
    manifests.push({ path, directory: dirname(path), package: workspacePackage });
  }
  for (const manifest of manifests) {
    for (const section of dependencySections) {
      const dependencies = manifest.package[section];
      if (dependencies !== undefined && (!isObject(dependencies)
        || Object.values(dependencies).some((version) => typeof version !== 'string'))) {
        throw new Error(`Invalid ${section} in ${manifest.path}`);
      }
    }
  }

  return manifests;
}

export async function readRepositories({ configuration, repositories, root = commonRoot }) {
  const selected = repositories ?? Object.keys(configuration.repositories);
  for (const name of selected) {
    if (!Object.hasOwn(configuration.repositories, name)) {
      throw new Error(`Unknown repository: ${name}`);
    }
  }
  const available = [];
  const errors = [];
  for (const name of new Set(selected)) {
    const path = configuration.repositories[name];
    const directory = resolve(root, path || `../${name}`);
    try {
      available.push({ name, directory, manifests: await readManifests(directory) });
    } catch (error) {
      errors.push(`[${name}] ${error.message}`);
    }
  }

  return { available, errors };
}
