const test = require('node:test');
const assert = require('node:assert/strict');
const { createProxyStorage } = require('../src/browser/proxy-storage.js');

test('keeps the opaque proxy session outside connection credentials', async () => {
  const calls = [];
  const session = new Map();
  const storage = createProxyStorage({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/connect') {
        return { ok: true, json: async () => ({ sessionToken: 'opaque-token', bucket: 'test-upload', objectCount: 1 }) };
      }
      return { ok: true, json: async () => ({ files: [] }) };
    },
    XMLHttpRequestImpl: class {},
    sessionStore: { getItem: (key) => session.get(key), setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) }
  });

  await storage.connect({ endpoint: 'https://s3.example.com', bucket: 'test-upload', accessKey: 'key', secretKey: 'secret' });
  await storage.listFiles();

  assert.equal(session.get('minio-test-session'), 'opaque-token');
  assert.equal(calls[1].options.headers['X-Test-Session'], 'opaque-token');
  assert.equal(calls[0].options.body.includes('secret'), true);
});

test('generates same-origin preview and download URLs', () => {
  const storage = createProxyStorage({ fetchImpl: async () => ({}), XMLHttpRequestImpl: class {}, sessionStore: { getItem: () => '' } });

  assert.equal(storage.getPreviewUrl({ name: 'uploads/photo.jpg' }), '/api/download?name=uploads%2Fphoto.jpg');
  assert.equal(storage.getDownloadUrl({ name: 'uploads/photo.jpg' }), '/api/download?name=uploads%2Fphoto.jpg&download=1');
});
