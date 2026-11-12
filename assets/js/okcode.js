/* Command field. Accepts transaction codes like the real one: "ZCV",
   "/nZCV" and "/oZCV" (new window) all work. On focus a menu shows recent
   and all transactions, filtered as you type. Unknown codes get a red
   error in the status bar. The codes live in _data/tcodes.yml. */

(function () {
  'use strict';

  var form = document.querySelector('.okcode'); /* a div, see default.html */
  var field = document.getElementById('okcode-search');
  var status = document.getElementById('status');
  var all = document.getElementById('tcodes');
  if (!form || !field || !status || !all) return;

  var recentList = form.querySelector('.okcode__list--recent');
  var recentHead = form.querySelector('.okcode__head--recent');
  var KEY = 'okcode.recent';
  var MAX_RECENT = 4;

  var TCODES = {};
  all.querySelectorAll('a').forEach(function (a) {
    TCODES[a.dataset.code] = a;
  });

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }

  function remember(code) {
    var list = readRecent().filter(function (c) { return c !== code; });
    list.unshift(code);
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) { /* private mode */ }
  }

  function renderRecent() {
    recentList.innerHTML = '';
    readRecent().forEach(function (code) {
      if (!TCODES[code]) return;
      var li = document.createElement('li');
      li.appendChild(TCODES[code].cloneNode(true));
      recentList.appendChild(li);
    });
    recentHead.hidden = !recentList.children.length;
  }

  /* Show only entries whose code or text contains what is typed. */
  function filter() {
    var q = field.value.trim().replace(/^\/[no]/i, '').toUpperCase();
    form.querySelectorAll('.okcode__list a').forEach(function (a) {
      a.parentNode.hidden = q && a.textContent.toUpperCase().indexOf(q) === -1;
    });
  }

  function error(text) {
    status.className = 'status status--error';
    status.innerHTML = '<span class="status__icon" aria-hidden="true"></span>';
    status.appendChild(document.createTextNode(text));
  }

  function run(raw) {
    var m = /^(\/[no])?\s*(\S+)$/i.exec(raw.trim());
    if (!m) return;
    var code = m[2].toUpperCase();
    if (code === 'EX' || code === 'END') { error('Log off is not possible. You are still reading.'); return; }
    if (!TCODES[code]) { error('Transaction ' + code + ' does not exist'); return; }
    remember(code);
    var url = TCODES[code].href;
    if ((m[1] || '').toLowerCase() === '/o') window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  }


  /* Menu links are plain links; this only records them as recent. */
  form.addEventListener('click', function (ev) {
    var a = ev.target.closest('.okcode__list a');
    if (a) remember(a.dataset.code);
  });

  /* Keep focus in the field while clicking the menu, so it stays open
     until the click lands. */
  form.querySelector('.okcode__menu').addEventListener('mousedown', function (ev) {
    ev.preventDefault();
  });

  field.addEventListener('focus', function () { renderRecent(); filter(); field.setAttribute('aria-expanded', 'true'); });
  field.addEventListener('blur', function () { field.setAttribute('aria-expanded', 'false'); });
  field.addEventListener('input', filter);
  field.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); run(field.value); }
    if (ev.key === 'Escape') field.blur();
  });
})();
