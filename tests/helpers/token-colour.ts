import type { Locator } from '@playwright/test';

/**
 * The element's text colour, and the colour `token` resolves to where the element is (inside the
 * document's shadow root), from a probe styled with it; and the text colour around it, which the
 * token should differ from, or an unresolved token could pass as a match.
 */
export function tokenColour(element: Locator, token: string): Promise<{ shown: string; token: string; around: string }> {
  return element.evaluate((node, name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    node.parentElement!.append(probe);
    const colours = { shown: getComputedStyle(node).color, token: getComputedStyle(probe).color, around: getComputedStyle(node.parentElement!).color };
    probe.remove();
    return colours;
  }, token);
}
