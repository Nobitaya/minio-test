function createConnectionStore({
  ttlMs = 60 * 60 * 1000,
  now = () => Date.now(),
  createToken = () => crypto.randomUUID()
} = {}) {
  const connections = new Map();

  function create(config) {
    const token = createToken();

    connections.set(token, { config, expiresAt: now() + ttlMs });
    return token;
  }

  function get(token) {
    const connection = connections.get(token);

    if (!connection) {
      return undefined;
    }

    if (connection.expiresAt <= now()) {
      connections.delete(token);
      return undefined;
    }

    return connection.config;
  }

  function remove(token) {
    connections.delete(token);
  }

  return { create, get, remove };
}

module.exports = { createConnectionStore };
