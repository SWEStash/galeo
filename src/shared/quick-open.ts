/** One line of quick open: a file main offered (opened by `id`), or a folder to type into. */
export interface QuickOpenEntry {
  id: string;
  /** The file name, or the path from the searched folder. */
  name: string;
  /** The folder it's in, as `~/…` under the home folder; '' when `name` says it. */
  detail: string;
  /** The path as shown (`~/…` or absolute) that Tab types into the field; a folder's ends in a separator. */
  fill: string;
  /** A folder of a typed path: choosing it types `fill` into the field instead of opening. */
  folder?: true;
}

export interface QuickOpenSection {
  kind: 'tabs' | 'recent' | 'repo' | 'path';
  title: string;
  entries: QuickOpenEntry[];
  /** Repository results still coming in. */
  walking?: boolean;
  /** The search stopped at a limit (files, depth or time): there may be more. */
  truncated?: boolean;
}

export interface QuickOpenResults {
  token: string;
  query: string;
  sections: QuickOpenSection[];
}

/** What quick open searches, as its section names it; null when only tabs and recent files are listed. */
export interface QuickOpenStart {
  token: string;
  scope: string | null;
}
