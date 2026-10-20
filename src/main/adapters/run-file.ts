import { execFile } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

/** Runs a program without a shell and resolves with its output. */
export type RunFile = (file: string, args: readonly string[], options: { timeout: number; maxBuffer: number }) => Promise<string>;

/**
 * Where `name` is on `PATH`, looking only in absolute entries: an empty or relative one (`.`, `bin`)
 * would run whatever program of that name sits in the folder galeo was started from.
 */
export function findProgram(name: string, pathVariable = process.env['PATH'] ?? ''): string | null {
  for (const dir of pathVariable.split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    const file = path.join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      // Not here.
    }
  }
  return null;
}

/** Runs the program `name`, found by `findProgram`; one that isn't found fails without running anything. */
export const runFile: RunFile = (name, args, options) =>
  new Promise((resolve, reject) => {
    const file = findProgram(name);
    if (!file) return reject(new Error(`${name}: not found on PATH`));
    execFile(file, args, { ...options, encoding: 'utf8', windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
