const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.join(__dirname, '..', 'public');
const indexHtml = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');

test('loads batch-upload modules and allows selecting multiple files', () => {
  assert.match(indexHtml, /<input id="file-input" type="file" multiple \/>/);
  assert.match(indexHtml, /<script src="\/media\.js"><\/script>/);
  assert.match(indexHtml, /<script src="\/upload-queue\.js"><\/script>/);
});

test('uses the sequential queue and reports upload results', () => {
  assert.match(appJs, /function setPendingFiles\(files/);
  assert.match(appJs, /UploadQueue\.uploadSequentially/);
  assert.match(appJs, /upload-result/);
});

test('loads converters locally and has a fallback preview message', () => {
  assert.match(appJs, /\/vendor\/heic2any\/heic2any\.js/);
  assert.match(appJs, /\/vendor\/pako\/pako\.min\.js/);
  assert.match(appJs, /\/vendor\/utif2\/UTIF\.js/);
  assert.match(appJs, /当前浏览器无法预览此文件/);
});
