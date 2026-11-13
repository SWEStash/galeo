/** How long a notice stays, unless the reader dismisses it first. */
const SHOW_MS = 8000;

/**
 * The demo's own notice, outside the app's page: what the reader just tried needs the installed app. Plain DOM
 * (text and one link to the site's install section), announced politely; the latest notice replaces the one before.
 */
export function demoNotice(document: Document, install: string): (message: string) => void {
  const box = document.createElement('div');
  box.className = 'demo-notice';
  box.setAttribute('role', 'status');
  box.hidden = true;
  const text = document.createElement('span');
  const link = document.createElement('a');
  link.href = install;
  link.textContent = 'Install galeo';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss');
  box.append(text, ' ', link, close);
  document.body.append(box);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    box.hidden = true;
    clearTimeout(timer);
  };
  close.addEventListener('click', hide);
  return (message) => {
    text.textContent = message;
    box.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, SHOW_MS);
  };
}
