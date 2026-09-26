/**
 * Coalesces restart requests: bursts within `delayMs` cause one restart, and a request that
 * arrives while a restart is running schedules exactly one more after it finishes.
 */
export function createRestarter({ restart, delayMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
    } finally {
      running = false;
      if (pending) {
        pending = false;
        request();
      }
    }
  }

  function request() {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(run, delayMs);
  }

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    pending = false;
  }

  return { request, cancel };
}
