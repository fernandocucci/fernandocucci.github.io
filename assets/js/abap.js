/* A tiny ABAP interpreter for the SE38 page. It runs in the browser and in
   Node (for _tests/abap_test.js).

   Supported subset:
     REPORT, DATA / CONSTANTS (TYPE i p f c n d t string, LENGTH, DECIMALS,
     LIKE, VALUE), assignment (= += -= *= /=), WRITE (/ and chains), ULINE,
     SKIP, NEW-LINE, IF / ELSEIF / ELSE, DO [n TIMES], WHILE, CASE / WHEN,
     EXIT, CONTINUE, CHECK, CLEAR, CONCATENATE ... INTO ... SEPARATED BY,
     ADD / SUBTRACT / MULTIPLY / DIVIDE, TRANSLATE ... TO UPPER/LOWER CASE,
     CONDENSE [NO-GAPS], string templates |...{ expr }...|, &&,
     + - * / DIV MOD **, comparisons (= <> < > <= >= EQ NE LT GT LE GE),
     AND OR NOT, IS [NOT] INITIAL, strlen( ) to_upper( ) to_lower( ) abs( ),
     sy-index sy-datum sy-uzeit sy-uname.
   Not supported: internal tables, SELECT, classes, includes.

   ponytail: tree-walking interpreter with a global step limit; fine for
   teaching-size programs, not for anything long-running. */

