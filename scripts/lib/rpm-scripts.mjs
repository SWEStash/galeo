// What galeo's .rpm scripts must do (ADR-036), checked on `rpm -qp --scripts` output by verify:package.

const GUARD = '[ "$1" -eq 0 ] || exit 0';
const KEY = '/etc/pki/rpm-gpg/RPM-GPG-KEY-galeo';
const MIME = '/usr/share/mime/packages/galeo.xml';

/** The scriptlets in `rpm -qp --scripts` output, by name (`postinstall`, `postuninstall`, …). */
function scriptlets(text) {
  const found = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const header = /^(\w+) scriptlet \(using [^)]+\):$/.exec(line);
    if (header) found.set((current = header[1]), []);
    else if (current) found.get(current).push(line);
  }
  return new Map([...found].map(([name, lines]) => [name, lines.join('\n')]));
}

/** A script's lines that do something: not the shebang, comments or blanks. */
function commands(script) {
  return script.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

/** Problems with the scripts an .rpm carries, as sentences; empty when they do what galeo's should. */
export function rpmScriptProblems(text) {
  const scripts = scriptlets(text);
  const post = scripts.get('postinstall');
  const postun = scripts.get('postuninstall');
  const problems = [];
  if (post === undefined) problems.push('no %post script');
  else {
    if (!post.includes("ln -sf '/opt/galeo/gal' '/usr/bin/gal'")) problems.push("%post doesn't link /usr/bin/gal");
    if (!post.includes(`cp -f '/opt/galeo/resources/galeo-archive-keyring.asc' '${KEY}'`)) problems.push(`%post doesn't copy the key to ${KEY}`);
    if (!post.includes(`cp -f '/opt/galeo/resources/mime.xml' '${MIME}'`)) problems.push(`%post doesn't copy the MDX type to ${MIME}`);
  }
  if (postun === undefined) problems.push('no %postun script');
  else {
    // rpm runs the old package's %postun after an upgrade installed the new one (ADR-036).
    if (commands(postun)[0] !== GUARD) problems.push(`%postun must start with ${GUARD}, so an upgrade keeps galeo`);
    if (!postun.includes("rm -f '/usr/bin/gal'")) problems.push("%postun doesn't remove /usr/bin/gal");
    if (!postun.includes(`rm -f '${MIME}'`)) problems.push(`%postun doesn't remove ${MIME}`);
    if (postun.includes(KEY)) problems.push('%postun touches the key, which stays for the .repo file that names it');
  }
  if ([...scripts.values()].some((script) => commands(script).some((line) => /apparmor/i.test(line)))) problems.push('an rpm script has AppArmor steps');
  return problems;
}
