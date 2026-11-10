import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { configuration, readPackage, repositories } from './common.js';

const { values, positionals: [group = 'check'] } = parseArgs({
  allowPositionals: true,
  options: { repo: { type: 'string', multiple: true } },
});

function scriptsIn(group) {
  return Array.isArray(group) ? group : Object.values(group).flatMap(scriptsIn);
}

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
  const scripts = [...new Set(scriptsIn(checks))];
  const summary = [];
  const failures = [];
  for (const repository of repositories(values.repo)) {
    const result = { repository: repository.name, passed: 0, failed: 0, skipped: 0 };
    try {
      const manifest = readPackage(repository.directory);
      const skipped = [];
      for (const script of scripts) {
        if (!Object.hasOwn(manifest.scripts ?? {}, script)) {
          skipped.push(script);
          result.skipped++;
          continue;
        }
        console.log(`[${repository.name}] ${script}`);
        try {
          execFileSync(process.execPath, [process.env.npm_execpath, 'run', script], {
            cwd: repository.directory,
            stdio: 'inherit',
          });
          result.passed++;
        } catch (error) {
          result.failed++;
          failures.push({ repository: repository.name, check: script, exit: error.status ?? error.code });
        }
      }
      if (skipped.length) {
        console.log(`[${repository.name}] SKIP missing scripts: ${skipped.join(', ')}`);
      }
    } catch (error) {
      console.error(`[${repository.name}] ${error.message}`);
      result.failed++;
      failures.push({ repository: repository.name, check: 'package.json', exit: error.code ?? 1 });
    }
    summary.push(result);
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
