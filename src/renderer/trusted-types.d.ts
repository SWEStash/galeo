// The part of the Trusted Types API the Document Host uses; TypeScript's DOM lib doesn't have it.
declare global {
  interface TrustedHTML {
    toString(): string;
  }

  interface TrustedTypePolicy {
    createHTML(input: string): TrustedHTML;
  }

  interface TrustedTypePolicyFactory {
    createPolicy(name: string, rules: { createHTML?: (input: string) => string }): TrustedTypePolicy;
  }
}

export {};
