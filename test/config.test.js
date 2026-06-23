const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../src/config.js');

const validEnv = {
  MINIO_ENDPOINT: 'http://192.168.31.129:9000',
  MINIO_BUCKET: 'test-upload',
  MINIO_ACCESS_KEY: 'test-web-access-key',
  MINIO_SECRET_KEY: 'test-web-secret-key'
};

test('parses an HTTP MinIO endpoint and applies the 50 MiB upload limit', () => {
  const config = getConfig(validEnv);

  assert.equal(config.endpoint.host, '192.168.31.129');
  assert.equal(config.endpoint.port, 9000);
  assert.equal(config.endpoint.useSSL, false);
  assert.equal(config.bucket, 'test-upload');
  assert.equal(config.maxUploadBytes, 52_428_800);
});

test('rejects an absent MinIO secret key', () => {
  assert.throws(
    () => getConfig({ ...validEnv, MINIO_SECRET_KEY: '' }),
    /MINIO_SECRET_KEY is required/
  );
});

test('rejects a non-HTTP MinIO endpoint', () => {
  assert.throws(
    () => getConfig({ ...validEnv, MINIO_ENDPOINT: 'ftp://192.168.31.129' }),
    /MINIO_ENDPOINT must use http or https/
  );
});
