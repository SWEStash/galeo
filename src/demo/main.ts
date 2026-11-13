import delivery from './samples/delivery.log?raw';
import frame from './samples/frame.md?raw';
import materials from './samples/materials.csv?raw';
import order from './samples/order.json?raw';
import plan from './samples/plan.md?raw';
import roof from './samples/roof.md?raw';
import { growingLog } from './growing-log';
import { memoryFiles } from './memory-fs';
import { DEMO_HOME, standIn } from './stand-in';

const folder = `${DEMO_HOME}/shed`;
const log = `${folder}/delivery.log`;
const samples = {
  [`${folder}/plan.md`]: plan,
  [`${folder}/frame.md`]: frame,
  [`${folder}/materials.csv`]: materials,
  [`${folder}/order.json`]: order,
  [log]: delivery,
  [`${folder}/roof.md`]: roof,
};
const files = memoryFiles(samples);
const demo = standIn(files, Object.keys(samples));

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
growingLog((line) => {
  files.append(log, line);
  demo.changed(log);
});
await import('../renderer/main');
