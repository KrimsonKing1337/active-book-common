import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { configuration, readPackage, repositories } from './common.js';

const parsedArgs = parseArgs({
  allowPositionals: true,
  options: {
    repo: {
      type: 'string',
      multiple: true,
    }
  },
});

const values = parsedArgs.values;
const group = parsedArgs.positionals[0] ?? 'check';

const collectScripts = (checks) => {
  if (Array.isArray(checks)) {
    return checks;
  }

  return Object.values(checks).flatMap(collectScripts);
};

try {
  let checks = configuration.checks;

  if (group !== 'check') {
    for (const part of group.split(':')) {
      checks = checks?.[part];
    }
  }

  if (!checks) {
    throw new Error(`Unknown check group: ${group}`);
  }

  const collectedScripts = collectScripts(checks);
  const scripts = [...new Set(collectedScripts)];

  const summary = [];
  const failures = [];

  for (const repositoryCur of repositories(values.repo)) {
    const { name, directory } = repositoryCur;

    const result = {
      repository: name,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    summary.push(result);

    let availableScripts;

    try {
      availableScripts = readPackage(directory).scripts ?? {};
    } catch (error) {
      console.error(`[${name}] ${error.message}`);

      result.failed++;

      const exitCode = error.code ?? 1;

      failures.push({
        repository: name,
        check: 'package.json',
        exit: exitCode,
      });

      continue;
    }

    const skipped = [];

    for (const scriptCur of scripts) {
      if (!Object.hasOwn(availableScripts, scriptCur)) {
        skipped.push(scriptCur);

        continue;
      }

      console.log(`[${name}] ${scriptCur}`);

      try {
        execFileSync(process.execPath, [process.env.npm_execpath, 'run', scriptCur], {
          cwd: directory,
          stdio: 'inherit',
        });

        result.passed++;
      } catch (error) {
        result.failed++;

        const exitCode = error.status ?? error.code ?? 1;

        failures.push({
          repository: name,
          check: scriptCur,
          exit: exitCode,
        });
      }
    }

    result.skipped = skipped.length;

    if (skipped.length) {
      const skippedJoined = skipped.join(', ');

      console.log(`[${name}] SKIP missing scripts: ${skippedJoined}`);
    }
  }

  console.table(summary);

  if (failures.length) {
    console.error('Failed checks:');
    console.table(failures);

    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);

  process.exitCode = 1;
}
