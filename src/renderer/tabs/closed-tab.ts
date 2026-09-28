/**
 * For requests about a tab that may close while they're in flight: main refuses a tab it no longer
 * has, and there's nothing left to show the answer in.
 */
export function ignoreClosedTab(): void {}
