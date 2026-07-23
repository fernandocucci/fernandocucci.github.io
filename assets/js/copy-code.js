/* Copy button for code panels.
   Progressive enhancement: the button is created here, so with JS off the
   panels render exactly as before. The button is appended to the panel
   wrapper rather than to <pre>, so selecting the block by hand never picks
   up the word "copy" along with the code. */

(function () {
  'use strict';

  var LABEL = { idle: 'copy', done: 'copied', fail: 'failed' };
  var RESET_MS = 1600;

  function textOf(pre) {
    var code = pre.querySelector('code');
    return (code || pre).textContent.replace(/\n+$/, '');
  }

  /* Clipboard API needs a secure context. Local file:// previews and plain
     http fall back to the old selection trick rather than losing the button. */
  function write(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  function attach(pre) {
    var panel = pre.closest('div[class*="language-"], figure.highlight') || pre;
    if (panel.querySelector('.code-copy')) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');

    var label = document.createElement('span');
    label.className = 'code-copy__label';
    label.setAttribute('aria-live', 'polite');
    label.textContent = LABEL.idle;
    button.appendChild(label);

    var timer;
    button.addEventListener('click', function () {
      write(textOf(pre)).then(function () {
        settle('done');
      }, function () {
        settle('fail');
      });
    });

    function settle(state) {
      label.textContent = LABEL[state];
      button.dataset.state = state;
      button.setAttribute('aria-label', state === 'done'
        ? 'Code copied to clipboard'
        : state === 'fail' ? 'Copy failed' : 'Copy code to clipboard');
      clearTimeout(timer);
      timer = setTimeout(function () {
        label.textContent = LABEL.idle;
        button.setAttribute('aria-label', 'Copy code to clipboard');
        delete button.dataset.state;
      }, RESET_MS);
    }

    panel.classList.add('code-panel');
    /* Only named languages get a ::before label row for the button to sit
       in. Without one the code starts at the top edge, so the panel is
       flagged and the CSS opens room instead of letting them collide. */
    var label_row = window.getComputedStyle(panel, '::before').content;
    if (!label_row || label_row === 'none') {
      panel.classList.add('code-panel--unlabelled');
    }
    panel.appendChild(button);
  }

  var panels = document.querySelectorAll('.prose pre');
  for (var i = 0; i < panels.length; i++) attach(panels[i]);
})();
