import { useCallback, useState, type RefObject } from 'react';
import { NO_MATCHES, type FindResult } from '../../shared/find';
import type { DocumentHandle } from './DocumentView';
import type { FindRequest } from './requests';

/** The find bar: open, replacing, focused anew per `token`; `line` is where a match chosen in find in all tabs is, until the reader types or steps. */
interface FindState {
  open: boolean;
  replace: boolean;
  token: number;
  query: string;
  caseSensitive: boolean;
  line?: number | undefined;
}

/** Find in the shown document: the bar's state, the matches, and what Replace all last did. */
export function useFind(handle: RefObject<DocumentHandle | null>) {
  const [find, setFind] = useState<FindState>({ open: false, replace: false, token: 0, query: '', caseSensitive: false });
  // The match chosen in find in all tabs, which the find bar opens with.
  const [findSeed, setFindSeed] = useState<FindRequest | null>(null);
  const [findResult, setFindResult] = useState<FindResult>(NO_MATCHES);
  // What Replace all last did, shown until find moves on.
  const [replaced, setReplaced] = useState<number | null>(null);
  const openFind = useCallback(({ replace }: { replace?: true } = {}) => {
    setFind((current) => ({ ...current, open: true, token: current.token + 1, ...(replace ? { replace } : {}) }));
  }, []);
  /** Opens on a match chosen in find in all tabs (ADR-024), its query in the bar. */
  const openFindOn = useCallback((request: FindRequest) => {
    setReplaced(null);
    setFind((current) => ({ ...current, open: true, token: current.token + 1, query: request.query, caseSensitive: request.caseSensitive, line: request.line }));
    setFindSeed(request);
  }, []);
  /** Replace is edit mode's: leaving edit mode closes its row and leaves find open. */
  const endReplace = useCallback(() => setFind((current) => (current.replace ? { ...current, replace: false } : current)), []);
  const runFind = useCallback(
    (query: string, caseSensitive: boolean, line?: number) => {
      setFind((current) => ({ ...current, query, caseSensitive, line }));
      setReplaced(null);
      setFindResult(handle.current?.find(query, { caseSensitive, line }) ?? NO_MATCHES);
    },
    [handle],
  );
  const stepFind = useCallback(
    (direction: 1 | -1) => {
      setReplaced(null);
      setFind((current) => (current.line === undefined ? current : { ...current, line: undefined }));
      if (handle.current) setFindResult(handle.current.step(direction));
    },
    [handle],
  );
  const replaceMatch = useCallback(
    (text: string) => {
      setReplaced(null);
      if (handle.current) setFindResult(handle.current.replace(text));
    },
    [handle],
  );
  const replaceAll = useCallback(
    (text: string) => {
      if (handle.current) setReplaced(handle.current.replaceAll(text));
    },
    [handle],
  );
  const closeFind = useCallback(() => {
    handle.current?.clear();
    setReplaced(null);
    setFind((current) => ({ ...current, open: false, replace: false, query: '', line: undefined }));
    setFindSeed(null);
    // Esc keeps the scroll position at the current match; focus goes back to the document.
    handle.current?.focus();
  }, [handle]);
  return { find, findSeed, findResult, setFindResult, replaced, openFind, openFindOn, endReplace, runFind, stepFind, replaceMatch, replaceAll, closeFind };
}
