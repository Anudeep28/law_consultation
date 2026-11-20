import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2).filter((arg) => arg !== '--watchAll=false');
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run',
  ...args,
], { stdio: 'inherit' });

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
