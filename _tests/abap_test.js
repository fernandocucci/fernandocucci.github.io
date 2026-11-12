// Run: node _tests/abap_test.js
const assert = require('assert');
const { run, check } = require('../assets/js/abap.js');

const out = (src) => { const r = run(src, { now: new Date(2026, 10, 12, 9, 5, 7) }); if (r.error) throw new Error(r.error.kind + ' ' + r.error.line + ': ' + r.error.msg); return r.lines; };
const err = (src) => run(src).error;

// hello world
assert.deepStrictEqual(out("REPORT zhello.\nWRITE 'Hello, World!'."), ['Hello, World!']);

// chains, new lines, a blank between WRITEs on one line
assert.deepStrictEqual(out("WRITE: 'a', 'b'.\nWRITE / 'c'."), ['a b', 'c']);

// type i prints right-aligned in 11 chars, sign on the right, thousand separators
assert.deepStrictEqual(out("DATA n TYPE i VALUE -1234.\nWRITE n."), ['     1,234-']);

// DO, sy-index, arithmetic, compound assignment
assert.deepStrictEqual(out("DATA s TYPE i.\nDO 4 TIMES.\n  s += sy-index.\nENDDO.\nWRITE |{ s }|."), ['10']);

// IF / ELSEIF / ELSE, WHILE, EXIT
assert.deepStrictEqual(out(`DATA i TYPE i.
WHILE i < 100.
  i = i + 1.
  IF i = 3. EXIT. ENDIF.
ENDWHILE.
IF i > 3. WRITE 'big'. ELSEIF i = 3. WRITE 'three'. ELSE. WRITE 'small'. ENDIF.`), ['three']);

// CASE, CONCATENATE, templates, functions
assert.deepStrictEqual(out(`DATA: c TYPE string VALUE 'b', r TYPE string.
CASE c. WHEN 'a' OR 'b'. r = 'ab'. WHEN OTHERS. r = 'x'. ENDCASE.
CONCATENATE r 'cd' INTO r SEPARATED BY '-'.
WRITE |{ to_upper( r ) } has { strlen( r ) } chars|.`), ['AB-CD has 5 chars']);

// integer rounding, DIV, MOD (never negative), p with decimals
assert.deepStrictEqual(out(`DATA: i TYPE i, p TYPE p DECIMALS 2.
i = 5 / 2. p = 10 / 3.
WRITE: |{ i }|, |{ -7 DIV 2 }|, |{ -7 MOD 2 }|, / p.`), ['3 -4 1', '           3.33 ']);

// sy-datum is formatted as a date
assert.deepStrictEqual(out("WRITE sy-datum."), ['12.11.2026']);

// runtime errors
assert.strictEqual(err("DATA i TYPE i.\ni = 1 / i.").dump, 'COMPUTE_INT_ZERODIVIDE');
assert.deepStrictEqual(out("DATA i TYPE i.\ni = 0 / i.\nWRITE |{ i }|."), ['0']);
assert.strictEqual(err("DATA i TYPE i.\ni = 'abc'.").dump, 'CONVT_NO_NUMBER');
assert.strictEqual(err("DO.\nENDDO.").dump, 'TIME_OUT');

// syntax errors with line numbers
let e = check("WRITE 'a'.\nWRTE 'b'.").error;
assert.strictEqual(e.line, 2); assert.match(e.msg, /WRTE.*not defined/);
e = check("WRITE 'a'").error; assert.match(e.msg, /period missing/);
e = check("WRITE lv_x.").error; assert.match(e.msg, /"lv_x" is unknown/);
e = check("IF 1 = 1.\nWRITE 'a'.").error; assert.strictEqual(e.line, 1); assert.match(e.msg, /ENDIF/);
e = check("CONSTANTS k TYPE i VALUE 1.\nk = 2.").error; assert.match(e.msg, /cannot be changed/);

console.log('abap tests ok');

// every sample runs; only ZSHORT_DUMP dumps
for (const s of require('../assets/js/abap-samples.js')) {
  const r = run(s.src);
  if (s.name === 'ZSHORT_DUMP') assert.strictEqual(r.error && r.error.dump, 'COMPUTE_INT_ZERODIVIDE');
  else assert.strictEqual(r.error, null, s.name + ': ' + (r.error && r.error.msg));
  assert.strictEqual(r.program, s.name);
}
console.log('samples ok');
