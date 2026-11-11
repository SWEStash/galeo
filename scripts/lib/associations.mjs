// The file types the macOS and Windows packages offer galeo for in "Open With" (ADR-008). galeo is
// only ever a choice there, never the default: macOS ranks it Alternate, and the Windows installer
// adds it to each type's "Open with" list without touching the type's default app.

/**
 * Documents and data: Markdown, MDX, text and logs; JSON, YAML, TOML, CSV and TSV. Source code is
 * left out, so "Open With" doesn't offer galeo for every file a developer has. Extensions without
 * the dot, matching `src/core/formats/registry.ts`.
 */
export const FILE_ASSOCIATIONS = [
  { name: 'Markdown', ext: ['md', 'markdown'] },
  { name: 'MDX', ext: ['mdx'] },
  { name: 'Text', ext: ['txt'] },
  { name: 'Log', ext: ['log'] },
  { name: 'JSON', ext: ['json', 'jsonl', 'ndjson'] },
  { name: 'YAML', ext: ['yaml', 'yml'] },
  { name: 'TOML', ext: ['toml'] },
  { name: 'CSV', ext: ['csv', 'psv'] },
  { name: 'TSV', ext: ['tsv'] },
];

/** Every associated extension, in list order. */
export const ASSOCIATED_EXTENSIONS = FILE_ASSOCIATIONS.flatMap((type) => type.ext);

/** macOS `CFBundleDocumentTypes`: galeo views these files and is never their default app. */
export const MAC_FILE_ASSOCIATIONS = FILE_ASSOCIATIONS.map(({ name, ext }) => ({ name, ext, role: 'Viewer', rank: 'Alternate' }));

/** The program id the Windows installer registers; one for every type, since galeo is never the default. */
export const WINDOWS_PROG_ID = 'galeo.document';

/**
 * The NSIS include behind `packaging/windows/associations.nsh` (a test keeps the two equal). Per
 * user, as the installer is (`SHELL_CONTEXT`). Files follow `--`, so no name can pass as a switch (SR-13).
 */
/**
 * The second line of the `galeo.cmd` that Settings → Install command-line launcher writes
 * (`appCommand` in src/core/desktop/launcher.ts; a unit test keeps them equal).
 */
export const WINDOWS_COMMAND_MARK = 'rem Installed by galeo: the command-line launcher for its app.';

/** Uninstall lines that delete the user's `galeo` command while it is galeo's, except during an update (#47). */
function removeCommand() {
  const file = '$LOCALAPPDATA\\Microsoft\\WindowsApps\\galeo.cmd';
  return [
    '  ; The `galeo` command, only while its second line is galeo\'s mark; an update keeps it.',
    '  ${IfNot} ${isUpdated}',
    '    Push $0',
    '    Push $1',
    '    ClearErrors',
    `    FileOpen $0 "${file}" r`,
    '    ${IfNot} ${Errors}',
    '      FileRead $0 $1',
    '      FileRead $0 $1',
    '      FileClose $0',
    `      \${If} $1 S== "${WINDOWS_COMMAND_MARK}$\\r$\\n"`,
    `        Delete "${file}"`,
    '      ${EndIf}',
    '    ${EndIf}',
    '    Pop $1',
    '    Pop $0',
    '  ${EndIf}',
  ];
}

export function windowsAssociationsNsh() {
  const classes = 'Software\\Classes';
  const app = `${classes}\\Applications\\galeo.exe`;
  const command = '`"$appExe" -- "%1"`';
  const notify = '  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"';
  return [
    '; Generated from scripts/lib/associations.mjs by windowsAssociationsNsh(); a unit test keeps them equal.',
    '; Adds galeo to the "Open with" list of the types it reads. Never sets a type\'s default app.',
    '; The uninstall also removes the `galeo` command Settings installed, while it is galeo\'s.',
    '',
    '!macro customInstall',
    `  WriteRegStr SHELL_CONTEXT "${classes}\\${WINDOWS_PROG_ID}" "" "galeo document"`,
    `  WriteRegStr SHELL_CONTEXT "${classes}\\${WINDOWS_PROG_ID}\\DefaultIcon" "" "$appExe,0"`,
    `  WriteRegStr SHELL_CONTEXT "${classes}\\${WINDOWS_PROG_ID}\\shell\\open\\command" "" ${command}`,
    `  WriteRegStr SHELL_CONTEXT "${app}" "FriendlyAppName" "galeo"`,
    `  WriteRegStr SHELL_CONTEXT "${app}\\shell\\open\\command" "" ${command}`,
    ...ASSOCIATED_EXTENSIONS.flatMap((ext) => [
      `  WriteRegNone SHELL_CONTEXT "${classes}\\.${ext}\\OpenWithProgids" "${WINDOWS_PROG_ID}"`,
      `  WriteRegStr SHELL_CONTEXT "${app}\\SupportedTypes" ".${ext}" ""`,
    ]),
    notify,
    '!macroend',
    '',
    '!macro customUnInstall',
    ...ASSOCIATED_EXTENSIONS.map((ext) => `  DeleteRegValue SHELL_CONTEXT "${classes}\\.${ext}\\OpenWithProgids" "${WINDOWS_PROG_ID}"`),
    `  DeleteRegKey SHELL_CONTEXT "${classes}\\${WINDOWS_PROG_ID}"`,
    `  DeleteRegKey SHELL_CONTEXT "${app}"`,
    notify,
    ...removeCommand(),
    '!macroend',
    '',
  ].join('\n');
}

/** What is wrong with a macOS app's document types (its Info.plist as JSON), as sentences; empty when nothing is. */
export function macDocumentTypeProblems(plist) {
  const problems = [];
  const types = Array.isArray(plist?.CFBundleDocumentTypes) ? plist.CFBundleDocumentTypes : [];
  for (const ext of ASSOCIATED_EXTENSIONS) {
    const type = types.find((entry) => entry.CFBundleTypeExtensions?.includes(ext));
    if (!type) problems.push(`no document type for .${ext}`);
    else if (type.CFBundleTypeRole !== 'Viewer' || type.LSHandlerRank !== 'Alternate') {
      problems.push(`.${ext} is ${type.CFBundleTypeRole}/${type.LSHandlerRank}, expected Viewer/Alternate`);
    }
  }
  return problems;
}

/**
 * A value's data from `reg query` output, or null when the value isn't listed. The key's unnamed
 * (default) value is `(Default)` in English Windows, as on the CI runners.
 */
export function regValue(output, name) {
  for (const line of output.split(/\r?\n/)) {
    const match = /^ {4}(.+?) {4}REG_[A-Z_]+(?: {4}(.*))?$/.exec(line.trimEnd());
    if (match && match[1] === name) return match[2] ?? '';
  }
  return null;
}
