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
  const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  const stop = () => vite.kill();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  vite.once('exit', code => process.exit(code ?? 0));
}
