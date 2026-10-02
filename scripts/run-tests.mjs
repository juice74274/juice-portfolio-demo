// Run the built public demo against an owned preview process, then close that process.
// Playwright's webServer child-tree shutdown can hang on Windows, so ownership lives here.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { once } from 'node:events';

const host = '127.0.0.1';
const port = 4174;
const url = `http://${host}:${port}/`;
const portInUse = () => new Promise(resolve => {
  const socket = connect(port, host);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
if (await portInUse()) {
  console.error(`Port ${port} is already in use; refusing to test another server.`);
  process.exit(1);
}
const server = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', host, '--port', String(port), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);
let serverExit = null;
server.on('exit', code => { serverExit = code ?? 1; });
let result = 1;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverExit !== null) throw new Error(`Preview exited before it was ready (${serverExit}).`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the owned preview process. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready || serverExit !== null) throw new Error('Preview did not become ready.');
  const tests = spawn(process.execPath, ['node_modules/playwright/cli.js', 'test', ...process.argv.slice(2)],
    { stdio: 'inherit', windowsHide: true });
  const [code] = await once(tests, 'exit');
  result = code ?? 1;
} catch (error) {
  console.error(error);
} finally {
  if (serverExit === null) {
    const exited = once(server, 'exit');
    server.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}
process.exit(result);
