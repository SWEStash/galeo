// The part of the Trusted Types API the page uses; TypeScript's DOM lib doesn't have it.
declare global {
  interface TrustedHTML {
    toString(): string;
  }

  interface TrustedScriptURL {
    toString(): string;
  }

  interface TrustedTypePolicy {
    createHTML(input: string): TrustedHTML;
    createScriptURL(input: string): TrustedScriptURL;
  }

  interface TrustedTypePolicyFactory {
    createPolicy(
      name: string,
      rules: { createHTML?: (input: string) => string | null; createScriptURL?: (input: string) => string },
    ): TrustedTypePolicy;
  }
}

export {};
