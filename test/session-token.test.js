const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionTokenFromRequest } = require('../src/server.js');

test('uses the request header before the HttpOnly browser cookie', () => {
  const request = {
    get(name) {
      return name === 'X-Test-Session' ? 'header-token' : 'minio_test_session=cookie-token';
    }
  };

  assert.equal(sessionTokenFromRequest(request), 'header-token');
});

test('uses the browser cookie when a media request cannot provide a custom header', () => {
  const request = {
    get(name) {
      return name === 'Cookie' ? 'theme=dark; minio_test_session=cookie-token' : undefined;
    }
  };

  assert.equal(sessionTokenFromRequest(request), 'cookie-token');
});
