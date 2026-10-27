import { describe, expect, it } from 'vitest';
import { asksForAttention, attentionRequest } from './attention';

describe('asksForAttention', () => {
  it('is only for files added to a window that was already open and is not the focused one', () => {
    expect(asksForAttention({ fresh: false, files: 1, focused: false })).toBe(true);
    expect(asksForAttention({ fresh: false, files: 1, focused: true })).toBe(false);
    expect(asksForAttention({ fresh: true, files: 1, focused: false })).toBe(false);
    // No files: the window is focused instead, which the desktop turns into its own notice.
    expect(asksForAttention({ fresh: false, files: 0, focused: false })).toBe(false);
  });
});

describe('attentionRequest', () => {
  const linux = { platform: 'linux' as const, ozonePlatform: '', waylandDisplay: true };

  it('asks by an activation request on Wayland, where flashing the frame reaches nothing', () => {
    expect(attentionRequest(linux)).toBe('activate');
    expect(attentionRequest({ ...linux, ozonePlatform: 'wayland' })).toBe('activate');
    expect(attentionRequest({ ...linux, ozonePlatform: 'auto' })).toBe('activate');
  });

  it('flashes the frame under X11, also when the reader picked X11 on a Wayland desktop', () => {
    expect(attentionRequest({ ...linux, waylandDisplay: false })).toBe('flash');
    expect(attentionRequest({ ...linux, ozonePlatform: 'x11' })).toBe('flash');
  });

  it('flashes the frame on macOS and Windows', () => {
    expect(attentionRequest({ ...linux, platform: 'darwin' })).toBe('flash');
    expect(attentionRequest({ ...linux, platform: 'win32' })).toBe('flash');
  });
});
