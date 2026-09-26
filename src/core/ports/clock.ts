import type { Unsubscribe } from './common';

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): Unsubscribe;
}
