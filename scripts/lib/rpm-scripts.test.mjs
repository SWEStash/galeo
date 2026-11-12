import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rpmScriptProblems } from './rpm-scripts.mjs';

// `rpm -qp --scripts` output for galeo's own templates, filled in as electron-builder does.
const fill = (name) =>
  readFileSync(path.resolve(import.meta.dirname, `../../packaging/linux/${name}`), 'utf8')
    .replaceAll('${executable}', 'galeo')
    .replaceAll('${sanitizedProductName}', 'galeo');
const scripts = (post, postun) => `postinstall scriptlet (using /bin/sh):\n${post}\npostuninstall scriptlet (using /bin/sh):\n${postun}\n`;
const GOOD = scripts(fill('rpm-after-install.tpl'), fill('rpm-after-remove.tpl'));

describe('rpmScriptProblems (ADR-036)', () => {
  it("accepts galeo's own rpm scripts", () => {
    expect(rpmScriptProblems(GOOD)).toEqual([]);
  });

  it('wants removal only on erase, so an upgrade keeps galeo', () => {
    expect(rpmScriptProblems(GOOD.replace('[ "$1" -eq 0 ] || exit 0', ''))).toEqual(['%postun must start with [ "$1" -eq 0 ] || exit 0, so an upgrade keeps galeo']);
  });

  it("rejects electron-builder's default scripts", () => {
    const defaults = scripts("#!/bin/bash\nln -sf '/opt/galeo/galeo' '/usr/bin/galeo'\napparmor_status --enabled\n", "#!/bin/bash\nupdate-alternatives --remove 'galeo' '/opt/galeo/galeo'\n");
    expect(rpmScriptProblems(defaults)).toEqual([
      "%post doesn't link /usr/bin/gal",
      "%post doesn't copy the key to /etc/pki/rpm-gpg/RPM-GPG-KEY-galeo",
      "%post doesn't copy the MDX type to /usr/share/mime/packages/galeo.xml",
      '%postun must start with [ "$1" -eq 0 ] || exit 0, so an upgrade keeps galeo',
      "%postun doesn't remove /usr/bin/gal",
      "%postun doesn't remove /usr/share/mime/packages/galeo.xml",
      'an rpm script has AppArmor steps',
    ]);
  });

  it('keeps the key on erase', () => {
    const removesKey = GOOD.replace("rm -f '/usr/share/mime/packages/galeo.xml'", "rm -f '/usr/share/mime/packages/galeo.xml'\nrm -f '/etc/pki/rpm-gpg/RPM-GPG-KEY-galeo'");
    expect(rpmScriptProblems(removesKey)).toEqual(['%postun touches the key, which stays for the .repo file that names it']);
  });

  it('wants both scripts', () => {
    expect(rpmScriptProblems('')).toEqual(['no %post script', 'no %postun script']);
  });
});
