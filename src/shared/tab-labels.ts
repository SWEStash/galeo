const segments = (path: string) => path.split(/[\\/]/).filter(Boolean);

/**
 * Tab labels (UX F4): the file name, and for files that share a name, as many parent folders as
 * it takes to tell them apart (`acme/plan.md`, `beta/plan.md`). The same file keeps one label.
 */
export function tabLabels(paths: readonly string[]): string[] {
  const parts = paths.map(segments);
  const byName = new Map<string, Set<string>>();
  paths.forEach((path, index) => {
    const name = parts[index]!.at(-1) ?? path;
    byName.set(name, (byName.get(name) ?? new Set()).add(parts[index]!.join('/')));
  });
  const depthOf = new Map<string, number>();
  for (const [name, group] of byName) {
    const distinct = [...group].map((joined) => joined.split('/'));
    let depth = 1;
    const longest = Math.max(...distinct.map((each) => each.length));
    while (depth < longest && new Set(distinct.map((each) => each.slice(-depth).join('/'))).size < distinct.length) depth++;
    depthOf.set(name, depth);
  }
  return parts.map((each, index) => {
    const name = each.at(-1) ?? paths[index]!;
    return each.slice(-depthOf.get(name)!).join('/');
  });
}
