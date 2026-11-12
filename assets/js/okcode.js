/* Command field. Accepts transaction codes like the real one: "ZCV",
   "/nZCV" and "/oZCV" (new window) all work. Unknown codes get the classic
   red error in the status bar. With JS off the form just reloads home. */

(function () {
  'use strict';

  var form = document.querySelector('.okcode');
  var status = document.getElementById('status');
  if (!form || !status) return;

  var root = form.getAttribute('action');
  var TCODES = {
    ZBLOG: '',
    SE38: '',
    ZCV: 'cv/',
    PA20: 'cv/',
    SU01: 'cv/',
    ZCERT: 'cv/#certifications',
    RSS: 'feed.xml'
  };

  function error(text) {
    status.className = 'status status--error';
    status.innerHTML = '<span class="status__icon status__icon--e" aria-hidden="true"></span>';
    status.appendChild(document.createTextNode(text));
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var raw = form.t.value.trim();
    var m = /^(\/[no])?\s*(\S+)$/i.exec(raw);
    if (!m) return;
    var code = m[2].toUpperCase();
    if (code === 'EX' || code === 'END') { error('Log off is not possible. You are still reading.'); return; }
    if (!(code in TCODES)) { error('Transaction ' + code + ' does not exist'); return; }
    var url = root + TCODES[code];
    if ((m[1] || '').toLowerCase() === '/o') window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  });
})();
