function readCookie(header, name) {
  const prefix = `${name}=`;

  for (const part of String(header || '').split(';')) {
    const value = part.trim();

    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }

  return undefined;
}

module.exports = { readCookie };
