/* SE38 screens: initial screen (program name, F4 help, Create, Display,
   Change, Execute), editor (Display <-> Change, Check, Execute) and the
   list output. Samples come from abap-samples.js. Programs a visitor
   creates or changes are saved in localStorage under KEY. */

(function () {
  'use strict';

  var KEY = 'se38.programs';
  var LAST = 'se38.last';
  var $ = function (id) { return document.getElementById(id); };

  var screens = { initial: $('se38-initial'), editor: $('se38-editor'), list: $('se38-list') };
  var nameField = $('se38-name'), f4 = $('se38-f4'), f4rows = $('se38-f4rows');
  var src = $('se38-src'), gutter = $('se38-gutter');
  var out = $('se38-out'), listHead = $('se38-listhead');
  var status = $('status'), title = document.querySelector('.shell__title');
  if (!src || !window.ABAP || !window.ABAP_SAMPLES) return;

  var SAMPLES = {};
  window.ABAP_SAMPLES.forEach(function (s) { SAMPLES[s.name] = s; });

  var current = null;      /* program open in the editor */
  var editable = false;
  var listFrom = 'initial'; /* where Back from the list returns to */

  /* ---- storage ---- */

  function stored() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(name, code) {
    var all = stored();
    if (code === null) delete all[name]; else all[name] = code;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
  }
  function sourceOf(name) {
    var all = stored();
    if (name in all) return all[name];
    return SAMPLES[name] ? SAMPLES[name].src : null;
  }

  /* ---- status bar and title ---- */

  function setStatus(kind, text) {
    status.className = 'status' + (kind === 'error' ? ' status--error' : '');
    status.innerHTML = '<span class="status__icon' + (kind === 'ok' ? ' status__icon--ok' : '') + '" aria-hidden="true"></span>';
    status.appendChild(document.createTextNode(text));
  }
  function setTitle(text) { if (title) title.textContent = text; }

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
  }

  /* ---- initial screen ---- */

  function programName() {
    return nameField.value.trim().toUpperCase();
  }

  function needExisting() {
    var name = programName();
    if (!name) { setStatus('error', 'Enter a program name'); nameField.focus(); return null; }
    if (sourceOf(name) === null) { setStatus('error', 'Program ' + name + ' does not exist'); nameField.focus(); return null; }
    try { localStorage.setItem(LAST, name); } catch (e) { /* private mode */ }
    return name;
  }

  function create() {
    var name = programName();
    if (!/^[ZY][A-Z0-9_]{0,29}$/.test(name)) {
      setStatus('error', 'Program names must start with Z or Y and use only letters, digits and _ (max. 30)');
      nameField.focus();
      return;
    }
    if (sourceOf(name) !== null) { setStatus('error', 'Program ' + name + ' already exists'); return; }
    save(name, 'REPORT ' + name.toLowerCase() + '.\n\n');
    openEditor(name, true);
    setStatus('ok', 'Program ' + name + ' created');
  }

  /* Filters like SAP: "z*" is a pattern, a plain value matches as a prefix. */
  function matcher(pattern) {
    if (!pattern) return function () { return true; };
    var body = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    var re = new RegExp('^' + body + (pattern.indexOf('*') < 0 ? '' : '$'));
    return function (n) { return re.test(n); };
  }

  function renderF4() {
    var all = stored(), names = Object.keys(SAMPLES), match = matcher(programName());
    Object.keys(all).forEach(function (n) { if (!SAMPLES[n]) names.push(n); });
    names = names.filter(match);
    f4rows.innerHTML = '';
    if (!names.length) {
      f4rows.innerHTML = '<tr><td colspan="2">No entries found</td></tr>';
      return;
    }
    names.forEach(function (n) {
      var tr = document.createElement('tr');
      tr.tabIndex = 0;
      var a = document.createElement('td'), b = document.createElement('td');
      a.textContent = n;
      b.textContent = SAMPLES[n] ? SAMPLES[n].text : 'Your program, saved in this browser';
      tr.appendChild(a); tr.appendChild(b);
      tr.addEventListener('click', function () { pick(n); });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') pick(n); });
      f4rows.appendChild(tr);
    });
  }
  function toggleF4(open) {
    if (open) renderF4();
    f4.hidden = !open;

  }
  function pick(n) {
    nameField.value = n;
    toggleF4(false);
    nameField.focus();
    setStatus('ok', SAMPLES[n] ? SAMPLES[n].text : 'Your program');
  }

  /* ---- editor ---- */

  function renderGutter() {
    var n = src.value.split('\n').length, s = '';
    for (var i = 1; i <= n; i++) s += i + '\n';
    gutter.textContent = s;
  }

  function setMode(change) {
    editable = change;
    src.readOnly = !change;
    screens.editor.classList.toggle('se38--display', !change);
    setTitle('ABAP Editor: ' + (change ? 'Change' : 'Display') + ' Report ' + current);
  }

  function openEditor(name, change) {
    current = name;
    src.value = sourceOf(name);
    renderGutter();
    $('se38-reset').hidden = !SAMPLES[name];
    show('editor');
    setMode(change);
    src.scrollTop = 0;
    src.focus();
    src.setSelectionRange(0, 0);
  }

  function selectLine(line) {
    var lines = src.value.split('\n'), start = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
    src.focus();
    src.setSelectionRange(start, start + (lines[line - 1] || '').length);
  }

  /* ---- check and execute ---- */

  function syntaxError(e, inEditor) {
    setStatus('error', 'Syntax error in line ' + e.line + ': ' + e.msg);
    if (inEditor) selectLine(e.line);
  }

  function execute(code, from) {
    var r = ABAP.run(code);
    if (r.error && r.error.kind === 'syntax') return syntaxError(r.error, from === 'editor');
    listFrom = from;
    setTitle('Program ' + r.program);
    listHead.textContent = 'Program ' + r.program;
    out.className = 'se38__out';
    if (r.error) {
      out.classList.add('se38__out--dump');
      out.textContent = 'Runtime Errors         ' + r.error.dump + '\n\n' +
        'Short Text\n    ' + r.error.msg + '\n\n' +
        'Error occurred in\n    Program ' + r.program + ', line ' + r.error.line;
      setStatus('error', 'Runtime error ' + r.error.dump + ' in line ' + r.error.line);
    } else {
      out.textContent = r.lines.join('\n');
      setStatus('ok', r.lines.length + (r.lines.length === 1 ? ' line' : ' lines') + ' written');
    }
    show('list');
    $('se38-back').focus();
  }

  function back() {
    if (!screens.list.hidden && listFrom === 'editor') {
      show('editor');
      setMode(editable);
      setStatus('ok', 'F8 executes the program. Ctrl+F2 checks the syntax.');
      src.focus();
      return;
    }
    show('initial');
    setTitle('ABAP Editor: Initial Screen');
    setStatus('ok', 'Enter a program name. F4 lists the sample programs.');
    nameField.value = current || nameField.value;
    nameField.focus();
  }

  /* ---- events ---- */

  $('se38-create').addEventListener('click', create);
  $('se38-display').addEventListener('click', function () { var n = needExisting(); if (n) openEditor(n, false); });
  $('se38-change').addEventListener('click', function () { var n = needExisting(); if (n) openEditor(n, true); });
  $('se38-exec0').addEventListener('click', function () { var n = needExisting(); if (n) { current = n; execute(sourceOf(n), 'initial'); } });
  $('se38-f4btn').addEventListener('click', function () { toggleF4(f4.hidden); });

  $('se38-toggle').addEventListener('click', function () {
    setMode(!editable);
    setStatus('ok', editable ? 'Change mode' : 'Display mode');
  });
  $('se38-check').addEventListener('click', function () {
    var r = ABAP.check(src.value);
    if (r.error) syntaxError(r.error, true);
    else setStatus('ok', 'Program ' + current + ' is syntactically correct');
  });
  $('se38-run').addEventListener('click', function () { execute(src.value, 'editor'); });
  $('se38-back').addEventListener('click', back);
  $('se38-reset').addEventListener('click', function () {
    save(current, null);
    src.value = SAMPLES[current].src;
    renderGutter();
    setStatus('ok', 'Original version of ' + current + ' restored');
  });

  /* Every change is saved at once; there is no separate Save step. */
  src.addEventListener('input', function () {
    renderGutter();
    if (editable && current) save(current, src.value);
  });
  src.addEventListener('scroll', function () { gutter.scrollTop = src.scrollTop; });
  src.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && editable) {
      ev.preventDefault();
      src.setRangeText('  ', src.selectionStart, src.selectionEnd, 'end');
      src.dispatchEvent(new Event('input'));
    }
  });

  nameField.addEventListener('input', function () { if (!f4.hidden) renderF4(); });
  nameField.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); $('se38-change').click(); }
    if (ev.key === 'F4') { ev.preventDefault(); toggleF4(true); }
    if (ev.key === 'ArrowDown' && !f4.hidden && f4rows.firstChild) { ev.preventDefault(); f4rows.firstChild.focus(); }
    if (ev.key === 'Escape' && !f4.hidden) { ev.preventDefault(); toggleF4(false); }
  });
  f4.addEventListener('keydown', function (ev) {
    var row = document.activeElement;
    if (ev.key === 'Escape') { toggleF4(false); nameField.focus(); }
    if (ev.key === 'ArrowDown' && row.nextSibling) { ev.preventDefault(); row.nextSibling.focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); (row.previousSibling || nameField).focus(); }
  });
  /* A click anywhere else closes the search results. */
  document.addEventListener('click', function (ev) {
    if (!f4.hidden && !ev.target.closest('.se38__prog')) toggleF4(false);
  });

  document.addEventListener('keydown', function (ev) {
    var ctrl = ev.ctrlKey || ev.metaKey;
    var runKey = ev.key === 'F8' || (ev.key === 'Enter' && ctrl);
    if (runKey && !screens.editor.hidden) { ev.preventDefault(); $('se38-run').click(); }
    else if (runKey && !screens.initial.hidden) { ev.preventDefault(); $('se38-exec0').click(); }
    else if (ev.key === 'F2' && ctrl && !screens.editor.hidden) { ev.preventDefault(); $('se38-check').click(); }
    else if (ev.key === 'F1' && ctrl && !screens.editor.hidden) { ev.preventDefault(); $('se38-toggle').click(); }
    else if ((ev.key === 'F3' || (ev.key === 'Escape' && f4.hidden)) && screens.initial.hidden) { ev.preventDefault(); back(); }
  });

  try { nameField.value = localStorage.getItem(LAST) || ''; } catch (e) { /* private mode */ }
  nameField.focus();
  try { localStorage.removeItem('se38.source'); } catch (e) { /* key from the first version */ }
})();
