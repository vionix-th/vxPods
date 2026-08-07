import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scripts = ['test:live:client', 'test:live:browser'];
let failed = false;

for (const script of scripts) {
  const result = spawnSync(npm, ['run', script], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
