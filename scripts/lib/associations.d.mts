/** A file type the macOS and Windows packages offer galeo for in "Open With"; extensions without the dot. */
export interface FileAssociation {
  name: string;
  ext: string[];
}

/** Documents and data: Markdown, MDX, text, logs, JSON, YAML, TOML, CSV and TSV. */
export const FILE_ASSOCIATIONS: FileAssociation[];

/** Every associated extension, in list order. */
export const ASSOCIATED_EXTENSIONS: string[];

/** macOS `CFBundleDocumentTypes`: galeo views these files and is never their default app. */
export const MAC_FILE_ASSOCIATIONS: (FileAssociation & { role: 'Viewer'; rank: 'Alternate' })[];

/** The program id the Windows installer registers. */
export const WINDOWS_PROG_ID: string;

/** The NSIS include behind `packaging/windows/associations.nsh`. */
export function windowsAssociationsNsh(): string;
