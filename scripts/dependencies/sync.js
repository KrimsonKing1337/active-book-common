import { dependenciesCommand } from './command.js';

dependenciesCommand(true).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
