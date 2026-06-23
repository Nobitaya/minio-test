const { makeObjectName } = require('../objects.js');

function mapObject(object) {
  return {
    name: object.Key,
    size: object.Size || 0,
    lastModified: object.LastModified || new Date(0),
    etag: object.ETag
  };
}

function requireConnection(client, config) {
  if (!client || !config) {
    throw new Error('请先连接 MinIO。');
  }
}

function createDirectStorage({ createClient, commands, getSignedUrl, fetchImpl = fetch }) {
  let client;
  let config;

  async function listFiles() {
    requireConnection(client, config);
    const response = await client.send(new commands.ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: 'uploads/'
    }));

    return (response.Contents || [])
      .filter((object) => object.Key && object.Key.startsWith('uploads/'))
      .map(mapObject)
      .sort((left, right) => new Date(right.lastModified) - new Date(left.lastModified));
  }

  async function connect(connection) {
    const endpoint = new URL(connection.endpoint);

    if (endpoint.protocol !== 'https:') {
      throw new Error('浏览器直连模式要求使用 HTTPS MinIO API 地址。');
    }

    config = {
      endpoint: endpoint.toString().replace(/\/$/, ''),
      bucket: connection.bucket,
      accessKey: connection.accessKey,
      secretKey: connection.secretKey
    };
    client = createClient({
      endpoint: config.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      }
    });

    const files = await listFiles();
    return { bucket: config.bucket, objectCount: files.length };
  }

  async function upload(file, onProgress = () => {}) {
    requireConnection(client, config);
    const objectName = makeObjectName(file.name);
    onProgress({ percent: 0 });
    await client.send(new commands.PutObjectCommand({
      Bucket: config.bucket,
      Key: objectName,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
      Metadata: { 'original-name': file.name }
    }));
    onProgress({ percent: 100 });
    return { name: objectName, originalName: file.name, size: file.size };
  }

  async function signedGetUrl(file, download = false) {
    requireConnection(client, config);
    const input = { Bucket: config.bucket, Key: file.name };

    if (download) {
      input.ResponseContentDisposition = `attachment; filename*=UTF-8''${encodeURIComponent(file.name.split('/').pop())}`;
    }

    return getSignedUrl(
      client,
      new commands.GetObjectCommand(input),
      { expiresIn: 900 }
    );
  }

  async function getPreviewUrl(file) {
    return signedGetUrl(file);
  }

  async function getDownloadUrl(file) {
    return signedGetUrl(file, true);
  }

  async function getObjectBlob(file) {
    const response = await fetchImpl(await signedGetUrl(file));
    if (!response.ok) throw new Error('无法读取对象内容。');
    return response.blob();
  }

  function disconnect() {
    client = undefined;
    config = undefined;
  }

  return {
    get client() { return client; },
    connect,
    listFiles,
    upload,
    getPreviewUrl,
    getDownloadUrl,
    getObjectBlob,
    disconnect
  };
}

module.exports = { createDirectStorage, mapObject };
