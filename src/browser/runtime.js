const { CONNECTION_MODES, canUseMode, clearSensitiveConnectionFields } = require('./mode.js');
const { selectAdapter } = require('./adapter-selector.js');
const { createProxyStorage } = require('./proxy-storage.js');
const { createDirectStorage } = require('./direct-storage.js');

function createBrowserRuntime() {
  function createProxyAdapter() {
    return createProxyStorage({
      fetchImpl: window.fetch.bind(window),
      XMLHttpRequestImpl: window.XMLHttpRequest,
      sessionStore: window.sessionStorage
    });
  }

  async function createDirectAdapter() {
    const s3 = await import('@aws-sdk/client-s3');
    const signer = await import('@aws-sdk/s3-request-presigner');

    return createDirectStorage({
      createClient: (options) => new s3.S3Client(options),
      commands: {
        ListObjectsV2Command: s3.ListObjectsV2Command,
        GetObjectCommand: s3.GetObjectCommand,
        PutObjectCommand: s3.PutObjectCommand
      },
      getSignedUrl: signer.getSignedUrl,
      fetchImpl: window.fetch.bind(window)
    });
  }

  return {
    CONNECTION_MODES,
    canUseMode,
    clearSensitiveConnectionFields,
    selectAdapter,
    createProxyAdapter,
    createDirectAdapter
  };
}

module.exports = { createBrowserRuntime };
