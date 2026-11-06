/**
 * Passes a build's "done" on only once every build named in `names` has finished at least once:
 * each build empties its output folder when it starts, so the app can't start on a half-built tree.
 * After that, every finished build passes through.
 */
export function createBuildGate(names, onBuilt) {
  const waiting = new Set(names);
  return (name) => {
    waiting.delete(name);
    if (waiting.size === 0) onBuilt(name);
  };
}
