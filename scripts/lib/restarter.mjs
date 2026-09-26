/**
 * Coalesces restart requests: requests within `delayMs` of each other cause one restart, and
 * requests that arrive while a restart is running cause exactly one more after it finishes.
 */
export function createRestarter({ restart, delayMs, onError = console.error }) {
  let timer = null;
  let running = false;
  let pending = false;

  async function run() {
    timer = null;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await restart();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        request();
      }
    }
  }

  function request() {
    clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }

  function cancel() {
    clearTimeout(timer);
    timer = null;
    pending = false;
  }

  return { request, cancel };
}
