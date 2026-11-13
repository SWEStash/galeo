// Copy buttons for the website's command blocks. The page works without this script, which only adds them;
// the page's security policy allows no other script (index.html). A block, so nothing lands in the page's globals.
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
