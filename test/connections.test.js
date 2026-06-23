const test = require('node:test');
const assert = require('node:assert/strict');
const { createConnectionStore } = require('../src/connections.js');

const config = {
  endpoint: { host: '192.168.31.129', port: 9000, useSSL: false },
  bucket: 'test-upload',
  accessKey: 'test-web-access-key',
  secretKey: 'test-web-secret-key',
  maxUploadBytes: 52_428_800
};

test('returns a newly stored connection before it expires', () => {
  let now = 1_000;
  const store = createConnectionStore({
    ttlMs: 1_000,
    now: () => now,
    createToken: () => 'connection-token'
  });

  const token = store.create(config);

  assert.equal(token, 'connection-token');
  assert.deepEqual(store.get(token), config);
  now = 2_001;
  assert.equal(store.get(token), undefined);
});
