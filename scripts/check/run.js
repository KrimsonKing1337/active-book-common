import { loadConfiguration, parseOptions, readRepositories } from '../repositories.js';
import { checkRepositories } from './checks.js';

async function main() {
  const options = parseOptions(process.argv.slice(2), true);
  const configuration = await loadConfiguration();
  const { available, errors } = await readRepositories({ configuration, ...options });
  errors.forEach((error) => console.error(error));
  const result = await checkRepositories({ repositories: available, configuration, browser: options.browser });
  process.exitCode = errors.length ? 1 : result;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
