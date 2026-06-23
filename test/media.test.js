const test = require('node:test');
const assert = require('node:assert/strict');
const { previewStrategy } = require('../public/media.js');

test('classifies native images and browser-side conversion formats', () => {
  assert.equal(previewStrategy('photo.JPEG'), 'native-image');
  assert.equal(previewStrategy('favicon.ico'), 'native-image');
  assert.equal(previewStrategy('iphone.heic'), 'heic');
  assert.equal(previewStrategy('scan.HEIF'), 'heic');
  assert.equal(previewStrategy('archive.tiff'), 'tiff');
  assert.equal(previewStrategy('fax.TIF'), 'tiff');
});

test('separates videos and unsupported formats', () => {
  assert.equal(previewStrategy('clip.webm'), 'video');
  assert.equal(previewStrategy('design.psd'), 'unsupported');
});
