export interface Notice {
  name: string;
  version: string;
  license: string;
  texts: string[];
}

export interface NoticeGroup {
  packages: Omit<Notice, 'texts'>[];
  texts: string[];
}

export interface InstallFiles {
  listDir(dir: string): string[];
  readText(file: string): string;
  readJson(file: string): { license?: string; licenses?: { type: string }[]; author?: string | { name?: string } };
}

export function collectNotices(lock: { packages: Record<string, { version?: string; license?: string; dev?: boolean }> }, files: InstallFiles): Notice[];
export function licenceProblems(notices: Notice[]): string[];
export function groupByText(notices: Notice[]): NoticeGroup[];
