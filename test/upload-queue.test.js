const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadSequentially } = require('../public/upload-queue.js');

test('uploads files in selection order', async () => {
  const calls = [];
  const result = await uploadSequentially(['one', 'two'], async (file) => {
    calls.push(file);
    return `${file}-ok`;
  });

  assert.deepEqual(calls, ['one', 'two']);
  assert.deepEqual(result.successes, [
    { file: 'one', value: 'one-ok' },
    { file: 'two', value: 'two-ok' }
  ]);
  assert.deepEqual(result.failures, []);
});

test('continues after one upload fails and reports its error', async () => {
  const result = await uploadSequentially(['bad', 'good'], async (file) => {
    if (file === 'bad') throw new Error('network unavailable');
    return 'uploaded';
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures[0].file, 'bad');
  assert.equal(result.failures[0].error.message, 'network unavailable');
});
