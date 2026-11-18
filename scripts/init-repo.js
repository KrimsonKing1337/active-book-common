import { constants, copyFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { configuration, root } from './common.js';

const { values } = parseArgs({
  options: {
    repo: {
      type: 'string',
    },
    force: {
      type: 'boolean',
      default: false,
    }
  },
});

const files = ['.editorconfig', '.gitignore', 'AGENTS.md'];

try {
  const name = values.repo;

  if (!name || basename(name) !== name || name === '.' || name === '..') {
    throw new Error('Use --repo <repository-name>');
  }

  const directory = resolve(root, configuration.repositories[name] || `../${name}`);

  mkdirSync(directory, { recursive: true });

  for (const fileCur of files) {
    try {
      const presetsPath = resolve(root, 'presets', fileCur);
      const directoryPath = resolve(directory, fileCur);

      const mode = values.force ? 0 : constants.COPYFILE_EXCL;

      copyFileSync(presetsPath, directoryPath, mode);

      console.log(`[${name}] CREATED ${fileCur}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }

      console.log(`[${name}] SKIP existing ${fileCur}`);
    }
  }
} catch (error) {
  console.error(error.message);

  process.exitCode = 1;
}
