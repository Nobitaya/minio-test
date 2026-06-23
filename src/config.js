function required(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    const error = new Error(`${name} is required`);
    error.status = 400;
    throw error;
  }

  return value;
}

function getConfig(env = process.env) {
  const endpointUrl = new URL(required(env, 'MINIO_ENDPOINT'));

  if (!['http:', 'https:'].includes(endpointUrl.protocol)) {
    const error = new Error('MINIO_ENDPOINT must use http or https');
    error.status = 400;
    throw error;
  }

  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 52_428_800);

  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    const error = new Error('MAX_UPLOAD_BYTES must be a positive integer');
    error.status = 400;
    throw error;
  }

  return {
    endpoint: {
      host: endpointUrl.hostname,
      port: Number(endpointUrl.port || (endpointUrl.protocol === 'https:' ? 443 : 80)),
      useSSL: endpointUrl.protocol === 'https:'
    },
    bucket: required(env, 'MINIO_BUCKET'),
    accessKey: required(env, 'MINIO_ACCESS_KEY'),
    secretKey: required(env, 'MINIO_SECRET_KEY'),
    maxUploadBytes
  };
}

module.exports = { getConfig };
