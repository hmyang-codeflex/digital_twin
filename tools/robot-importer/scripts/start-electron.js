const { spawn } = require('child_process');
const electron = require('electron');

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});

child.on('exit', (code) => process.exit(code ?? 0));
