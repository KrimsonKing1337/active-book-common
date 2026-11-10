import { commonRoot, loadConfiguration, parseOptions, readRepositories } from '../repositories.js';
import { findVersions, reportVersions, synchronize } from './versions.js';

export async function dependenciesCommand(sync, args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const configuration = await loadConfiguration();
  const { available, errors } = await readRepositories({ configuration, ...options, root: commonRoot });
  for (const error of errors) {
    console.error(error);
  }
  let failed = errors.length > 0;
  for (const repository of available) {
    const records = findVersions(repository, configuration.sharedDependencies);
    reportVersions(repository, records);
    if (!sync) {
      failed ||= records.some((record) => !record.special && record.current !== record.expected);
      continue;
    }
    try {
      const changed = await synchronize(repository, records);
      console.log(`[${repository.name}] ${changed ? 'SYNCED manifests and npm lock; run npm ci separately to update node_modules' : 'OK: nothing to synchronize'}`);
    } catch (error) {
      failed = true;
      console.error(`[${repository.name}] FAILED: ${error.message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
