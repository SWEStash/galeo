import { useRef, type RefObject } from 'react';

/** A ref holding the value of the last render, for callbacks and effects that mustn't re-run when it changes. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
