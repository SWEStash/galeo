import math from '../../tests/fixtures/docs/math.md?raw';
import mermaid from '../../tests/fixtures/docs/mermaid.md?raw';
import { memoryFiles } from './memory-fs';
import { DEMO_HOME, standIn } from './stand-in';

const folder = `${DEMO_HOME}/galeo-demo`;
const samples = { [`${folder}/mermaid.md`]: mermaid, [`${folder}/math.md`]: math };
const demo = standIn(memoryFiles(samples), Object.keys(samples));

// The renderer reads `window.galeo` as the preload leaves it: set it first, then load the app's page.
Object.defineProperty(window, 'galeo', { value: demo.api });
// Keys main takes before the page sees them in the app.
window.addEventListener(
  'keydown',
  (event) => {
    if (!event.repeat && demo.keyDown(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  { capture: true },
);
await import('../renderer/main');
