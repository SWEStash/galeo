import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../src/core/formats/registry';
import { ASSOCIATED_EXTENSIONS, FILE_ASSOCIATIONS, MAC_FILE_ASSOCIATIONS, WINDOWS_PROG_ID, windowsAssociationsNsh } from './associations.mjs';

const NSH = path.resolve(import.meta.dirname, '../../packaging/windows/associations.nsh');

/** The `!macro name` … `!macroend` lines of the include. */
function macro(text, name) {
  const lines = text.split('\n');
  const start = lines.indexOf(`!macro ${name}`);
  return lines.slice(start + 1, lines.indexOf('!macroend', start));
}

describe('file associations (ADR-008)', () => {
  it('names only document and data types, each read by its own format, never as source code or plain text', () => {
    const formats = { Markdown: 'markdown', MDX: 'mdx', Text: 'text', Log: 'log', YAML: 'yaml', TOML: 'toml', CSV: 'csv', TSV: 'tsv' };
    for (const { name, ext } of FILE_ASSOCIATIONS) {
      for (const extension of ext) {
        const format = detectFormat(`/docs/file.${extension}`);
        if (name === 'JSON') expect(['json', 'jsonl']).toContain(format);
        else expect(format).toBe(formats[name]);
      }
    }
    expect(new Set(ASSOCIATED_EXTENSIONS).size).toBe(ASSOCIATED_EXTENSIONS.length);
  });

  it('makes galeo a viewer on macOS, never the default app', () => {
    for (const type of MAC_FILE_ASSOCIATIONS) expect(type).toMatchObject({ role: 'Viewer', rank: 'Alternate' });
  });

  it('keeps packaging/windows/associations.nsh generated from the list', () => {
    expect(readFileSync(NSH, 'utf8')).toBe(windowsAssociationsNsh());
  });

  it("adds galeo to each type's Open with list on Windows without setting the type's default", () => {
    const install = macro(windowsAssociationsNsh(), 'customInstall');
    for (const ext of ASSOCIATED_EXTENSIONS) {
      expect(install).toContain(`  WriteRegNone SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "${WINDOWS_PROG_ID}"`);
      expect(install).toContain(`  WriteRegStr SHELL_CONTEXT "Software\\Classes\\Applications\\galeo.exe\\SupportedTypes" ".${ext}" ""`);
    }
    // A type's default app is the unnamed value of its own key.
    expect(install.filter((line) => /"Software\\Classes\\\.[^"\\]+" ""/.test(line))).toEqual([]);
  });

  it('opens files after -- on Windows (SR-13)', () => {
    const commands = macro(windowsAssociationsNsh(), 'customInstall').filter((line) => line.includes('\\command"'));
    expect(commands).toHaveLength(2);
    for (const line of commands) expect(line.endsWith('`"$appExe" -- "%1"`')).toBe(true);
  });

  it('removes on uninstall exactly what the install added', () => {
    const uninstall = macro(windowsAssociationsNsh(), 'customUnInstall');
    for (const ext of ASSOCIATED_EXTENSIONS) {
      expect(uninstall).toContain(`  DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "${WINDOWS_PROG_ID}"`);
    }
    const deletedKeys = uninstall.filter((line) => line.startsWith('  DeleteRegKey'));
    expect(deletedKeys).toEqual([
      `  DeleteRegKey SHELL_CONTEXT "Software\\Classes\\${WINDOWS_PROG_ID}"`,
      '  DeleteRegKey SHELL_CONTEXT "Software\\Classes\\Applications\\galeo.exe"',
    ]);
  });
});
