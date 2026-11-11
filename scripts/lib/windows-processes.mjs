// The processes still running from given executables, on Windows: what the end-to-end helper and the
// packaged-app quit check report when galeo doesn't go away (#45, #46).
import { spawnSync } from 'node:child_process';

/** Processes started from any of `executables` (full paths, compared case-insensitively). Empty off Windows. */
export function processesOf(executables) {
  if (process.platform !== 'win32') return [];
  const script =
    'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress';
  const listed = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30_000 });
  if (listed.status !== 0) return [];
  return parseProcesses(listed.stdout, executables);
}

/** `Get-CimInstance … | ConvertTo-Json` output, kept to the processes of `executables`. */
export function parseProcesses(json, executables) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const wanted = new Set(executables.map((file) => file.toLowerCase()));
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter((each) => typeof each?.ExecutablePath === 'string' && wanted.has(each.ExecutablePath.toLowerCase()))
    .map((each) => ({ pid: each.ProcessId, parent: each.ParentProcessId, commandLine: each.CommandLine ?? '' }));
}

/** One line per process: its pid, its parent and its Chromium role (`--type=…`, or main). */
export function describeProcesses(processes) {
  return processes
    .map(({ pid, parent, commandLine }) => {
      const type = /--type=([\w-]+)/.exec(commandLine)?.[1];
      const utility = /--utility-sub-type=([\w.-]+)/.exec(commandLine)?.[1];
      return `${pid} (parent ${parent}): ${type ?? 'main'}${utility ? ` ${utility}` : ''}`;
    })
    .join('; ');
}
