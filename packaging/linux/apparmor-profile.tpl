abi <abi/4.0>,
include <tunables/global>

# Grants the user namespaces Chromium's sandbox needs on Ubuntu 24.04+. It names the Electron
# binary, not the `galeo` wrapper in front of it (ADR-009).
profile "${executable}" "/opt/${sanitizedProductName}/galeo-bin" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/${executable}>
}
