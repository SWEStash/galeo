#!/bin/bash
# Based on electron-builder's after-install template (MIT), as galeo's .deb after-install is, without
# AppArmor: Fedora runs Chromium's sandbox without a profile (ADR-036). rpm runs it on install ($1 = 1)
# and on upgrade ($1 = 2).

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

# The command-line launcher (SR-13: files after `--`, as absolute paths). Never replace a `gal`
# that belongs to something else.
if [ ! -e '/usr/bin/gal' ] || [ "`readlink '/usr/bin/gal'`" = '/opt/${sanitizedProductName}/gal' ]; then
    ln -sf '/opt/${sanitizedProductName}/gal' '/usr/bin/gal'
fi

# The repository's key, where the dnf .repo file names it (ADR-036). It replaces a copy the user
# downloaded to set the repository up. dnf imports it again when a package is signed by a subkey rpm
# doesn't know yet, which brings a new subkey and any revocation; until then a revocation needs
# `sudo rpmkeys --import` of this file (RELEASING).
mkdir -p /etc/pki/rpm-gpg
cp -f '/opt/${sanitizedProductName}/resources/galeo-archive-keyring.asc' '/etc/pki/rpm-gpg/RPM-GPG-KEY-galeo' || true
chmod 644 '/etc/pki/rpm-gpg/RPM-GPG-KEY-galeo' || true

# The MDX type (shared-mime-info gives *.mdx to a game ROM).
mkdir -p /usr/share/mime/packages
cp -f '/opt/${sanitizedProductName}/resources/mime.xml' '/usr/share/mime/packages/${executable}.xml' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
