# Payload corpus

Hostile documents for the sanitizer and the no-network harness (SR-02, SR-03, SR-06, SR-07).
Written for this project from public cheat-sheet patterns (OWASP XSS filter evasion, the
DOMPurify/mXSS literature); no third-party corpus is copied.

Each `*.payloads.md` file holds cases separated by a line containing only `%%%`; every case is
rendered on its own. `*.payloads.mdx` cases are rendered as MDX, so each must be valid MDX. A case
must render with no script, handler, dangerous URL, author style, resource-loading element or
unprefixed id.
