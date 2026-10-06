// The third-party notices galeo ships (docs/dependencies.md, "Licence notices to ship"), built
// from package-lock.json: every package installed for runtime, with its licence and its own
// licence and notice files.

/** Licence, licence-md, LICENSE.txt, COPYING, NOTICE…: what a package ships as its terms. */
const TERMS_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** The licence first, then any further terms, then notices. */
const rank = (file) => (/^licen/i.test(file) ? 0 : /^copying/i.test(file) ? 1 : 2);

/** Packages whose package.json names no licence, checked by hand against their licence file. */
const LICENCE_FROM_FILE = { khroma: 'MIT' };

/** Permissive licences runtime dependencies may use (docs/dependencies.md, "Licence"). */
const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense']);

/**
 * Packages the owner allowed under a non-permissive licence (docs/dependencies.md, "Licence"), shipped
 * unmodified, with where their source is: EPL-2.0 asks recipients to be told.
 */
const EXCEPTIONS = { elkjs: { license: 'EPL-2.0', source: 'https://github.com/kieler/elkjs' } };

/**
 * `files` reads the install: `listDir(dir)`, `readText(path)`, `readJson(path)`, with paths as the
 * lock file writes them (`node_modules/…`).
 */
export function collectNotices(lock, files) {
  return Object.entries(lock.packages)
    .filter(([key, entry]) => key.startsWith('node_modules/') && !entry.dev)
    .map(([key, entry]) => {
      const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const manifest = files.readJson(`${key}/package.json`);
      const license = entry.license ?? manifest.license ?? manifest.licenses?.map((each) => each.type).join(' OR ') ?? LICENCE_FROM_FILE[name] ?? 'unknown';
      const terms = files.listDir(key).filter((file) => TERMS_FILE.test(file)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      const author = typeof manifest.author === 'object' ? manifest.author?.name : manifest.author;
      const texts = terms.length > 0 ? terms.map((file) => files.readText(`${key}/${file}`)) : [`Licensed under ${license}${author ? ` by ${author}` : ''}.`];
      const exception = EXCEPTIONS[name];
      if (exception?.license === license) texts.push(`The source code of ${name} ${entry.version}, unmodified, is available at ${exception.source}.`);
      return { name, version: entry.version, license, texts };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Packages whose licence isn't permissive, or is unknown: `name@version: licence`. */
export function licenceProblems(notices) {
  return notices
    .filter(({ name, license }) => EXCEPTIONS[name]?.license !== license)
    .filter(({ license }) => !license.replace(/[()]/g, '').split(' OR ').some((option) => ALLOWED.has(option.trim())))
    .map(({ name, version, license }) => `${name}@${version}: ${license}`);
}

/** The notices with identical terms merged: each text once, with the packages that ship it. */
export function groupByText(notices) {
  const groups = new Map();
  for (const { name, version, license, texts } of notices) {
    const key = texts.join('\0');
    if (!groups.has(key)) groups.set(key, { packages: [], texts });
    groups.get(key).packages.push({ name, version, license });
  }
  return [...groups.values()];
}
