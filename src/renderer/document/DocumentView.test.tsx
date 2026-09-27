import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentView } from './DocumentView';

let root: Root | undefined;

async function render(element: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const shadowOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-testid="document"]')!.shadowRoot!;

describe('DocumentView', () => {
  it('mounts one document under StrictMode, whose effects run twice', async () => {
    const container = await render(
      <StrictMode>
        <DocumentView html="<p>once</p>" scheme="light" />
      </StrictMode>,
    );
    const shadow = shadowOf(container);
    expect(shadow.querySelectorAll('article')).toHaveLength(1);
    expect(shadow.querySelector('article')?.innerHTML).toBe('<p>once</p>');
  });

  it('updates the content and the scheme in place', async () => {
    const container = await render(<DocumentView html="<p>a</p>" scheme="light" />);
    const shadow = shadowOf(container);
    await act(async () => root!.render(<DocumentView html="<p>b</p>" scheme="dark" />));
    expect(shadowOf(container)).toBe(shadow);
    expect(shadow.querySelector('article')?.innerHTML).toBe('<p>b</p>');
    expect(container.querySelector<HTMLElement>('[data-testid="document"]')?.dataset['scheme']).toBe('dark');
  });
});
