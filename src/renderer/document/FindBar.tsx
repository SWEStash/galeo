import { useLayoutEffect, useRef, useState } from 'react';
import type { FindResult } from './source-view';

export interface FindBarProps {
  result: FindResult;
  /** Changing it moves focus back into the field and selects it (Ctrl+F while open). */
  focusToken: number;
  onQuery: (query: string, caseSensitive: boolean) => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}

function describe({ current, total, capped }: FindResult): string {
  if (total === 0) return 'No matches';
  return `${current} of ${total}${capped ? '+' : ''}`;
}

/**
 * Find in the document (UX F9). Not a dialog: the document stays usable and the bar holds no
 * focus trap; Esc closes it and the app returns focus to the document.
 */
export function FindBar({ result, focusToken, onQuery, onStep, onClose }: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  return (
    <div className="find-bar" role="search" aria-label="Find in document">
      <input
        ref={input}
        type="search"
        aria-label="Find in document"
        placeholder="Find"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onQuery(event.target.value, caseSensitive);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-count" role="status" aria-live="polite">
        {query ? describe(result) : ''}
      </span>
      <button
        type="button"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        title="Match case"
        onClick={() => {
          setCaseSensitive(!caseSensitive);
          onQuery(query, !caseSensitive);
        }}
      >
        Aa
      </button>
      <button type="button" aria-label="Previous match" title="Previous match (Shift+Enter, Shift+F3)" onClick={() => onStep(-1)}>
        ↑
      </button>
      <button type="button" aria-label="Next match" title="Next match (Enter, F3)" onClick={() => onStep(1)}>
        ↓
      </button>
    </div>
  );
}
