// The JSON tree view (ADR-018, UX F14): an ARIA tree that draws only the rows in view, so a tree
// of 200,000 nodes opens and scrolls like a small one. Plain DOM inside the document's shadow root,
// like the rest of the document (ADR-006). Keys follow the ARIA tree pattern; one row is in the tab
// order and the focused row is always drawn, wherever the view scrolls.
import type { TreeModel } from './json-tree-model';

/** Every row is this tall (px), so a row's place is its index times this. */
export const ROW_HEIGHT = 24;

/** Rows drawn beyond each edge of the view, so a scroll shows no gap before the next frame. */
const OVERSCAN = 10;

export interface JsonTreeView {
  readonly element: HTMLElement;
  /** Shows a document; a new version of the one shown keeps what was expanded, focused and on top, by path. */
  setModel(model: TreeModel): void;
  expandAll(): void;
  collapseAll(): void;
  focus(): void;
  focusedNode(): number;
  /** The node at the top of the view, and its source line. */
  topNode(): number;
  topLine(): number;
  /** Puts the node on (or above) `line` at the top of the view, opening what hides it. */
  scrollToLine(line: number): void;
  /** Draws now (scrolling draws on the next frame). */
  flush(): void;
  dispose(): void;
}

/** The index of `node` in the visible rows (which rise by node), or -1. */
function indexOf(rows: Uint32Array, node: number): number {
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const at = rows[middle]!;
    if (at === node) return middle;
    if (at < node) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

export function createJsonTreeView({ parent, scroller, label }: { parent: HTMLElement; scroller: () => HTMLElement; label: string }): JsonTreeView {
  const element = document.createElement('div');
  element.className = 'galeo-json-tree';
  element.setAttribute('role', 'tree');
  element.setAttribute('aria-label', label);
  parent.append(element);
  let model: TreeModel | null = null;
  let focused = 0;
  // The rows drawn, by node; rebuilt for a new model.
  let drawn = new Map<number, HTMLElement>();
  let frame = 0;

  /** Where the tree starts in its scroller's content. */
  const treeTop = () => {
    const pane = scroller();
    return element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  };
  const firstInView = () => Math.max(0, Math.floor((scroller().scrollTop - treeTop()) / ROW_HEIGHT));

  function row(node: number): HTMLElement {
    const existing = drawn.get(node);
    if (existing) return existing;
    const tree = model!;
    const item = document.createElement('div');
    item.className = 'galeo-json-row';
    item.setAttribute('role', 'treeitem');
    item.dataset['node'] = String(node);
    item.dataset['srcLine'] = String(tree.lineOf(node));
    item.setAttribute('aria-level', String(tree.depth(node) + 1));
    item.setAttribute('aria-posinset', String(tree.positionInSet(node)));
    item.setAttribute('aria-setsize', String(tree.setSize(node)));
    item.style.setProperty('--galeo-json-depth', String(tree.depth(node)));
    const toggle = document.createElement('span');
    toggle.className = 'galeo-json-toggle';
    toggle.setAttribute('aria-hidden', 'true');
    item.append(toggle, tree.label(node));
    drawn.set(node, item);
    return item;
  }

  function draw() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!model) return;
    const rows = model.rows();
    element.style.height = `${rows.length * ROW_HEIGHT}px`;
    const first = Math.max(0, firstInView() - OVERSCAN);
    const last = Math.min(rows.length, Math.ceil((scroller().scrollTop - treeTop() + scroller().clientHeight) / ROW_HEIGHT) + OVERSCAN);
    const focusIndex = indexOf(rows, focused);
    const wanted: number[] = [];
    if (focusIndex !== -1 && focusIndex < first) wanted.push(focusIndex);
    for (let index = first; index < last; index++) wanted.push(index);
    if (focusIndex >= last) wanted.push(focusIndex);
    const keep = new Set(wanted.map((index) => rows[index]!));
    for (const [node, item] of drawn) {
      if (keep.has(node)) continue;
      item.remove();
      drawn.delete(node);
    }
    // Rows already drawn keep their order (the rows rise by node), so only new ones are inserted:
    // the focused row is never moved, and keeps focus.
    let cursor = element.firstElementChild;
    for (const index of wanted) {
      const node = rows[index]!;
      const item = row(node);
      item.style.top = `${index * ROW_HEIGHT}px`;
      item.tabIndex = node === focused ? 0 : -1;
      const open = model.expandable(node) ? model.isExpanded(node) : null;
      if (open === null) item.removeAttribute('aria-expanded');
      else item.setAttribute('aria-expanded', String(open));
      item.firstElementChild!.textContent = open === null ? '' : open ? '▾' : '▸';
      if (item === cursor) cursor = cursor.nextElementSibling;
      else element.insertBefore(item, cursor);
    }
  }

  const schedule = () => {
    frame ||= requestAnimationFrame(draw);
  };

  /** Moves focus to `node`, scrolling just enough to show its row. */
  function focusNode(node: number) {
    const tree = model!;
    focused = node;
    const index = indexOf(tree.rows(), node);
    const pane = scroller();
    const top = treeTop() + index * ROW_HEIGHT;
    if (top < pane.scrollTop) pane.scrollTop = top;
    else if (top + ROW_HEIGHT > pane.scrollTop + pane.clientHeight) pane.scrollTop = top + ROW_HEIGHT - pane.clientHeight;
    draw();
    drawn.get(node)?.focus({ preventScroll: true });
  }

  /** After nodes closed: focus goes to the nearest node still shown. */
  function keepFocusShown() {
    const tree = model!;
    while (focused > 0 && indexOf(tree.rows(), focused) === -1) focused = tree.parent(focused);
  }

  function toggle(node: number) {
    model!.toggle(node);
    keepFocusShown();
    draw();
  }

  element.addEventListener('keydown', (event) => {
    if (!model || event.ctrlKey || event.altKey || event.metaKey) return;
    const tree = model;
    const rows = tree.rows();
    const index = indexOf(rows, focused);
    const page = Math.max(1, Math.floor(scroller().clientHeight / ROW_HEIGHT) - 1);
    const to = (next: number) => focusNode(rows[Math.min(rows.length - 1, Math.max(0, next))]!);
    switch (event.key) {
      case 'ArrowDown':
        to(index + 1);
        break;
      case 'ArrowUp':
        to(index - 1);
        break;
      case 'PageDown':
        to(index + page);
        break;
      case 'PageUp':
        to(index - page);
        break;
      case 'Home':
        to(0);
        break;
      case 'End':
        to(rows.length - 1);
        break;
      case 'ArrowRight':
        if (!tree.expandable(focused)) break;
        if (tree.isExpanded(focused)) focusNode(focused + 1);
        else toggle(focused);
        break;
      case 'ArrowLeft':
        if (tree.expandable(focused) && tree.isExpanded(focused)) toggle(focused);
        else if (tree.parent(focused) !== -1) focusNode(tree.parent(focused));
        break;
      case 'Enter':
      case ' ':
        toggle(focused);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // A click focuses its row; its arrow, or a double-click, opens or closes it.
  const pointed = (event: Event, opens: (target: Element) => boolean) => {
    const target = event.target as Element | null;
    const item = target?.closest<HTMLElement>('.galeo-json-row');
    if (!item || !model) return;
    const node = Number(item.dataset['node']);
    focused = node;
    if (opens(target!)) toggle(node);
    else draw();
    drawn.get(node)?.focus({ preventScroll: true });
  };
  element.addEventListener('click', (event) => pointed(event, (target) => target.classList.contains('galeo-json-toggle')));
  // On the arrow its two clicks already toggled.
  element.addEventListener('dblclick', (event) => pointed(event, (target) => !target.classList.contains('galeo-json-toggle')));

  let listening: HTMLElement | null = null;
  const listen = () => {
    const pane = scroller();
    if (pane === listening) return;
    listening?.removeEventListener('scroll', schedule);
    pane.addEventListener('scroll', schedule, { passive: true });
    listening = pane;
  };

  const view: JsonTreeView = {
    element,
    setModel(next) {
      const previous = model;
      const keep = previous ? { focus: previous.path(focused), top: previous.path(view.topNode()) } : null;
      if (previous) next.keepExpanded(previous);
      model = next;
      drawn = new Map();
      element.replaceChildren();
      focused = 0;
      listen();
      if (keep) {
        focused = next.find(keep.focus) ?? 0;
        keepFocusShown();
        const top = next.find(keep.top);
        const index = top === null ? -1 : indexOf(next.rows(), top);
        if (index !== -1) scroller().scrollTop = treeTop() + index * ROW_HEIGHT;
      }
      draw();
    },
    expandAll() {
      model?.expandAll();
      draw();
    },
    collapseAll() {
      if (!model) return;
      model.collapseAll();
      keepFocusShown();
      draw();
    },
    focus() {
      draw();
      drawn.get(focused)?.focus({ preventScroll: true });
    },
    focusedNode: () => focused,
    topNode() {
      const rows = model?.rows();
      return rows && rows.length > 0 ? rows[Math.min(rows.length - 1, firstInView())]! : 0;
    },
    topLine: () => (model ? model.lineOf(view.topNode()) : 1),
    scrollToLine(line) {
      if (!model) return;
      const node = model.nodeAtLine(line);
      model.reveal(node);
      scroller().scrollTop = treeTop() + indexOf(model.rows(), node) * ROW_HEIGHT;
      draw();
    },
    flush: draw,
    dispose() {
      cancelAnimationFrame(frame);
      listening?.removeEventListener('scroll', schedule);
      element.remove();
    },
  };
  return view;
}
