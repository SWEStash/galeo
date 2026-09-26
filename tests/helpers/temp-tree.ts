import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * Writes `files` (relative path → contents) under a fresh temp directory, removed when the
 * current test finishes. Returns the directory.
 */
export function writeTempTree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'galeo-test-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  return root;
}
