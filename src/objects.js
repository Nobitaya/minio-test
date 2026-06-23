function safeFileName(fileName) {
  const baseName = String(fileName || 'upload')
    .split(/[\\/]/)
    .pop()
    .normalize('NFKD');
  const safeName = baseName
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);

  return safeName || 'upload';
}

function makeObjectName(fileName, { now = new Date(), id = crypto.randomUUID() } = {}) {
  const timestamp = now.toISOString().replace(/[.:]/g, '-');

  return `uploads/${timestamp}-${id}-${safeFileName(fileName)}`;
}

module.exports = { makeObjectName };
