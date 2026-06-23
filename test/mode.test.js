const test = require('node:test');
const assert = require('node:assert/strict');
const { CONNECTION_MODES, canUseMode, clearSensitiveConnectionFields } = require('../src/browser/mode.js');

test('allows proxy mode only when the page has an Express API', () => {
  assert.equal(canUseMode(CONNECTION_MODES.PROXY, { hasProxyApi: true }), true);
  assert.equal(canUseMode(CONNECTION_MODES.PROXY, { hasProxyApi: false }), false);
  assert.equal(canUseMode(CONNECTION_MODES.DIRECT, { hasProxyApi: false }), true);
});

test('clears only sensitive connection fields when switching modes', () => {
  assert.deepEqual(
    clearSensitiveConnectionFields({
      endpoint: 'https://s3.example.com',
      bucket: 'test',
      accessKey: 'access-key',
      secretKey: 'secret-key'
    }),
    {
      endpoint: 'https://s3.example.com',
      bucket: 'test',
      accessKey: '',
      secretKey: ''
    }
  );
});