(function (root) {
  'use strict';

  var MAX_STEPS = 200000;
  var MAX_LINES = 5000;
  var ULINE_WIDTH = 72;

  function SyntaxErr(line, msg) { this.kind = 'syntax'; this.line = line; this.msg = msg; }
  function Dump(line, dump, msg) { this.kind = 'runtime'; this.line = line; this.dump = dump; this.msg = msg; }

  /* ------------------------------------------------------------ tokens */

  var OPS = ['**', '<=', '>=', '<>', '&&', '+=', '-=', '*=', '/=', '=', '<', '>', '+', '-', '*', '/', '(', ')'];

  /* Returns raw statements (token arrays split at periods). */
  function tokenize(src, firstLine) {
    var stmts = [], cur = [], i = 0, n = src.length, line = firstLine || 1, prevEnd = -1;

    function push(type, v, start) {
      cur.push({ type: type, v: v, line: line, adj: start === prevEnd });
      prevEnd = i;
    }

    function readQuoted(q, start) {
      var text = '';
      i++;
      for (;;) {
        if (i >= n || src[i] === '\n') throw new SyntaxErr(line, 'Literal ' + q + '...' + q + ' is not closed.');
        if (src[i] === q) {
          if (src[i + 1] === q) { text += q; i += 2; continue; }
          i++;
          return text;
        }
        text += src[i++];
      }
    }

    while (i < n) {
      var ch = src[i];
      if (ch === '\n') { line++; i++; continue; }
      if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
      if ((ch === '*' && (i === 0 || src[i - 1] === '\n')) || ch === '"') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      var start = i;
      if (ch === "'" || ch === '`') {
        var text = readQuoted(ch, start);
        push('str', { text: text, kind: ch === "'" ? 'c' : 'string' }, start);
      } else if (ch === '|') {
        var raw = '';
        i++;
        while (i < n && src[i] !== '|') {
          if (src[i] === '\n') throw new SyntaxErr(line, 'String template |...| is not closed.');
          if (src[i] === '\\' && i + 1 < n) { raw += src[i] + src[i + 1]; i += 2; continue; }
          raw += src[i++];
        }
        if (i >= n) throw new SyntaxErr(line, 'String template |...| is not closed.');
        i++;
        push('tpl', raw, start);
      } else if (/[0-9]/.test(ch)) {
        while (i < n && /[0-9]/.test(src[i])) i++;
        push('num', Number(src.slice(start, i)), start);
      } else if (/[A-Za-z_]/.test(ch)) {
        while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        while (src[i] === '-' && /[A-Za-z_]/.test(src[i + 1] || '')) {
          i++;
          while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        }
        push('id', src.slice(start, i).toUpperCase(), start);
      } else if (ch === '.') {
        i++;
        if (cur.length) stmts.push(cur);
        cur = [];
      } else if (ch === ':') {
        i++; push('colon', ':', start);
      } else if (ch === ',') {
        i++; push('comma', ',', start);
      } else {
        var op = null;
        for (var k = 0; k < OPS.length; k++) {
          if (src.startsWith(OPS[k], i)) { op = OPS[k]; break; }
        }
        if (!op) throw new SyntaxErr(line, 'Unexpected character "' + ch + '".');
        i += op.length;
        push('op', op, start);
      }
    }
    if (cur.length) throw new SyntaxErr(cur[cur.length - 1].line, 'The last statement is not complete (period missing).');
    return stmts;
  }

  /* Expands chains: "WRITE: / a, b." becomes "WRITE / a." and "WRITE b.". */
  function expandChains(raw) {
    var out = [];
    raw.forEach(function (toks) {
      var c = -1;
      for (var k = 0; k < toks.length; k++) if (toks[k].type === 'colon') { c = k; break; }
      if (c < 0) { out.push({ toks: toks, line: toks[0].line }); return; }
      var prefix = toks.slice(0, c), part = [];
      toks.slice(c + 1).concat([null]).forEach(function (t) {
        if (t === null || t.type === 'comma') {
          var all = prefix.concat(part);
          if (all.length) out.push({ toks: all, line: (part[0] || prefix[0]).line });
          part = [];
        } else {
          part.push(t);
        }
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ parser */

  var TYPES = { I: 1, P: 1, F: 1, C: 1, N: 1, D: 1, T: 1, STRING: 1 };
  var FUNCS = { STRLEN: 1, TO_UPPER: 1, TO_LOWER: 1, ABS: 1 };
  var SY = { 'SY-INDEX': 1, 'SY-DATUM': 1, 'SY-UZEIT': 1, 'SY-UNAME': 1 };
  var CMP = { '=': '=', EQ: '=', '<>': '<>', NE: '<>', '<': '<', LT: '<', '>': '>', GT: '>', '<=': '<=', LE: '<=', '>=': '>=', GE: '>=' };
  /* Binding powers: [left, right]. */
  var BIN = {
    OR: [1, 2], AND: [3, 4],
    '=': [7, 8], EQ: [7, 8], '<>': [7, 8], NE: [7, 8], '<': [7, 8], LT: [7, 8],
    '>': [7, 8], GT: [7, 8], '<=': [7, 8], LE: [7, 8], '>=': [7, 8], GE: [7, 8],
    '&&': [9, 10], '+': [11, 12], '-': [11, 12],
    '*': [13, 14], '/': [13, 14], DIV: [13, 14], MOD: [13, 14], '**': [16, 15]
  };
  var CLOSERS = { ENDIF: 1, ELSE: 1, ELSEIF: 1, ENDDO: 1, ENDWHILE: 1, WHEN: 1, ENDCASE: 1 };

  function compile(src) {
    var stmts = expandChains(tokenize(src));
    var declared = {}, constants = {};
    var k;
    for (k in SY) declared[k] = 1;
    stmts.forEach(function (s) {
      var t0 = s.toks[0], t1 = s.toks[1];
      if (t0.type === 'id' && (t0.v === 'DATA' || t0.v === 'CONSTANTS') && t1 && t1.type === 'id') {
        declared[t1.v] = 1;
        if (t0.v === 'CONSTANTS') constants[t1.v] = 1;
      }
    });

    var pos = 0, loopDepth = 0, program = 'ZPROGRAM', decls = [];

    function cursor(s) {
      var t = s.toks, i = 0;
      var c = {
        line: s.line,
        peek: function (o) { return t[i + (o || 0)]; },
        next: function () { return t[i++]; },
        done: function () { return i >= t.length; },
        isKw: function (w, o) { var x = t[i + (o || 0)]; return !!x && x.type === 'id' && x.v === w; },
        isOp: function (w, o) { var x = t[i + (o || 0)]; return !!x && x.type === 'op' && x.v === w; },
        err: function (msg) { var x = t[i] || t[t.length - 1]; throw new SyntaxErr(x ? x.line : s.line, msg); },
        expectKw: function (w) { if (!c.isKw(w)) c.err('"' + w + '" expected' + found()); i++; },
        expectOp: function (w) { if (!c.isOp(w)) c.err('"' + w + '" expected' + found()); i++; },
        end: function () { if (!c.done()) c.err('Unexpected "' + show(t[i]) + '".'); }
      };
      function found() { return t[i] ? ', not "' + show(t[i]) + '".' : '.'; }
      return c;
    }

    function show(t) {
      if (t.type === 'str') return t.v.kind === 'c' ? "'" + t.v.text + "'" : '`' + t.v.text + '`';
      if (t.type === 'tpl') return '|' + t.v + '|';
      return String(t.v);
    }

    function field(c, forWrite) {
      var t = c.next();
      if (!t || t.type !== 'id') c.err('Field name expected.');
      if (!declared[t.v]) throw new SyntaxErr(t.line, 'Field "' + t.v.toLowerCase() + '" is unknown.');
      if (forWrite && (constants[t.v] || SY[t.v])) throw new SyntaxErr(t.line, 'The field "' + t.v.toLowerCase() + '" cannot be changed.');
      return t.v;
    }

    function template(t) {
      var parts = [], raw = t.v, i = 0, text = '';
      while (i < raw.length) {
        var ch = raw[i];
        if (ch === '\\') {
          var e = raw[i + 1];
          text += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else if (ch === '{') {
          var close = raw.indexOf('}', i);
          if (close < 0) throw new SyntaxErr(t.line, 'Embedded expression { ... } is not closed.');
          if (text) parts.push({ text: text });
          text = '';
          var inner = expandChains(tokenize(raw.slice(i + 1, close) + '.', t.line));
          if (inner.length !== 1) throw new SyntaxErr(t.line, 'Embedded expression { ... } is empty.');
          var ic = cursor(inner[0]);
          parts.push({ expr: expr(ic, 0) });
          ic.end();
          i = close + 1;
        } else {
          text += ch;
          i++;
        }
      }
      if (text) parts.push({ text: text });
      return parts;
    }

    function operand(c) {
      var t = c.next();
      if (!t) c.err('The statement is incomplete.');
      if (t.type === 'num') return { k: 'lit', v: t.v, type: 'i', line: t.line };
      if (t.type === 'str') return { k: 'lit', v: t.v.text, type: t.v.kind, line: t.line };
      if (t.type === 'tpl') return { k: 'tpl', parts: template(t), line: t.line };
      if (t.type === 'id') {
        var nx = c.peek();
        if (nx && nx.type === 'op' && nx.v === '(' && nx.adj) {
          if (!FUNCS[t.v]) throw new SyntaxErr(t.line, 'Function "' + t.v.toLowerCase() + '( )" is unknown.');
          c.next();
          var a = expr(c, 0);
          c.expectOp(')');
          return { k: 'call', fn: t.v, a: a, line: t.line };
        }
        if (!declared[t.v]) throw new SyntaxErr(t.line, 'Field "' + t.v.toLowerCase() + '" is unknown.');
        return { k: 'var', name: t.v, line: t.line };
      }
      throw new SyntaxErr(t.line, 'Unexpected "' + show(t) + '".');
    }

    function expr(c, minBp) {
      var left, t = c.peek();
      if (!t) c.err('The statement is incomplete.');
      if (t.type === 'id' && t.v === 'NOT') {
        c.next();
        left = { k: 'not', a: expr(c, 5), line: t.line };
      } else if (t.type === 'op' && t.v === '-') {
        c.next();
        left = { k: 'neg', a: expr(c, 15), line: t.line };
      } else if (t.type === 'op' && t.v === '(') {
        c.next();
        left = expr(c, 0);
        c.expectOp(')');
      } else {
        left = operand(c);
      }
      for (;;) {
        t = c.peek();
        if (!t) break;
        if (t.type === 'id' && t.v === 'IS' && 7 >= minBp) {
          c.next();
          var neg = false;
          if (c.isKw('NOT')) { c.next(); neg = true; }
          c.expectKw('INITIAL');
          left = { k: 'initial', a: left, neg: neg, line: t.line };
          continue;
        }
        if (!((t.type === 'op' || t.type === 'id') && BIN[t.v])) break;
        var bp = BIN[t.v];
        if (bp[0] < minBp) break;
        c.next();
        var right = expr(c, bp[1]);
        left = { k: 'bin', op: CMP[t.v] || t.v, a: left, b: right, line: t.line };
      }
      return left;
    }

    function condition(c) {
      var e = expr(c, 0);
      var logical = e.k === 'not' || e.k === 'initial' || (e.k === 'bin' && (CMP[e.op] || e.op === 'AND' || e.op === 'OR'));
      if (!logical) throw new SyntaxErr(e.line || c.line, 'Logical expression expected (for example a = b).');
      c.end();
      return e;
    }

    function kwOf(s) { return s.toks[0].type === 'id' ? s.toks[0].v : null; }

    function block(ends, opener) {
      var nodes = [];
      while (pos < stmts.length) {
        var s = stmts[pos], kw = kwOf(s);
        if (ends.indexOf(kw) >= 0) return { nodes: nodes, end: kw, stmt: s };
        pos++;
        var node = statement(s, kw);
        if (node) nodes.push(node);
      }
      if (opener) throw new SyntaxErr(opener.line, '"' + opener.kw + '" is not closed with "' + opener.close + '".');
      return { nodes: nodes };
    }

    function declaration(c, isConst) {
      var nameTok = c.peek();
      var name = c.next().v;
      var d = { name: name, type: null, len: null, dec: 0, like: null, value: null, line: nameTok.line };
      if (c.isOp('(') && c.peek().adj) {
        c.next();
        var lt = c.next();
        if (!lt || lt.type !== 'num') c.err('Length expected.');
        d.len = lt.v;
        c.expectOp(')');
      }
      if (c.isKw('TYPE')) {
        c.next();
        var tt = c.next();
        if (!tt || tt.type !== 'id' || !TYPES[tt.v]) c.err('Type "' + (tt ? show(tt) : '') + '" is unknown (supported: i p f c n d t string).');
        d.type = tt.v;
        if (c.isKw('LENGTH')) { c.next(); var l2 = c.next(); if (!l2 || l2.type !== 'num') c.err('Length expected.'); d.len = l2.v; }
        if (c.isKw('DECIMALS')) { c.next(); var dt = c.next(); if (!dt || dt.type !== 'num') c.err('Number of decimals expected.'); d.dec = dt.v; }
      } else if (c.isKw('LIKE')) {
        c.next();
        d.like = field(c);
      }
      if (c.isKw('VALUE')) {
        c.next();
        var negLit = c.isOp('-');
        if (negLit) c.next();
        d.value = operand(c);
        if (d.value.k !== 'lit') throw new SyntaxErr(d.value.line, 'VALUE needs a literal.');
        if (negLit) d.value = { k: 'neg', a: d.value, line: d.value.line };
      } else if (isConst) {
        c.err('CONSTANTS needs a VALUE.');
      }
      c.end();
      if (!d.type && !d.like) d.type = 'C';
      if (d.type === 'C' || d.type === 'N') d.len = d.len || 1;
      if (d.type === 'P') d.len = d.len || 8;
      decls.push(d);
      return null;
    }

    function statement(s, kw) {
      var c = cursor(s), t0 = s.toks[0], node, e;
      if (!kw) throw new SyntaxErr(s.line, 'Unexpected "' + show(t0) + '".');

      /* Assignment: target = expr (also += -= *= /=). */
      var t1 = s.toks[1];
      if (t1 && t1.type === 'op' && /^[-+*/]?=$/.test(t1.v) && !(kw === 'DATA' || kw === 'CONSTANTS')) {
        var target = field(c, true);
        var op = c.next().v;
        e = expr(c, 0);
        c.end();
        if (op !== '=') e = { k: 'bin', op: op[0], a: { k: 'var', name: target, line: s.line }, b: e, line: s.line };
        return { k: 'assign', name: target, e: e, line: s.line };
      }

      if (CLOSERS[kw]) throw new SyntaxErr(s.line, 'Unexpected "' + kw + '" (no open block for it).');
      c.next();

      switch (kw) {
        case 'REPORT':
        case 'PROGRAM':
          var pn = c.next();
          if (!pn || pn.type !== 'id') c.err('Program name expected.');
          program = pn.v;
          c.end();
          return null;

        case 'DATA':
        case 'CONSTANTS':
          return declaration(c, kw === 'CONSTANTS');

        case 'WRITE':
          var items = [];
          while (!c.done()) {
            if (c.isOp('/')) { c.next(); items.push({ nl: true }); }
            else items.push({ e: operand(c) });
          }
          return { k: 'write', items: items, line: s.line };

        case 'ULINE':
        case 'NEW-LINE':
          c.end();
          return { k: kw === 'ULINE' ? 'uline' : 'newline', line: s.line };

        case 'SKIP':
          var cnt = 1;
          if (!c.done()) { var st = c.next(); if (st.type !== 'num') c.err('Number expected.'); cnt = st.v; }
          c.end();
          return { k: 'skip', n: cnt, line: s.line };

        case 'IF':
          var branches = [], elseBody = null, opener = { line: s.line, kw: 'IF', close: 'ENDIF' };
          var cond = condition(c), b = block(['ELSEIF', 'ELSE', 'ENDIF'], opener);
          branches.push({ cond: cond, body: b.nodes });
          while (b.end === 'ELSEIF') {
            var ec = cursor(b.stmt); ec.next(); pos++;
            cond = condition(ec);
            b = block(['ELSEIF', 'ELSE', 'ENDIF'], opener);
            branches.push({ cond: cond, body: b.nodes });
          }
          if (b.end === 'ELSE') {
            var elc = cursor(b.stmt); elc.next(); elc.end(); pos++;
            b = block(['ENDIF'], opener);
            elseBody = b.nodes;
          }
          pos++;
          return { k: 'if', branches: branches, els: elseBody, line: s.line };

        case 'DO':
          var times = null;
          if (!c.done()) { times = expr(c, 0); c.expectKw('TIMES'); c.end(); }
          loopDepth++;
          var db = block(['ENDDO'], { line: s.line, kw: 'DO', close: 'ENDDO' });
          loopDepth--; pos++;
          return { k: 'do', times: times, body: db.nodes, line: s.line };

        case 'WHILE':
          var wc = condition(c);
          loopDepth++;
          var wb = block(['ENDWHILE'], { line: s.line, kw: 'WHILE', close: 'ENDWHILE' });
          loopDepth--; pos++;
          return { k: 'while', cond: wc, body: wb.nodes, line: s.line };

        case 'CASE':
          var subject = expr(c, 0);
          c.end();
          var whens = [], others = null, copener = { line: s.line, kw: 'CASE', close: 'ENDCASE' };
          if (pos >= stmts.length) throw new SyntaxErr(s.line, '"CASE" is not closed with "ENDCASE".');
          for (;;) {
            var ws = stmts[pos], wk = kwOf(ws);
            if (wk === 'ENDCASE') { pos++; break; }
            if (wk !== 'WHEN') throw new SyntaxErr(ws.line, 'Only WHEN is allowed directly after CASE.');
            pos++;
            var w = cursor(ws); w.next();
            if (w.isKw('OTHERS')) {
              w.next(); w.end();
              others = block(['WHEN', 'ENDCASE'], copener).nodes;
            } else {
              var vals = [operand(w)];
              while (w.isKw('OR')) { w.next(); vals.push(operand(w)); }
              w.end();
              whens.push({ vals: vals, body: block(['WHEN', 'ENDCASE'], copener).nodes });
            }
          }
          return { k: 'case', subject: subject, whens: whens, others: others, line: s.line };

        case 'EXIT':
        case 'CONTINUE':
          c.end();
          if (kw === 'CONTINUE' && !loopDepth) throw new SyntaxErr(s.line, 'CONTINUE is only allowed inside a loop.');
          return { k: kw.toLowerCase(), inLoop: loopDepth > 0, line: s.line };

        case 'CHECK':
          return { k: 'check', cond: condition(c), inLoop: loopDepth > 0, line: s.line };

        case 'CLEAR':
          var names = [];
          while (!c.done()) names.push(field(c, true));
          if (!names.length) c.err('Field name expected.');
          return { k: 'clear', names: names, line: s.line };

        case 'CONCATENATE':
          var parts = [];
          while (!c.done() && !c.isKw('INTO')) parts.push(operand(c));
          if (!parts.length) c.err('Operands expected.');
          c.expectKw('INTO');
          var into = field(c, true), sep = null;
          if (c.isKw('SEPARATED')) { c.next(); c.expectKw('BY'); sep = operand(c); }
          c.end();
          return { k: 'concat', parts: parts, into: into, sep: sep, line: s.line };

        case 'ADD':
        case 'SUBTRACT':
        case 'MULTIPLY':
        case 'DIVIDE':
          var x, y, sym;
          if (kw === 'ADD' || kw === 'SUBTRACT') {
            x = expr(c, 11); c.expectKw(kw === 'ADD' ? 'TO' : 'FROM'); y = field(c, true);
            sym = kw === 'ADD' ? '+' : '-';
          } else {
            y = field(c, true); c.expectKw('BY'); x = expr(c, 11);
            sym = kw === 'MULTIPLY' ? '*' : '/';
          }
          c.end();
          return { k: 'assign', name: y, e: { k: 'bin', op: sym, a: { k: 'var', name: y, line: s.line }, b: x, line: s.line }, line: s.line };

        case 'TRANSLATE':
          var tf = field(c, true);
          c.expectKw('TO');
          var up = c.isKw('UPPER');
          if (!up && !c.isKw('LOWER')) c.err('"UPPER" or "LOWER" expected.');
          c.next(); c.expectKw('CASE'); c.end();
          return { k: 'assign', name: tf, e: { k: 'call', fn: up ? 'TO_UPPER' : 'TO_LOWER', a: { k: 'var', name: tf, line: s.line }, line: s.line }, line: s.line };

        case 'CONDENSE':
          var cf = field(c, true), nogaps = false;
          if (c.isKw('NO-GAPS')) { c.next(); nogaps = true; }
          c.end();
          return { k: 'condense', name: cf, nogaps: nogaps, line: s.line };

        default:
          throw new SyntaxErr(s.line, 'Statement "' + kw + '" is not defined. Check your spelling.');
      }
    }

    var top = block([]);
    return { program: program, decls: decls, nodes: top.nodes };
  }

  /* ----------------------------------------------------------- runtime */

  function ExitLoop() {}
  function NextLoop() {}
  function LeaveProgram() {}

  function pad2(x) { return (x < 10 ? '0' : '') + x; }

  function roundHalfAway(n, dec) {
    var f = Math.pow(10, dec);
    return Math.sign(n) * Math.round(Number((Math.abs(n) * f).toFixed(6))) / f;
  }

  function grouped(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* WRITE output of a number: thousand separators, sign on the right. */
  function fmtNumber(n, dec, width) {
    var abs = Math.abs(n).toFixed(dec).split('.');
    var s = grouped(abs[0]) + (abs[1] ? '.' + abs[1] : '') + (n < 0 ? '-' : ' ');
    return s.length < width ? new Array(width - s.length + 1).join(' ') + s : s;
  }

  function run(src, opts) {
    opts = opts || {};
    var prog;
    try {
      prog = compile(src);
    } catch (e) {
      if (e instanceof SyntaxErr) return { program: null, lines: [], error: e };
      throw e;
    }

    var now = opts.now || new Date();
    var vars = {};
    vars['SY-INDEX'] = { type: 'I', v: 0 };
    vars['SY-DATUM'] = { type: 'D', v: '' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) };
    vars['SY-UZEIT'] = { type: 'T', v: pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) };
    vars['SY-UNAME'] = { type: 'C', len: 12, v: opts.user || 'BCUSER' };

    var lines = [], cur = '', lineOpen = false, steps = 0;

    function step(line) {
      if (++steps > MAX_STEPS || lines.length > MAX_LINES) {
        throw new Dump(line, 'TIME_OUT', 'The program exceeded the maximum permitted runtime.');
      }
    }

    function flush() {
      if (lineOpen) lines.push(cur);
      cur = '';
      lineOpen = false;
    }

    function num(v, line) {
      if (typeof v === 'number') return v;
      var s = String(v).trim();
      if (s === '') return 0;
      if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
      if (/^\d+(\.\d+)?-$/.test(s)) return -Number(s.slice(0, -1));
      throw new Dump(line, 'CONVT_NO_NUMBER', 'Unable to interpret "' + s + '" as a number.');
    }

    function str(v) { return typeof v === 'number' ? String(v) : v; }

    function isNumeric(v) { return typeof v === 'number' || /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v); }

    function convert(d, v, line) {
      switch (d.type) {
        case 'I':
          var r = roundHalfAway(num(v, line), 0);
          if (Math.abs(r) > 2147483647) throw new Dump(line, 'COMPUTE_INT_PLUS_OVERFLOW', 'Integer overflow: the value does not fit in type i.');
          return r;
        case 'P': return roundHalfAway(num(v, line), d.dec);
        case 'F': return num(v, line);
        case 'N':
          var digits = String(Math.abs(roundHalfAway(num(v, line), 0)));
          return (new Array(d.len + 1).join('0') + digits).slice(-d.len);
        case 'C': return str(v).slice(0, d.len).replace(/\s+$/, '');
        default: return str(v);
      }
    }

    function initial(d) {
      if (d.type === 'I' || d.type === 'P' || d.type === 'F') return 0;
      if (d.type === 'N') return new Array(d.len + 1).join('0');
      if (d.type === 'D') return '00000000';
      if (d.type === 'T') return '000000';
      return '';
    }

    function assign(name, v, line) { vars[name].v = convert(vars[name], v, line); }

    function cmp(a, b) {
      if ((typeof a === 'number' || typeof b === 'number') && isNumeric(a) && isNumeric(b)) {
        a = Number(a); b = Number(b);
      } else {
        a = str(a).replace(/\s+$/, ''); b = str(b).replace(/\s+$/, '');
      }
      return a < b ? -1 : a > b ? 1 : 0;
    }

    function arith(op, a, b, line) {
      a = num(a, line); b = num(b, line);
      if ((op === '/' || op === 'DIV' || op === 'MOD') && b === 0) {
        if (a === 0 && op === '/') return 0; /* ABAP really does say 0 / 0 = 0 */
        throw new Dump(line, 'COMPUTE_INT_ZERODIVIDE', 'Division by zero.');
      }
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '**': return Math.pow(a, b);
        default:
          var m = Math.abs(b), r = ((a % m) + m) % m; /* ABAP MOD is never negative */
          return op === 'MOD' ? r : (a - r) / b;
      }
    }

    function evalE(e) {
      switch (e.k) {
        case 'lit': return e.v;
        case 'var': return vars[e.name].v;
        case 'tpl':
          return e.parts.map(function (p) { return 'text' in p ? p.text : str(evalE(p.expr)); }).join('');
        case 'call':
          var a = evalE(e.a);
          if (e.fn === 'STRLEN') return str(a).replace(/\s+$/, '').length;
          if (e.fn === 'TO_UPPER') return str(a).toUpperCase();
          if (e.fn === 'TO_LOWER') return str(a).toLowerCase();
          return Math.abs(num(a, e.line));
        case 'neg': return -num(evalE(e.a), e.line);
        case 'not': return !evalE(e.a);
        case 'initial':
          var v = evalE(e.a), init = v === 0 || v === '' || /^0+$/.test(String(v));
          return e.neg ? !init : init;
        case 'bin':
          if (e.op === 'AND') return evalE(e.a) && evalE(e.b);
          if (e.op === 'OR') return evalE(e.a) || evalE(e.b);
          var l = evalE(e.a), r = evalE(e.b);
          if (e.op === '&&') return str(l) + str(r);
          if (CMP[e.op]) {
            var c = cmp(l, r);
            return e.op === '=' ? c === 0 : e.op === '<>' ? c !== 0 : e.op === '<' ? c < 0
              : e.op === '>' ? c > 0 : e.op === '<=' ? c <= 0 : c >= 0;
          }
          return arith(e.op, l, r, e.line);
      }
      throw new Error('unknown node ' + e.k);
    }

    function writeText(e) {
      if (e.k === 'var') {
        var d = vars[e.name], v = d.v;
        switch (d.type) {
          case 'I': return fmtNumber(v, 0, 11);
          case 'P': return fmtNumber(v, d.dec, d.len * 2);
          case 'F':
            var m = v.toExponential(16).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2');
            return (v < 0 ? '' : ' ') + m;
          case 'C': return (v + new Array(d.len + 1).join(' ')).slice(0, d.len);
          case 'D': return v.slice(6, 8) + '.' + v.slice(4, 6) + '.' + v.slice(0, 4);
          case 'T': return v.slice(0, 2) + ':' + v.slice(2, 4) + ':' + v.slice(4, 6);
          default: return v;
        }
      }
      var r = evalE(e);
      if (typeof r === 'number') return Number.isInteger(r) && (e.k === 'lit' || e.k === 'call') ? fmtNumber(r, 0, 11) : String(r);
      return r;
    }

    function loop(node, more) {
      var saved = vars['SY-INDEX'].v, i = 0;
      try {
        while (more(i)) {
          step(node.line);
          vars['SY-INDEX'].v = ++i;
          try { exec(node.body); } catch (x) {
            if (x instanceof ExitLoop) break;
            if (!(x instanceof NextLoop)) throw x;
          }
        }
      } finally {
        vars['SY-INDEX'].v = saved;
      }
    }

    function exec(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        step(n.line);
        switch (n.k) {
          case 'assign': assign(n.name, evalE(n.e), n.line); break;
          case 'write':
            n.items.forEach(function (it) {
              if (it.nl) { flush(); return; }
              var text = writeText(it.e);
              if (lineOpen) cur += ' ';
              cur += text;
              lineOpen = true;
            });
            break;
          case 'newline': flush(); break;
          case 'uline': flush(); lines.push(new Array(ULINE_WIDTH + 1).join('-')); break;
          case 'skip': flush(); for (var s = 0; s < n.n; s++) lines.push(''); break;
          case 'if':
            var done = false;
            for (var b = 0; b < n.branches.length && !done; b++) {
              if (evalE(n.branches[b].cond)) { exec(n.branches[b].body); done = true; }
            }
            if (!done && n.els) exec(n.els);
            break;
          case 'do':
            var times = n.times ? num(evalE(n.times), n.line) : Infinity;
            loop(n, function (k) { return k < times; });
            break;
          case 'while':
            loop(n, function () { return evalE(n.cond); });
            break;
          case 'case':
            var subj = evalE(n.subject), hit = null;
            for (var w = 0; w < n.whens.length && !hit; w++) {
              for (var v = 0; v < n.whens[w].vals.length; v++) {
                if (cmp(subj, evalE(n.whens[w].vals[v])) === 0) { hit = n.whens[w].body; break; }
              }
            }
            hit = hit || n.others;
            if (hit) exec(hit);
            break;
          case 'exit': throw n.inLoop ? new ExitLoop() : new LeaveProgram();
          case 'continue': throw new NextLoop();
          case 'check':
            if (!evalE(n.cond)) throw n.inLoop ? new NextLoop() : new LeaveProgram();
            break;
          case 'clear':
            n.names.forEach(function (name) { vars[name].v = initial(vars[name]); });
            break;
          case 'concat':
            var sep = n.sep ? str(evalE(n.sep)) : '';
            var joined = n.parts.map(function (p) { return str(evalE(p)).replace(/\s+$/, ''); }).join(sep);
            assign(n.into, joined, n.line);
            break;
          case 'condense':
            var cv = str(vars[n.name].v);
            assign(n.name, n.nogaps ? cv.replace(/\s+/g, '') : cv.trim().replace(/\s+/g, ' '), n.line);
            break;
        }
      }
    }

    try {
      prog.decls.forEach(function (d) {
        var decl = d.like ? Object.assign({}, vars[d.like]) : { type: d.type, len: d.len, dec: d.dec };
        decl.v = initial(decl);
        vars[d.name] = decl;
        if (d.value) decl.v = convert(decl, evalE(d.value), d.line);
      });
      exec(prog.nodes);
    } catch (x) {
      if (x instanceof Dump) { flush(); return { program: prog.program, lines: lines, error: x }; }
      if (!(x instanceof LeaveProgram) && !(x instanceof ExitLoop) && !(x instanceof NextLoop)) throw x;
    }
    flush();
    return { program: prog.program, lines: lines, error: null };
  }

  function check(src) {
    try { return { program: compile(src).program, error: null }; } catch (e) {
      if (e instanceof SyntaxErr) return { program: null, error: e };
      throw e;
    }
  }

  var api = { run: run, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABAP = api;
})(this);
