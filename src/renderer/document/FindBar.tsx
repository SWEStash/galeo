import { useLayoutEffect, useRef, useState } from 'react';
import type { FindResult } from './source-view';

export interface FindBarProps {
  result: FindResult;
  /** Changing it moves focus back into the field and selects it (Ctrl+F while open). */
  focusToken: number;
  onQuery: (query: string, caseSensitive: boolean) => void;
  /** What the bar opens with (a match chosen in find in all tabs); it opens empty otherwise. */
  initial?: { query: string; caseSensitive: boolean } | undefined;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
  /** Edit mode's replace row (Ctrl+H); `replaced` is what Replace all last did, until find moves on. */
  replace?: { onReplace: (text: string) => void; onReplaceAll: (text: string) => void; replaced: number | null } | undefined;
}

function describe({ current, total, capped }: FindResult): string {
  if (total === 0) return 'No matches';
  return `${current} of ${total}${capped ? '+' : ''}`;
}

/**
 * Find in the document (UX F9). Not a dialog: the document stays usable and the bar holds no
 * focus trap; Esc closes it and the app returns focus to the document.
 */
export function FindBar({ result, focusToken, onQuery, onStep, onClose, replace, initial }: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initial?.query ?? '');
  const [caseSensitive, setCaseSensitive] = useState(initial?.caseSensitive ?? false);
  const [replacement, setReplacement] = useState('');

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
        {replace?.replaced != null ? `Replaced ${replace.replaced}` : query ? describe(result) : ''}
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
      {replace && (
        <div className="find-replace">
          <input
            type="text"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              replace.onReplace(replacement);
            }}
          />
          <button type="button" title="Replace (Enter)" onClick={() => replace.onReplace(replacement)}>
            Replace
          </button>
          <button type="button" onClick={() => replace.onReplaceAll(replacement)}>
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
