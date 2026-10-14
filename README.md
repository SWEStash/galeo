# galeo

A fast, private desktop app for reading and editing Markdown, text and log files: the plans, notes
and logs that coding-agent work produces. It never connects to the network.

## Quick start

On Ubuntu 24.04 or later (x86_64), download `galeo_<version>_amd64.deb` from the
[latest release](https://github.com/SWEStash/galeo/releases/latest) and install it:

```sh
sudo apt install ./galeo_*_amd64.deb
galeo README.md
```

galeo is now also in *Open With* for `.md`, `.txt` and `.log` files. An AppImage is available
too; see [installation](docs/USAGE.md#installation) for it and for checking a download.

## Features

- **Reading**: GitHub-style Markdown with code highlighting, math and Mermaid diagrams; plain text;
  logs in a source view that can follow a growing log. Files reload when they change on disk.
- **Editing**: raw-text editing with a live split preview, find and replace and several cursors.
  Saving keeps the file's encoding, line endings and permissions.
- **MDX articles**: rendered like Markdown, with components shown as labelled boxes; nothing in
  them runs.
- **Tabs, windows and profiles**: browser-like tabs and windows, sessions that come back after a
  restart, and separate profiles, for example one per project.
- **Keyboard first**: quick open (Ctrl+P), a command palette (Ctrl+Shift+P), an outline and find.
- **Private**: no network connections, documents can't run scripts, and Chromium's sandbox is on.

The [usage guide](docs/USAGE.md) covers all of it.

## Documentation

- [Usage guide](docs/USAGE.md): installation and everyday use
- [Product requirements](docs/PRD.md) and [UX specification](docs/design/ux.md)
- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/decisions/)
- [Threat model](docs/security/threat-model.md) and [dependencies](docs/dependencies.md)
- [Development](docs/development.md), [releasing](docs/RELEASING.md) and the
  [validation record](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md)

## Licence

[MIT](LICENSE)
