# galeo

A fast, private desktop reader for the Markdown, text and log files that coding-agent work
produces. It has Chrome-like tabs and windows, profiles, a `galeo` command-line launcher,
integration with the Files app, live reload, quick open, and **zero network access**.

> **Status: pre-release.** Version 0.1 is in its final checks; no release is published yet. You
> can build the packages yourself (see [Development](docs/development.md)).

## Install

On Ubuntu 26.04 (GNOME), install the `.deb` from a release:

```sh
sudo apt install ./galeo_*_amd64.deb   # in the folder you downloaded it to
```

It adds `galeo` (and the short `gal`) to your `PATH`, galeo to *Open With* for `.md`, `.txt` and
`.log` files, and the AppArmor profile Chromium's sandbox needs. An AppImage is also available for
other distributions; on Ubuntu 24.04 and later it can only run unsandboxed, so prefer the `.deb` there.

## Use

```sh
galeo plan.md notes.md              # open files in the last window you used
galeo --new-window plan.md          # in a new window
galeo --profile acme plan.md        # in the "acme" profile (created on first use)
```

Ctrl+P opens any file by name, Ctrl+Shift+P lists every command, and files dropped from Files open
where you drop them. Each profile keeps its own windows, session and settings. See the
[usage guide](docs/USAGE.md).

## Documentation

- [Usage guide](docs/USAGE.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/decisions/)
- [UX specification](docs/design/ux.md)
- [Threat model](docs/security/threat-model.md)
- [Dependencies](docs/dependencies.md)
- [Development](docs/development.md), [releasing](docs/RELEASING.md) and the
  [validation record](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md)

## Licence

[MIT](LICENSE)
