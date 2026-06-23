const test = require('node:test');
const assert = require('node:assert/strict');
const { readCookie } = require('../src/cookies.js');

test('reads an encoded session token from a Cookie header', () => {
  assert.equal(
    readCookie('theme=dark; minio_test_session=token%2Fvalue; locale=zh-CN', 'minio_test_session'),
    'token/value'
  );
});

test('returns undefined when a Cookie header does not contain the requested name', () => {
  assert.equal(readCookie('theme=dark', 'minio_test_session'), undefined);
});
