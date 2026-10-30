## macOS and Windows previews

The macOS (`.dmg`, `.zip`) and Windows (`-setup.exe`, `-portable.exe`) builds are previews: checked
by CI, but unsigned and unsupported. Only the Linux packages are official.

- **macOS**: drag galeo to Applications. The first start is refused because galeo is unsigned:
  open **System Settings → Privacy & Security** and choose **Open Anyway**.
- **Windows**: SmartScreen warns about an unknown publisher; choose **More info → Run anyway**.

Installing, *Open With* and the `galeo` command on each system:
[USAGE](https://github.com/SWEStash/galeo/blob/main/docs/USAGE.md#macos-and-windows-previews).
