import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDiagrams, type DiagramOptions } from './diagrams';

afterEach(() => {
  document.body.innerHTML = '';
});

/** An article holding diagram placeholders, as the worker emits them. */
function article(...sources: string[]): HTMLElement {
  const element = document.createElement('article');
  element.innerHTML = sources.map((source) => `<div class="galeo-diagram" data-src-line="1"><pre><code>${source}</code></pre></div>`).join('');
  document.body.append(element);
  return element;
}

/** Placeholders become visible only when the test says so. */
function fakeObserver() {
  const watched = new Map<Element, () => void>();
  return {
    observe: (element: Element, onVisible: () => void) => {
      watched.set(element, onVisible);
      return () => watched.delete(element);
    },
    show: async (element?: Element) => {
      const shown = [...watched].filter(([each]) => !element || each === element);
      for (const [, onVisible] of shown) onVisible();
      await vi.waitFor(() => expect(shown.some(([each]) => each.getAttribute('data-state') === 'pending')).toBe(false));
    },
    watched,
  };
}

function setup(sources: string[], render: DiagramOptions['render'] = async (source) => `<svg><text>${source}</text></svg>`) {
  const root = article(...sources);
  const observer = fakeObserver();
  const engine = vi.fn(render);
  const diagrams = attachDiagrams(root, { scheme: 'light', render: engine, sanitize: (svg) => svg, observe: observer.observe, cache: new Map() });
  const placeholders = [...root.querySelectorAll<HTMLElement>('.galeo-diagram')];
  const svgOf = (element: Element) => element.querySelector('.galeo-diagram-svg')?.shadowRoot?.innerHTML ?? null;
  return { root, observer, engine, diagrams, placeholders, svgOf };
}

describe('attachDiagrams', () => {
  it('draws a diagram only once it comes into view, as a figure and image named by its title', async () => {
    const { observer, engine, placeholders, svgOf } = setup(['graph TD; A---B']);
    expect(engine).not.toHaveBeenCalled();
    expect(placeholders[0]!.dataset['state']).toBe('pending');

    engine.mockResolvedValueOnce('<svg><title>Checkout flow</title><text>A</text></svg>');
    await observer.show();

    expect(engine).toHaveBeenCalledWith('graph TD; A---B', 'light');
    expect(svgOf(placeholders[0]!)).toContain('Checkout flow');
    expect(placeholders[0]!.getAttribute('role')).toBe('figure');
    expect(placeholders[0]!.getAttribute('aria-label')).toBe('Checkout flow');
    const image = placeholders[0]!.querySelector('[role="img"]')!;
    expect(image.getAttribute('aria-label')).toBe('Checkout flow');
    expect(placeholders[0]!.dataset['state']).toBe('rendered');
    expect(observer.watched.size).toBe(0);
  });

  it('names an untitled diagram "Diagram"', async () => {
    const { observer, placeholders } = setup(['pie']);
    await observer.show();
    expect(placeholders[0]!.getAttribute('aria-label')).toBe('Diagram');
  });

  it('expands a drawn diagram with its own SVG and name, from its Expand button', async () => {
    const onExpand = vi.fn();
    const root = article('graph TD');
    const observer = fakeObserver();
    attachDiagrams(root, { scheme: 'light', render: async () => '<svg><title>Flow</title></svg>', sanitize: (svg) => svg, observe: observer.observe, cache: new Map(), onExpand });
    await observer.show();
    const button = root.querySelector<HTMLButtonElement>('.galeo-diagram button')!;
    expect(button.getAttribute('aria-label')).toBe('Expand diagram');
    button.click();
    expect(onExpand).toHaveBeenCalledWith({ svg: '<svg><title>Flow</title></svg>', name: 'Flow', returnFocus: expect.any(Function) });
    button.blur();
    onExpand.mock.calls[0]![0].returnFocus();
    expect(root.ownerDocument.activeElement === button || (root.getRootNode() as Document | ShadowRoot).activeElement === button).toBe(true);
  });

  it('inserts only what the sanitizer returns', async () => {
    const root = article('graph TD');
    const observer = fakeObserver();
    attachDiagrams(root, { scheme: 'light', render: async () => '<svg><script>x()</script></svg>', sanitize: () => '<svg><text>clean</text></svg>', observe: observer.observe, cache: new Map() });
    await observer.show();
    expect(root.querySelector('.galeo-diagram-svg')!.shadowRoot!.innerHTML).toBe('<svg><text>clean</text></svg>');
  });

  it('draws the same source in the same scheme once', async () => {
    const { observer, engine, placeholders, svgOf } = setup(['graph TD; A---B', 'graph TD; A---B']);
    await observer.show(placeholders[0]);
    await observer.show(placeholders[1]);
    expect(engine).toHaveBeenCalledOnce();
    expect(svgOf(placeholders[1]!)).toBe(svgOf(placeholders[0]!));
  });

  it('draws a diagram it has drawn before at once, so a reloaded document keeps its layout', () => {
    const root = article('graph TD');
    const observer = fakeObserver();
    const render = vi.fn();
    attachDiagrams(root, { scheme: 'dark', render, sanitize: (svg) => svg, observe: observer.observe, cache: new Map([['dark\ngraph TD', '<svg><text>cached</text></svg>']]) });
    expect(root.querySelector('.galeo-diagram')?.getAttribute('data-state')).toBe('rendered');
    expect(root.querySelector('.galeo-diagram-svg')!.shadowRoot!.innerHTML).toContain('cached');
    expect(observer.watched.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it("shows a diagram that can't be drawn as an error box with the message and its source", async () => {
    const { observer, placeholders } = setup(['graph TD; A--'], async () => {
      throw new Error('Parse error on line 1');
    });
    await observer.show();
    const box = placeholders[0]!.querySelector('.galeo-block-error');
    expect(box?.querySelector('.galeo-block-error-message')?.textContent).toBe('Parse error on line 1');
    expect(box?.querySelector('code')?.textContent).toBe('graph TD; A--');
    expect(placeholders[0]!.hasAttribute('role')).toBe(false);
    expect(placeholders[0]!.dataset['state']).toBe('error');
  });

  it('draws visible diagrams again in a new scheme', async () => {
    const { observer, engine, diagrams, placeholders } = setup(['graph TD']);
    await observer.show();
    diagrams.setScheme('dark');
    expect(placeholders[0]!.dataset['state']).toBe('pending');
    await observer.show();
    expect(engine).toHaveBeenLastCalledWith('graph TD', 'dark');
    expect(placeholders[0]!.dataset['state']).toBe('rendered');
  });

  it('stops watching once detached, and leaves a diagram whose content went away alone', async () => {
    let finish: (svg: string) => void = () => {};
    const { observer, diagrams, placeholders, svgOf } = setup(['graph TD', 'pie'], () => new Promise((resolve) => (finish = resolve)));
    observer.watched.get(placeholders[0]!)!();
    diagrams.dispose();
    expect(observer.watched.size).toBe(0);
    finish('<svg></svg>');
    await Promise.resolve();
    expect(svgOf(placeholders[0]!)).toBeNull();
  });
});
