import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const readPackage = (directory) => JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
export const configuration = readPackage(root).activeBook;

export function repositories(names) {
  const selected = names?.flatMap((name) => name.split(','));
  for (const name of selected ?? []) {
    if (!Object.hasOwn(configuration.repositories, name)) {
      throw new Error(`Unknown repository: ${name}`);
    }
  }

  // Configuration order is the dependency order: types, core, editor.
  return Object.entries(configuration.repositories)
    .filter(([name]) => !selected || selected.includes(name))
    .map(([name, directory]) => ({ name, directory: resolve(root, directory || `../${name}`) }));
}
