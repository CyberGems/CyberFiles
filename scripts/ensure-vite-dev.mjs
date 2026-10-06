import net from 'node:net';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 1421;
const devUrl = `http://${host}:${port}`;

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

async function isCyberFilesViteServer() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(2_000) });
    const html = await response.text();
    return response.ok
      && html.includes('name="application-name" content="CyberFiles"')
      && html.includes('/@vite/client');
  } catch {
    return false;
  }
}

if (await isPortInUse()) {
  if (!await isCyberFilesViteServer()) {
    console.error(`Port ${port} is already in use by another application. CyberFiles will not reuse that server.`);
    process.exit(1);
  }

  console.log(`CyberFiles Vite is already available on ${devUrl}; reusing it for Tauri.`);
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
