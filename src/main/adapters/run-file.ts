import { execFile } from 'node:child_process';

/** Runs a program without a shell and resolves with its output. */
export type RunFile = (file: string, args: readonly string[], options: { timeout: number; maxBuffer: number }) => Promise<string>;

export const runFile: RunFile = (file, args, options) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { ...options, encoding: 'utf8', windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout))),
  );
