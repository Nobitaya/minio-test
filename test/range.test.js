const test = require('node:test');
const assert = require('node:assert/strict');
const { parseByteRange } = require('../src/range.js');

test('parses a bounded HTTP byte range for video seeking', () => {
  assert.deepEqual(parseByteRange('bytes=100-499', 1_000), {
    start: 100,
    end: 499,
    length: 400
  });
});

test('parses an open-ended HTTP byte range', () => {
  assert.deepEqual(parseByteRange('bytes=900-', 1_000), {
    start: 900,
    end: 999,
    length: 100
  });
});

test('rejects a range outside the object size', () => {
  assert.equal(parseByteRange('bytes=1000-', 1_000), undefined);
});
