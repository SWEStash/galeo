import { describe, expect, it } from 'vitest';
import type { StartInfo } from './contracts';
import { startInfoArg, startInfoFrom } from './start-info';

const info: StartInfo = {
  name: 'galeo',
  version: '0.4.0',
  platform: 'linux',
  sandboxed: true,
  sandboxUnavailable: null,
  appImage: false,
};

describe('start info', () => {
  it('reaches the page from the renderer command line as main wrote it', () => {
    expect(startInfoFrom(['/opt/galeo/galeo', '--type=renderer', startInfoArg(info)])).toEqual(info);
  });

  it('is null when the command line carries none', () => {
    expect(startInfoFrom(['/opt/galeo/galeo', '--type=renderer'])).toBeNull();
  });

  it('is null when it is not valid JSON', () => {
    expect(startInfoFrom(['--galeo-start-info={oops'])).toBeNull();
  });
});
