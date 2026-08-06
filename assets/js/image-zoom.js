/* Click a figure to open it over the page at full size.
   Progressive enhancement: with JS off the images render exactly as before,
   still readable in the column, just not enlargeable.

   Two states, open and closed. The screenshots here are 1448 to 2400px wide
   against an 800px column, and the point of opening one is to read the small
   UI labels inside it, so the overlay goes straight to 1:1 and scrolls. Any
   click closes, including on the image itself. */

(function () {
  'use strict';

  var OPEN_CLASS = 'has-lightbox-open';
  var overlay, frame, image, caption, opener;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.hidden = true;

    frame = document.createElement('div');
    frame.className = 'lightbox__frame';

    image = document.createElement('img');
    image.className = 'lightbox__image';
    image.alt = '';

    caption = document.createElement('p');
    caption.className = 'lightbox__caption';

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'lightbox__close';
    close.setAttribute('aria-label', 'Close image');
    close.textContent = 'close';

    frame.appendChild(image);
    overlay.appendChild(frame);
    overlay.appendChild(caption);
    overlay.appendChild(close);
    document.body.appendChild(overlay);

    /* One handler on the overlay covers the backdrop, the image and the frame,
       so there is no click anywhere on top of the page that does nothing. */
    overlay.addEventListener('click', hide);
  }

  function show(source) {
    if (!overlay) build();
    opener = source;
    image.src = source.currentSrc || source.src;
    image.alt = source.alt || '';
    caption.textContent = source.alt || '';
    caption.hidden = !source.alt;
    overlay.hidden = false;
    /* The page behind must not scroll under the overlay. */
    document.documentElement.classList.add(OPEN_CLASS);
    centre();
    /* A wide screenshot has no size until it decodes, so centre again once it
       does. Cached images fire this before the listener attaches, hence both. */
    image.addEventListener('load', centre, { once: true });
    overlay.querySelector('.lightbox__close').focus();
  }

  /* Open on the middle of the image rather than its top-left corner. */
  function centre() {
    frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
    frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
  }

  function hide() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    image.removeAttribute('src');
    document.documentElement.classList.remove(OPEN_CLASS);
    if (opener) { opener.focus(); opener = null; }
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') hide();
  });

  var figures = document.querySelectorAll('.prose img');
  for (var i = 0; i < figures.length; i++) {
    (function (img) {
      /* Keyboard users get the same affordance: the image becomes a real
         control rather than decoration you can only reach with a mouse. */
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-haspopup', 'dialog');
      img.classList.add('is-zoomable');
      img.addEventListener('click', function () { show(img); });
      img.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          show(img);
        }
      });
    })(figures[i]);
  }
})();
