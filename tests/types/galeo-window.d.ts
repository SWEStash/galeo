// The renderer's `window.galeo`, for code that tests evaluate inside the page.
import type { GaleoApi } from '../../src/shared/contracts';

declare global {
  interface Window {
    readonly galeo: GaleoApi;
  }
}
