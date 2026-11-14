<div align="center">
  <img src="packaging/icons/galeo.svg" alt="" width="200">
  <h1>galeo</h1>
  <p>A fast, private desktop viewer and editor.</p>
  <p><a href="https://swestash.github.io/galeo/">Website</a> · <a href="https://github.com/SWEStash/galeo/releases/latest">Download</a> · <a href="docs/USAGE.md">Usage guide</a></p>

[![CI](https://github.com/SWEStash/galeo/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SWEStash/galeo/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SWEStash/galeo)](https://github.com/SWEStash/galeo/releases/latest)
[![Licence: MIT](https://img.shields.io/github/license/SWEStash/galeo)](LICENSE)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-lightgrey)
![Preview: macOS, Windows](https://img.shields.io/badge/preview-macOS%20%7C%20Windows-lightgrey)

</div>

Read and edit Markdown, text, logs, JSON, CSV, YAML and a few other formats: the plans, notes
and data that coding-agent work produces. galeo **never connects to the network**.

## Quick start

On Ubuntu 24.04 or later (x86_64 or arm64), add galeo's apt repository and install it; `apt upgrade` then
brings each release:

```sh
sudo curl -fsSLo /usr/share/keyrings/galeo-archive-keyring.asc https://swestash.github.io/galeo/apt/galeo.asc
sudo tee /etc/apt/sources.list.d/galeo.sources > /dev/null <<'EOF'
Types: deb
URIs: https://swestash.github.io/galeo/apt/
Suites: stable
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/galeo-archive-keyring.asc
EOF
sudo apt update && sudo apt install galeo
galeo README.md
```

On arm64, write `Architectures: arm64`. galeo is now also in *Open With* for Markdown, MDX, text, log,
JSON, YAML, TOML, CSV and TSV files and source code.

**Other ways to install** (Fedora's dnf repository, a package file, the AppImage, building from source,
the macOS and Windows previews): [install](https://swestash.github.io/galeo/#install) on the website, a tab per method. The
[usage guide](docs/USAGE.md#installation) says what each install does, how to remove it, and how to
check a download.

## Features

- **Reading**: GitHub-style Markdown with code, math, Mermaid diagrams and callouts, front matter
  as a list of fields, and logs that can follow a growing file. Files reload when they change on
  disk.
- **Following an agent's work**: what changed since you last looked is marked (F7 steps through
  it), tabs whose file changed show a dot, plans count their tasks done and tick from the page,
  and links to files that don't exist are marked.
- **Editing**: raw text with a live split preview. Saving keeps the file's encoding, line endings
  and permissions.
- **Data and code**: JSON as a tree, CSV and TSV as a table, YAML, TOML and source code
  highlighted, MDX rendered with nothing in it running.
- **Tabs, windows and profiles**: browser-like tabs, on top or on the left, that pin and move between
  windows; sessions that come back after a restart; a profile per project, with its own launcher on
  Linux.
- **Sharing what you read**: copy a code block or the whole document as rich text, save a diagram as
  SVG or PNG, export a document to PDF.
- **Keyboard first, mouse too**: quick open (Ctrl+P), a command palette (Ctrl+Shift+P), search tabs
  (Ctrl+Shift+A), a tab overview (Ctrl+Shift+E) and find in all tabs (Ctrl+Shift+F), each also a
  button or a right-click menu entry.
- **Private**: no network connections, documents can't run scripts, and Chromium's sandbox is on.

The [usage guide](docs/USAGE.md) covers all of it.

## Documentation

- [Usage guide](docs/USAGE.md): installation and everyday use
- [Product requirements](docs/PRD.md) and [UX specification](docs/design/ux.md)
- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/decisions/)
- [Threat model](docs/security/threat-model.md) and [dependencies](docs/dependencies.md)
- [Development](docs/development.md), [releasing](docs/RELEASING.md) and the
  [validation record](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md) and the [guide for coding agents](AGENTS.md)

## Licence

[MIT](LICENSE)
