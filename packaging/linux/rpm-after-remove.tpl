#!/bin/bash
# Based on electron-builder's after-remove template (MIT).
# galeo's rpm %postun. rpm runs it with $1 = 0 when galeo is removed, and with $1 >= 1 after an upgrade
# has installed the new version, whose links and files it must not touch: so it does nothing then.
[ "$1" -eq 0 ] || exit 0

# update-alternatives --remove <name> <path>: 'path' must be the registered alternative binary,
# not the generic symlink — see https://man7.org/linux/man-pages/man1/update-alternatives.1.html
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

if [ "`readlink '/usr/bin/gal'`" = '/opt/${sanitizedProductName}/gal' ]; then
    rm -f '/usr/bin/gal'
fi

# The repository's key stays: the user's .repo file still names it, so installing galeo again works
# (as apt's remove, ADR-029). Removing /etc/yum.repos.d/galeo.repo and the key ends the setup (USAGE).

rm -f '/usr/share/mime/packages/${executable}.xml'
if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
