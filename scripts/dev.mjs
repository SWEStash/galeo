// Development runner: renderer on Vite's dev server (hot reload), main and preload rebuilt in
// watch mode, and Electron restarted whenever either of them rebuilds.
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { build, createServer } from 'vite';
import { createBuildGate } from './lib/build-gate.mjs';
import { createRestarter } from './lib/restarter.mjs';

const renderer = await createServer({ configFile: 'build/vite.renderer.config.ts' });
await renderer.listen();
const devServerUrl = renderer.resolvedUrls?.local[0];
if (!devServerUrl) throw new Error('renderer dev server has no local URL');

let electron = null;
let shuttingDown = false;

async function stopElectron() {
  if (!electron) return;
  const child = electron;
  electron = null;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}

async function startElectron() {
  await stopElectron();
  const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, GALEO_DEV_SERVER_URL: devServerUrl },
  });
  child.once('exit', (code) => {
    // Quitting the app (rather than a restart) ends the dev session.
    if (electron === child) void shutdown(code ?? 0);
  });
  electron = child;
}

const restarter = createRestarter({ restart: startElectron, delayMs: 100 });
const MAIN = 'build/vite.main.config.ts';
const PRELOAD = 'build/vite.preload.config.ts';
// Electron starts once main and preload have both built; later rebuilds restart it.
const built = createBuildGate([MAIN, PRELOAD], () => restarter.request());

async function watchBuild(configFile) {
  const watcher = await build({ configFile, build: { watch: {} }, logLevel: 'warn' });
  watcher.on('event', (event) => {
    if (event.code === 'END') built(configFile);
    if (event.code === 'ERROR') console.error(event.error);
  });
  return watcher;
}

const watchers = await Promise.all([watchBuild(MAIN), watchBuild(PRELOAD)]);

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  restarter.cancel();
  await stopElectron();
  await Promise.all(watchers.map((w) => w.close()));
  await renderer.close();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
