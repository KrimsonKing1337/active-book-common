import { constants, copyFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { configuration, root } from './common.js';

const { values } = parseArgs({
  options: { repo: { type: 'string' }, force: { type: 'boolean', default: false } },
});

try {
  const name = values.repo;
  if (!name || basename(name) !== name || name === '.' || name === '..') {
    throw new Error('Use --repo <repository-name>');
  }
  const directory = resolve(root, configuration.repositories[name] || `../${name}`);
  mkdirSync(directory, { recursive: true });
  for (const file of ['.editorconfig', '.gitignore', 'AGENTS.md']) {
    try {
      copyFileSync(resolve(root, 'presets', file), resolve(directory, file), values.force ? 0 : constants.COPYFILE_EXCL);
      console.log(`[${name}] CREATED ${file}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      console.log(`[${name}] SKIP existing ${file}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
