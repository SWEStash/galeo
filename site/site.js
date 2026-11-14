// The website's script: copy buttons on the command blocks, the live demo loaded on request, and Previous/Next for
// the screenshots. The page works without it: the blocks stay plain, the demo is a link and the screenshots a row
// that scrolls. Its security policy allows no other script (index.html). Blocks, so nothing lands in the globals.
{
  const announcer = document.createElement('p');
  announcer.className = 'visually-hidden';
  announcer.setAttribute('aria-live', 'polite');
  document.body.append(announcer);

  for (const pre of document.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const heading = pre.closest('.panel, section')?.querySelector('h3, h2')?.textContent.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = 'Copy';
    if (heading) button.setAttribute('aria-label', `Copy: ${heading}`);
    let reset;
    const say = (shown, announced) => {
      button.textContent = shown;
      announcer.textContent = announced;
      clearTimeout(reset);
      reset = setTimeout(() => {
        button.textContent = 'Copy';
        announcer.textContent = '';
      }, 2000);
    };
    button.addEventListener('click', () => {
      // No clipboard outside a secure context (a page opened from a file): the selection then stands in.
      (navigator.clipboard?.writeText(code.textContent) ?? Promise.reject(new Error('no clipboard'))).then(
        () => say('Copied', 'Copied to the clipboard'),
        () => {
          // No clipboard access (an old browser, or a policy): select the text for Ctrl+C instead.
          getSelection().selectAllChildren(code);
          say('Selected', 'Selected: press Ctrl+C to copy');
        },
      );
    });
    const wrap = document.createElement('div');
    wrap.className = 'code';
    pre.replaceWith(wrap);
    wrap.append(pre, button);
  }
}

// The live demo (#65): a still and a button until the visitor asks, so the page stays light and the demo can't
// take the keyboard or the scroll before anyone chose it. The button only shows where the frame fits (style.css).
{
  for (const frame of document.querySelectorAll('.demo-frame')) {
    const start = frame.querySelector('button');
    if (!start) continue;
    start.hidden = false;
    start.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = 'demo/';
      iframe.title = 'galeo, running in this page with sample files';
      frame.replaceChildren(iframe);
      iframe.focus();
    });
  }
}

// The screenshots one at a time: Previous, the position, Next. Without the script the row scrolls by itself.
{
  for (const gallery of document.querySelectorAll('.gallery')) {
    const list = gallery.querySelector('ul');
    const items = [...list.children];
    const step = () => items[0].offsetWidth + parseFloat(getComputedStyle(list).columnGap);
    // The screenshot shown, or being scrolled to: clicks during a smooth scroll count from where it's going.
    let index = 0;
    const show = (i) => {
      index = Math.max(0, Math.min(items.length - 1, i));
      list.scrollTo({ left: index * step(), behavior: 'smooth' });
      update();
    };
    const button = (label, text, dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'button secondary';
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => show(index + dir));
      return b;
    };
    const previous = button('Previous screenshot', '‹ Previous', -1);
    const next = button('Next screenshot', 'Next ›', 1);
    const position = document.createElement('span');
    position.setAttribute('aria-live', 'polite');
    function update() {
      position.textContent = `${index + 1} / ${items.length}`;
      previous.disabled = index === 0;
      next.disabled = index === items.length - 1;
    }
    const nav = document.createElement('div');
    nav.className = 'gallery-nav';
    nav.append(previous, position, next);
    gallery.append(nav);
    gallery.classList.add('stepped');
    // Scrolled by hand (touchpad, keys, the scrollbar): the position follows once the scroll stops.
    list.addEventListener('scrollend', () => {
      index = Math.round(list.scrollLeft / step());
      update();
    });
    update();
  }
}
