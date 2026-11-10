import { dependencySections } from '../repositories.js';
import { runNpm } from '../npm.js';

export function orderRepositories(repositories) {
  const owners = new Map();
  for (const repository of repositories) {
    for (const manifest of repository.manifests) {
      const name = manifest.package.name;
      if (owners.has(name) && owners.get(name) !== repository) {
        throw new Error(`Package ${name} belongs to multiple repositories`);
      }
      owners.set(name, repository);
    }
  }
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(repository) {
    if (visited.has(repository)) {
      return;
    }
    if (visiting.has(repository)) {
      throw new Error(`Repository dependency cycle at ${repository.name}`);
    }
    visiting.add(repository);
    for (const manifest of repository.manifests) {
      for (const section of dependencySections) {
        for (const name of Object.keys(manifest.package[section] ?? {})) {
          const owner = owners.get(name);
          if (owner && owner !== repository) {
            visit(owner);
          }
        }
      }
    }
    visiting.delete(repository);
    visited.add(repository);
    ordered.push(repository);
  }
  repositories.forEach(visit);

  return ordered;
}

export async function checkRepositories({ repositories, configuration, browser = false, npm = runNpm, log = console.log }) {
  let failed = false;
  for (const repository of orderRepositories(repositories)) {
    const scripts = repository.manifests[0].package.scripts ?? {};
    const configured = browser ? configuration.browserChecks : configuration.checks;
    // Unknown future repositories only opt into names with an explicit purpose.
    const defaultChecks = browser ? ['test:browser'] : ['typecheck', 'lint:check', 'test:unit'];
    const checks = Object.hasOwn(configured ?? {}, repository.name)
      ? configured[repository.name]
      : defaultChecks;
    let executed = 0;
    let repositoryFailed = false;
    for (const script of checks) {
      if (!Object.hasOwn(scripts, script)) {
        log(`[${repository.name}] SKIP ${script}: script is absent`);
        continue;
      }
      log(`[${repository.name}] RUN ${script}`);
      executed++;
      try {
        await npm(['run', script], repository.directory);
        log(`[${repository.name}] PASS ${script}`);
      } catch (error) {
        failed = true;
        repositoryFailed = true;
        log(`[${repository.name}] FAIL ${script}: ${error.message}`);
      }
    }
    log(`[${repository.name}] ${repositoryFailed ? 'FAILED' : executed ? 'PASSED' : 'SKIPPED'} (${executed} checks)`);
  }

  return failed ? 1 : 0;
}
