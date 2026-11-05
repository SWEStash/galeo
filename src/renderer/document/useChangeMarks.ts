import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextEncoding } from '../../shared/documents';
import { baselines } from './change-marks';
import { changedRanges, type ChangedRanges } from './change-ranges';

export interface ChangeMarkInput {
  tabId: string;
  path: string;
  /** The file's text as last read; null before the first read. */
  text: string | null;
  /** The tab is shown. */
  active: boolean;
  editing: boolean;
  encoding: TextEncoding | null;
}

/**
 * What changed in a tab's file since the reader last looked (ADR-030). The first look takes the
 * baseline; leaving the tab, clearing the marks and ending edit mode take a new one; while shown,
 * changes add up against it. Edit mode shows none. Ranges are null when there is nothing to mark.
 */
export function useChangeMarks({ tabId, path, text, active, editing, encoding }: ChangeMarkInput): {
  ranges: ChangedRanges | null;
  tooLarge: boolean;
  clear: () => void;
  /** The reader's own write is on its way (a task box ticked while reading): the next text is seen, unmarked. */
  acceptNext: () => void;
} {
  const [ranges, setRanges] = useState<ChangedRanges | null>(null);
  // A document over the cap that changed since the reader looked: there is no baseline to mark against.
  const [tooLarge, setTooLarge] = useState(false);
  const largeSeen = useRef<string | null>(null);
  const latest = useRef({ path, text });
  latest.current = { path, text };
  const look = (next: string | null) => {
    if (next !== null) baselines.reset(tabId, latest.current.path, next);
    largeSeen.current = next;
    setRanges(null);
    setTooLarge(false);
  };

  // Leaving the tab, or ending edit mode: what it shows now is what the reader last looked at.
  const wasActive = useRef(active);
  const wasEditing = useRef(editing);
  useEffect(() => {
    if ((wasActive.current && !active) || (wasEditing.current && !editing)) look(latest.current.text);
    wasActive.current = active;
    wasEditing.current = editing;
  }, [active, editing]);

  // Another encoding is another text: it starts again, unmarked.
  const readIn = useRef(encoding);
  useEffect(() => {
    if (readIn.current !== encoding && readIn.current !== null) look(latest.current.text);
    readIn.current = encoding;
  }, [encoding]);

  const ownWrite = useRef(false);
  useEffect(() => {
    if (text === null || editing || !active) return;
    if (ownWrite.current && text !== baselines.get(tabId, path)) {
      ownWrite.current = false;
      return look(text);
    }
    if (baselines.tooLarge(text)) {
      if (largeSeen.current !== null && largeSeen.current !== text) setTooLarge(true);
      largeSeen.current ??= text;
      return;
    }
    baselines.ensure(tabId, path, text);
    const base = baselines.get(tabId, path);
    if (base === null || base === text) return setRanges(null);
    let current = true;
    void changedRanges(base, text).then((found) => {
      if (current) setRanges(found.changed.length || found.removedAt.length ? found : null);
    });
    return () => {
      current = false;
    };
  }, [tabId, path, text, active, editing, encoding]);

  const clear = useCallback(() => look(latest.current.text), [tabId]);
  const acceptNext = useCallback(() => void (ownWrite.current = true), []);
  return { ranges, tooLarge, clear, acceptNext };
}
