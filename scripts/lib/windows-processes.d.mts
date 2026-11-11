export interface ProcessInfo {
  pid: number;
  parent: number;
  commandLine: string;
}

/** Processes started from any of `executables` (full paths, compared case-insensitively). Empty off Windows. */
export function processesOf(executables: string[]): ProcessInfo[];

/** `Get-CimInstance … | ConvertTo-Json` output, kept to the processes of `executables`. */
export function parseProcesses(json: string, executables: string[]): ProcessInfo[];

/** One line per process: its pid, its parent and its Chromium role (`--type=…`, or main). */
export function describeProcesses(processes: ProcessInfo[]): string;
