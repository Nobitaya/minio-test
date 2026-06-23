const CONNECTION_MODES = Object.freeze({
  PROXY: 'proxy',
  DIRECT: 'direct'
});

function canUseMode(mode, { hasProxyApi }) {
  return mode === CONNECTION_MODES.DIRECT || (mode === CONNECTION_MODES.PROXY && hasProxyApi);
}

function clearSensitiveConnectionFields(connection) {
  return { ...connection, accessKey: '', secretKey: '' };
}

module.exports = { CONNECTION_MODES, canUseMode, clearSensitiveConnectionFields };
