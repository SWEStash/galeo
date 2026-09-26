import type { GaleoApi } from '../shared/contracts';

declare global {
  interface Window {
    readonly galeo: GaleoApi;
  }
}
