import { useRef, useState, type ReactNode } from 'react';
import { useDrop } from 'react-aria-components';
import { fromGaleo } from './drag-types';

/**
 * The document area as a drop target for files from the file manager: an overlay says how many
 * will open, and they open after the shown tab (UX F3).
 */
export function DropArea({ onDrop, children }: { onDrop: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const { dropProps, isDropTarget } = useDrop({
    ref,
    // A tab or a card being dragged isn't a file drop.
    getDropOperation: (types) => (fromGaleo(types) ? 'cancel' : 'copy'),
    onDrop: () => onDrop(),
  });
  return (
    <div
      ref={ref}
      className="drop-area"
      {...dropProps}
      onDragEnter={(event) => {
        dropProps.onDragEnter?.(event);
        setCount(event.dataTransfer.items.length);
      }}
    >
      {children}
      {isDropTarget && (
        <div className="drop-overlay" data-testid="drop-overlay" aria-hidden="true">
          {count === 1 ? 'Open 1 file here' : `Open ${count} files here`}
        </div>
      )}
    </div>
  );
}
