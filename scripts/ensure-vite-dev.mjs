import net from 'node:net';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 3000;

function isPortInUse() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

if (await isPortInUse()) {
  console.log(`Vite is already available on ${host}:${port}; reusing it for Tauri.`);
  // Tauri owns this helper process, not the pre-existing Vite process. Keep the
  // helper alive until Tauri closes so it can cleanly manage the desktop session.
  setInterval(() => {}, 60_000);
} else {
  const npmCliPath = process.env.npm_execpath;
  const npmCommand = npmCliPath
    ? process.execPath
    : process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const npmArgs = npmCliPath
    ? [npmCliPath, 'run', 'dev:vite-internal']
    : process.platform === 'win32' ? ['/d', '/c', 'npm.cmd run dev:vite-internal'] : ['run', 'dev:vite-internal'];
  const vite = spawn(npmCommand, npmArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  vite.once('error', error => {
    console.error('Unable to start the Vite development server:', error.message);
    process.exitCode = 1;
  });

  const stop = () => vite.kill();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  vite.once('exit', code => process.exit(code ?? 0));
}
