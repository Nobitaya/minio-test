const { CONNECTION_MODES, canUseMode } = require('./mode.js');

async function selectAdapter(mode, environment, factories) {
  if (!canUseMode(mode, environment)) {
    throw new Error('服务端代理模式需要在 Docker/Express 部署中使用。');
  }

  return mode === CONNECTION_MODES.DIRECT ? factories.direct() : factories.proxy();
}

module.exports = { selectAdapter };
