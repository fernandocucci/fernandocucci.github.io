/* Sample Z programs for the SE38 page. Each one must pass _tests/abap_test.js. */

(function (root) {
  'use strict';

  var SAMPLES = [
    {
      name: 'ZHELLO_WORLD',
      text: 'Hello World',
      src: [
        'REPORT zhello_world.',
        '',
        '* Press F8 (or the Execute button) to run the program.',
        "WRITE 'Hello, World!'."
      ]
    },
    {
      name: 'ZMULTI_TABLE',
      text: 'Multiplication table with DO and sy-index',
      src: [
        'REPORT zmulti_table.',
        '',
        'DATA lv_n TYPE i VALUE 7.',
        '',
        'WRITE / |Multiplication table of { lv_n }|.',
        'ULINE.',
        'DO 10 TIMES.',
        '  WRITE / |{ lv_n } x { sy-index } = { lv_n * sy-index }|.',
        'ENDDO.'
      ]
    },
    {
      name: 'ZFIZZBUZZ',
      text: 'FizzBuzz with IF, ELSEIF and MOD',
      src: [
        'REPORT zfizzbuzz.',
        '',
        'DO 15 TIMES.',
        '  IF sy-index MOD 15 = 0.',
        "    WRITE / 'FizzBuzz'.",
        '  ELSEIF sy-index MOD 3 = 0.',
        "    WRITE / 'Fizz'.",
        '  ELSEIF sy-index MOD 5 = 0.',
        "    WRITE / 'Buzz'.",
        '  ELSE.',
        '    WRITE / sy-index.',
        '  ENDIF.',
        'ENDDO.'
      ]
    },
    {
      name: 'ZWEEKDAYS',
      text: 'CASE with WHEN ... OR and WHEN OTHERS',
      src: [
        'REPORT zweekdays.',
        '',
        'DATA lv_day TYPE i.',
        '',
        'DO 7 TIMES.',
        '  lv_day = sy-index.',
        '  CASE lv_day.',
        '    WHEN 6 OR 7.',
        "      WRITE / |Day { lv_day }: weekend|.",
        '    WHEN OTHERS.',
        "      WRITE / |Day { lv_day }: working day|.",
        '  ENDCASE.',
        'ENDDO.'
      ]
    },
    {
      name: 'ZSTRINGS',
      text: 'CONCATENATE, TRANSLATE and strlen( )',
      src: [
        'REPORT zstrings.',
        '',
        "DATA: lv_first TYPE string VALUE 'ada',",
        "      lv_last  TYPE string VALUE 'lovelace',",
        '      lv_full  TYPE string.',
        '',
        'CONCATENATE lv_first lv_last INTO lv_full SEPARATED BY ` `.',
        'TRANSLATE lv_full TO UPPER CASE.',
        '',
        'WRITE / lv_full.',
        'WRITE / |Length: { strlen( lv_full ) } characters|.',
        'WRITE / |Today is { sy-datum }, user { sy-uname }|.'
      ]
    },
    {
      name: 'ZSHORT_DUMP',
      text: 'Ends in a short dump on purpose',
      src: [
        'REPORT zshort_dump.',
        '',
        '* This program divides by zero on purpose.',
        'DATA: lv_total TYPE i VALUE 100,',
        '      lv_count TYPE i.',
        '',
        "WRITE / 'Computing the average...'.",
        'lv_total = lv_total / lv_count.',
        'WRITE / lv_total.'
      ]
    }
  ].map(function (s) { return { name: s.name, text: s.text, src: s.src.join('\n') }; });

  if (typeof module !== 'undefined' && module.exports) module.exports = SAMPLES;
  else root.ABAP_SAMPLES = SAMPLES;
})(this);
