import { describe, expect, it } from 'vitest';
import { rendererEntry } from './renderer-entry';

describe('rendererEntry', () => {
  const env = { GALEO_DEV_SERVER_URL: 'http://127.0.0.1:5173/' };

  it('uses the dev server URL in development runs', () => {
    expect(rendererEntry({ isPackaged: false, env })).toEqual({ url: 'http://127.0.0.1:5173/' });
  });

  it('ignores the dev server URL in packaged builds', () => {
    expect(rendererEntry({ isPackaged: true, env })).toEqual({ file: 'renderer/index.html' });
  });

  it('loads the built renderer when no dev server is set', () => {
    expect(rendererEntry({ isPackaged: false, env: {} })).toEqual({ file: 'renderer/index.html' });
  });
});
