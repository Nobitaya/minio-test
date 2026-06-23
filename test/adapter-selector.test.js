const test = require('node:test');
const assert = require('node:assert/strict');
const { selectAdapter } = require('../src/browser/adapter-selector.js');

test('selects the requested adapter and rejects unavailable proxy mode', async () => {
  const factories = {
    proxy: () => ({ kind: 'proxy' }),
    direct: () => ({ kind: 'direct' })
  };

  assert.equal((await selectAdapter('direct', { hasProxyApi: false }, factories)).kind, 'direct');
  await assert.rejects(() => selectAdapter('proxy', { hasProxyApi: false }, factories), /Docker\/Express/);
});
