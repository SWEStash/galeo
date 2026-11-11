/**
 * React's handler for an error no boundary caught. React has unmounted the page by then, which
 * would leave a blank window, so main brings the window back as after a crash (ADR-002). Once:
 * the window is reloading, and later errors are part of the same failure.
 */
export function onPageFailure(api: { pageFailed: () => Promise<void> }): (error: unknown) => void {
  let reported = false;
  return (error) => {
    console.error('galeo: the page failed', error);
    if (reported) return;
    reported = true;
    void api.pageFailed().catch((reason: unknown) => console.error('galeo: could not report the page failure', reason));
  };
}
