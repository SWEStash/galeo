// The page's Trusted Types policies besides the Document Host's `galeo-document` (ADR-010). The CSP
// allows only these names, so nothing else can create one.

const factory = (globalThis as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;

/** The render worker's script: a file of the app itself, never another origin, data or blob. */
const workerPolicy = factory?.createPolicy('galeo-worker', {
  createScriptURL: (input: string) => {
    const url = new URL(input, location.href);
    if (url.origin !== location.origin || url.protocol === 'blob:' || url.protocol === 'data:') throw new TypeError(`not an app script: ${input}`);
    return input;
  },
});

export function workerScriptUrl(url: string): string {
  return (workerPolicy ? workerPolicy.createScriptURL(url) : url) as string;
}

/**
 * For HTML strings no policy made (Mermaid fills its `<style>` and clears containers through
 * `innerHTML`): text without a tag is let through, which is no more than `textContent` does;
 * anything with markup is refused.
 */
export function installDefaultPolicy(): void {
  factory?.createPolicy('default', { createHTML: (input: string) => (input.includes('<') ? null : input) });
}
