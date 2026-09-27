import { FuseState, FuseV1Options } from '@electron/fuses';

const STATE = { [FuseState.ENABLE]: 'enabled', [FuseState.DISABLE]: 'disabled' };

/**
 * Compares a binary's fuse wire (from `getCurrentFuseWire`) with the expected table
 * (`{ RunAsNode: false, … }`) and describes every fuse that doesn't match (SR-08).
 */
export function fuseMismatches(wire, expected) {
  if (String(wire.version) !== '1') return [`unknown fuse wire version ${wire.version}`];
  return Object.entries(expected).flatMap(([name, enabled]) => {
    const want = enabled ? 'enabled' : 'disabled';
    const actual = wire[FuseV1Options[name]];
    if (actual === undefined) return [`${name} is missing, expected ${want}`];
    const have = STATE[actual] ?? `in state ${actual}`;
    return have === want ? [] : [`${name} is ${have}, expected ${want}`];
  });
}
