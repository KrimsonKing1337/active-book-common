import { existsSync, realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Invoke npm's JavaScript entry point: no shell quoting or npm.cmd on Windows.
export function findNpmCli() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }

  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const bundledCli = join(directory, 'node_modules/npm/bin/npm-cli.js');
    if (existsSync(bundledCli)) {
      return bundledCli;
    }

    const executable = join(directory, 'npm');
    if (process.platform !== 'win32' && existsSync(executable)) {
      return realpathSync(executable);
    }
  }

  throw new Error('npm CLI not found. Run this command through npm run.');
}

export function runNpm(args, cwd) {
  const result = spawnSync(process.execPath, [findNpmCli(), ...args], {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(`Cannot start npm in ${cwd}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} in ${cwd}: ${result.signal ?? `exit ${result.status}`}`);
  }
}
