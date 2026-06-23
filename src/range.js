function parseByteRange(header, size) {
  if (!header || !Number.isSafeInteger(size) || size <= 0) {
    return undefined;
  }

  const match = /^bytes=(\d+)-(\d*)$/i.exec(header.trim());

  if (!match) {
    return undefined;
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return undefined;
  }

  return { start, end, length: end - start + 1 };
}

module.exports = { parseByteRange };
