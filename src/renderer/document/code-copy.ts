import { iconElement } from '../ui/icons';

/** galeo's own controls in a rendered document: never part of what is copied as rich text. */
const OWN_CONTROLS = '.galeo-code-copy, .galeo-image-expand, .galeo-diagram-expand';

/**
 * A Copy button for each code block of a rendered document (#58), right after the block so it
 * doesn't scroll with wide code, shown on hover and keyboard focus. Front matter isn't code to copy.
 */
/** How long a Copy button shows that it copied. */
const COPIED_MS = 1500;

export function offerCodeCopy(article: ParentNode, onCopy: (text: string) => Promise<boolean>): void {
  let n = 0;
  for (const block of article.querySelectorAll<HTMLPreElement>('pre')) {
    if (block.closest('.galeo-frontmatter, .galeo-diagram')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'galeo-code-copy';
    button.setAttribute('aria-label', 'Copy code');
    button.title = 'Copy code';
    button.append(iconElement('copy'));
    // It says so itself: a check and "Copied", where the reader is looking (and in the status).
    let reset = 0;
    button.addEventListener('click', () => {
      void onCopy(block.textContent ?? '').then((copied) => {
        if (!copied) return;
        button.replaceChildren(iconElement('check'));
        button.setAttribute('aria-label', 'Copied');
        button.title = 'Copied';
        button.dataset['copied'] = 'true';
        clearTimeout(reset);
        reset = window.setTimeout(() => {
          button.replaceChildren(iconElement('copy'));
          button.setAttribute('aria-label', 'Copy code');
          button.title = 'Copy code';
          delete button.dataset['copied'];
        }, COPIED_MS);
      });
    });
    // A name of its own: with one shared name, every button would sit on the same block.
    const anchor = `--galeo-code-${++n}`;
    block.style.setProperty('anchor-name', anchor);
    button.style.setProperty('position-anchor', anchor);
    block.after(button);
  }
}

/** The rendered document as rich text: its HTML without galeo's own controls, and its plain text. */
export function richTextOf(article: HTMLElement): { html: string; text: string } {
  const copy = article.cloneNode(true) as HTMLElement;
  for (const control of copy.querySelectorAll(OWN_CONTROLS)) control.remove();
  // The anchor names the Copy buttons need are galeo's too.
  for (const block of copy.querySelectorAll<HTMLElement>('pre[style]')) {
    block.style.removeProperty('anchor-name');
    if (!block.getAttribute('style')) block.removeAttribute('style');
  }
  return { html: copy.innerHTML, text: article.innerText };
}
