import { afterEach, describe, expect, it, vi } from 'vitest';

type Rules = { createHTML?: (input: string) => string | null; createScriptURL?: (input: string) => string };

/** Loads the module with a recording Trusted Types factory; returns each policy's rules by name. */
async function load() {
  const policies = new Map<string, Rules>();
  vi.stubGlobal('trustedTypes', {
    createPolicy: (name: string, rules: Rules) => {
      policies.set(name, rules);
      return { createScriptURL: (input: string) => ({ url: rules.createScriptURL!(input) }) };
    },
  });
  vi.resetModules();
  const module = await import('./trusted-types');
  return { module, policies };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Trusted Types policies', () => {
  it('lets the default policy pass text with no markup, as for a style element, and refuses any tag', async () => {
    const { module, policies } = await load();
    module.installDefaultPolicy();
    const createHTML = policies.get('default')!.createHTML!;
    expect(createHTML('')).toBe('');
    expect(createHTML('#d1 .node rect{fill:#ECECFF;} a > b {}')).toBe('#d1 .node rect{fill:#ECECFF;} a > b {}');
    expect(createHTML('<img src=x onerror=alert(1)>')).toBeNull();
    expect(createHTML('text then <svg>')).toBeNull();
    expect(policies.get('default')!.createScriptURL).toBeUndefined();
  });

  it("gives the render worker a script URL only for the app's own files", async () => {
    const { module, policies } = await load();
    expect(module.workerScriptUrl('./assets/render.worker-abc.js')).toEqual({ url: './assets/render.worker-abc.js' });
    const createScriptURL = policies.get('galeo-worker')!.createScriptURL!;
    expect(() => createScriptURL('https://example.com/evil.js')).toThrow();
    expect(() => createScriptURL('data:text/javascript,alert(1)')).toThrow();
    expect(() => createScriptURL('blob:x')).toThrow();
  });

  it('hands strings through where the platform has no Trusted Types', async () => {
    vi.stubGlobal('trustedTypes', undefined);
    vi.resetModules();
    const module = await import('./trusted-types');
    expect(() => module.installDefaultPolicy()).not.toThrow();
    expect(module.workerScriptUrl('./assets/w.js')).toBe('./assets/w.js');
  });
});
