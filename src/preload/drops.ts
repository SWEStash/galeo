/** The part of a drag event the listener reads. */
export interface DropEventLike {
  isTrusted: boolean;
  dataTransfer: { types: readonly string[]; files: FileList } | null;
  preventDefault(): void;
}

/**
 * Drop grants (SR-12, ADR-004), made here in the preload's isolated world: only a drop the user
 * really made (`isTrusted`) is registered, with paths taken from its `File` objects. Page script
 * can dispatch a drop event of its own, but not a trusted one, and it never sees the paths.
 */
export function listenForDrops(
  target: { addEventListener(type: 'dragover' | 'drop', listener: (event: DropEventLike) => void, capture: boolean): void },
  deps: { pathFor: (file: File) => string; register: (paths: string[]) => void },
): void {
  const carriesFiles = (event: DropEventLike) => event.dataTransfer?.types.includes('Files') ?? false;
  // Files may be dropped anywhere in the window; nothing navigates to them.
  target.addEventListener(
    'dragover',
    (event) => {
      if (carriesFiles(event)) event.preventDefault();
    },
    true,
  );
  target.addEventListener(
    'drop',
    (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (!event.isTrusted) return;
      const paths = [...event.dataTransfer!.files].map((file) => deps.pathFor(file)).filter((each) => each !== '');
      if (paths.length > 0) deps.register(paths);
    },
    true,
  );
}
