import { extensionOf } from '../../shared/paths';
import type { EntryKind } from '../ports';

// Files that run or install something when "opened" (SR-05), on any system: one list, since a folder
// read on Linux may hold files from the others.
const LAUNCHERS = new Set([
  // Linux launchers and packages; Java, Python and Flatpak apps.
  '.desktop', '.appimage', '.sh', '.run', '.deb', '.rpm', '.py', '.pyz', '.jar', '.jnlp', '.flatpakref', '.flatpakrepo',
  // Windows programs, installers, scripts (Windows Script Host runs .js and .vbs), shortcuts and settings.
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.lnk', '.js', '.jse', '.vbs', '.vbe', '.wsf', '.wsh', '.hta', '.scr',
  '.reg', '.cpl', '.msc', '.pif', '.url', '.appref-ms',
  // Windows help with scripts, app and patch installers, disk images it mounts, remote connections, and
  // files that fetch from or point at a remote share (themes, shell links, search and library files).
  '.chm', '.application', '.appinstaller', '.msix', '.msixbundle', '.appx', '.appxbundle', '.msp', '.iso', '.img', '.vhd',
  '.vhdx', '.rdp', '.theme', '.themepack', '.deskthemepack', '.scf', '.library-ms', '.search-ms', '.searchconnector-ms',
  '.settingcontent-ms', '.diagcab', '.wsc', '.sct',
  // macOS apps, scripts, installers, disk images, links it follows and configuration profiles.
  '.app', '.command', '.terminal', '.pkg', '.mpkg', '.scpt', '.scptd', '.workflow', '.dmg', '.webloc', '.fileloc', '.inetloc',
  '.mobileconfig',
]);

// On macOS and Windows, no executable bit backs the list above, so only these types are handed over
// (ADR-028): documents whose usual default app shows them and runs nothing.
const DOCUMENTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.avif', '.ico',
  '.pdf',
  // Office documents that can't carry macros.
  '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp',
  '.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi',
  // What galeo reads, and its own custom.css and settings files.
  '.md', '.markdown', '.mdx', '.txt', '.log', '.json', '.yaml', '.yml', '.toml', '.csv', '.tsv', '.css',
]);

/**
 * Whether "Open with default app" may be offered for a file: a regular, non-executable file that
 * isn't a launcher type, by its name or, through symlinks, by the file it points to (`target`); on
 * macOS and Windows, both must also be a known document type. Main still requires the user to
 * choose it in its own native menu.
 */
export function canOpenWithDefaultApp(file: { path: string; target: string; kind: EntryKind; executable: boolean }, platform: string): boolean {
  if (file.kind !== 'file' || file.executable) return false;
  const types = [extensionOf(file.path), extensionOf(file.target)];
  if (types.some((type) => LAUNCHERS.has(type))) return false;
  if (platform !== 'darwin' && platform !== 'win32') return true;
  return types.every((type) => DOCUMENTS.has(type));
}
