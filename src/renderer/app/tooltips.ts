/** How long the pointer rests on a control before its tooltip shows, and how soon the next one shows after. */
const SHOW_MS = 450;
const AGAIN_MS = 300;

/**
 * galeo's own tooltips, in the chrome's style (the system's are a dark box in another font): the
 * `title` of whatever the pointer rests on, page or document alike. While the pointer is on it, the
 * element's `title` moves aside so the system's tooltip doesn't show too, and comes back after; a
 * control named only by its title keeps that name. Returns the function that stops it.
 */
export function installTooltips(root: Document = document): () => void {
  const tip = root.createElement('div');
  tip.className = 'galeo-tooltip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  root.body.append(tip);

  let owner: Element | null = null;
  let text = '';
  let timer = 0;
  let hiddenAt = 0;

  const restore = () => {
    if (owner && text && !owner.hasAttribute('title')) owner.setAttribute('title', text);
    owner = null;
  };
  const hide = () => {
    clearTimeout(timer);
    if (!tip.hidden) hiddenAt = Date.now();
    tip.hidden = true;
    restore();
  };
  const show = () => {
    if (!owner) return;
    tip.textContent = text;
    tip.hidden = false;
    // Measured at the corner, where nothing squeezes it, then placed by the control.
    tip.style.left = '0px';
    tip.style.top = '0px';
    const box = owner.getBoundingClientRect();
    const own = tip.getBoundingClientRect();
    const view = root.documentElement;
    const left = Math.min(Math.max(4, box.left + box.width / 2 - own.width / 2), view.clientWidth - own.width - 4);
    const below = box.bottom + 6;
    const top = below + own.height > view.clientHeight - 4 ? box.top - own.height - 6 : below;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };

  const onOver = (event: PointerEvent) => {
    const found = event.composedPath().find((node): node is Element => node instanceof Element && (node === owner || (node.getAttribute('title') ?? '') !== ''));
    if (!found || found === owner) return;
    hide();
    owner = found;
    text = found.getAttribute('title')!;
    found.removeAttribute('title');
    // Named only by its title: the name stays when the title steps aside.
    if (!found.hasAttribute('aria-label') && !found.textContent?.trim()) found.setAttribute('aria-label', text);
    timer = window.setTimeout(show, Date.now() - hiddenAt < AGAIN_MS ? 0 : SHOW_MS);
  };
  const onOut = (event: PointerEvent) => {
    if (!owner) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (owner.contains(next) || (owner.shadowRoot?.contains(next) ?? false))) return;
    if (event.composedPath().includes(owner)) hide();
  };

  root.addEventListener('pointerover', onOver, true);
  root.addEventListener('pointerout', onOut, true);
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) root.addEventListener(type, hide, true);
  // The window going to the background, not an element losing focus.
  root.defaultView?.addEventListener('blur', hide);
  return () => {
    hide();
    root.removeEventListener('pointerover', onOver, true);
    root.removeEventListener('pointerout', onOut, true);
    for (const type of ['pointerdown', 'keydown', 'wheel'] as const) root.removeEventListener(type, hide, true);
    root.defaultView?.removeEventListener('blur', hide);
    tip.remove();
  };
}
