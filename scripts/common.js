import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export const readPackage = (directory) => {
  const packagePath = resolve(directory, 'package.json');
  const content = readFileSync(packagePath, 'utf8');

  return JSON.parse(content);
};

export const configuration = readPackage(root).activeBook;

export const repositories = (names) => {
  const selected = names?.flatMap((name) => name.split(','));

  for (const name of selected ?? []) {
    if (!Object.hasOwn(configuration.repositories, name)) {
      throw new Error(`Unknown repository: ${name}`);
    }
  }

  // Configuration order is the dependency order: types, core, editor.
  const entries = Object.entries(configuration.repositories);
  const filtered = entries.filter(([name]) => !selected || selected.includes(name));

  return filtered.map(([name, directory]) => {
    const repositoryPath = directory || `../${name}`;
    const directoryPath = resolve(root, repositoryPath);

    return {
      name,
      directory: directoryPath,
    };
  });
};
