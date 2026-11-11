import { describe, expect, it } from 'vitest';
import { describeProcesses, parseProcesses } from './windows-processes.mjs';

const EXE = 'C:\\a\\node_modules\\electron\\dist\\electron.exe';
const row = (pid, parent, path, commandLine) => ({ ProcessId: pid, ParentProcessId: parent, ExecutablePath: path, CommandLine: commandLine });

describe('windows processes (#45, #46)', () => {
  it("keeps only the given executables' processes, whatever the path's case", () => {
    const json = JSON.stringify([
      row(10, 1, EXE, `"${EXE}" .`),
      row(11, 10, EXE.toUpperCase(), `"${EXE}" --type=gpu-process`),
      row(12, 1, 'C:\\Windows\\explorer.exe', 'explorer'),
      row(4, 0, null, null),
    ]);
    expect(parseProcesses(json, [EXE]).map((each) => each.pid)).toEqual([10, 11]);
  });

  it('reads a single process (ConvertTo-Json writes an object, not an array) and survives bad output', () => {
    expect(parseProcesses(JSON.stringify(row(10, 1, EXE, '')), [EXE])).toEqual([{ pid: 10, parent: 1, commandLine: '' }]);
    expect(parseProcesses('not json', [EXE])).toEqual([]);
  });

  it("names each process's Chromium role", () => {
    const processes = [
      { pid: 10, parent: 1, commandLine: `"${EXE}" . --inspect=0` },
      { pid: 11, parent: 10, commandLine: '--type=crashpad-handler --database=x' },
      { pid: 12, parent: 10, commandLine: '--type=utility --utility-sub-type=network.mojom.NetworkService --lang=en' },
    ];
    expect(describeProcesses(processes)).toBe('10 (parent 1): main; 11 (parent 10): crashpad-handler; 12 (parent 10): utility network.mojom.NetworkService');
  });
});
