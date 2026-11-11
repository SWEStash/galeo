import { describe, expect, it, vi } from 'vitest';
import { onPageFailure } from './page-failure';

describe('onPageFailure', () => {
  it('logs the error and asks main once to bring the window back, however many errors follow', () => {
    const pageFailed = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = onPageFailure({ pageFailed });
    const error = new RangeError('Invalid array length');
    fail(error);
    fail(new Error('later'));
    expect(pageFailed).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('galeo: the page failed', error);
    log.mockRestore();
  });
});
