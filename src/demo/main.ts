import delivery from './samples/delivery.log?raw';
import frame from './samples/frame.md?raw';
import materials from './samples/materials.csv?raw';
import order from './samples/order.json?raw';
import plan from './samples/plan.md?raw';
import roof from './samples/roof.md?raw';
import './demo.css';
import { growingLog } from './growing-log';
import { memoryFiles } from './memory-fs';
import { demoNotice } from './notice';
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
// The site's install section, from /demo/.
/** The visitor's system, for the keys the app uses there (⌘ on a Mac). */
const platform = /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux';
const demo = standIn(files, Object.keys(samples), demoNotice(document, '../#install'), platform);

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
