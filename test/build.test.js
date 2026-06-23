const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

test('builds a static Netlify site with the runtime and media converters', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'minio-test-web-build-'));

  try {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', '--out', outputDirectory, '--target', 'netlify'], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outputDirectory, 'index.html')), true);
    assert.equal(existsSync(join(outputDirectory, 'assets', 'runtime.js')), true);
    assert.equal(existsSync(join(outputDirectory, 'vendor', 'heic2any', 'heic2any.js')), true);
    assert.equal(existsSync(join(outputDirectory, 'vendor', 'utif2', 'UTIF.js')), true);
    assert.equal(existsSync(join(outputDirectory, 'vendor', 'pako', 'pako.min.js')), true);
    assert.match(readFileSync(join(outputDirectory, 'index.html'), 'utf8'), /__MINIO_TEST_HAS_PROXY_API__ = 'false'/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
