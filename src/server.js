const express = require('express');
const multer = require('multer');
const { Client } = require('minio');
const path = require('node:path');
const { getConfig } = require('./config');
const { makeObjectName } = require('./objects');
const { createConnectionStore } = require('./connections');
const { parseByteRange } = require('./range');
const { readCookie } = require('./cookies');

function createMinioClient(config) {
  return new Client({
    endPoint: config.endpoint.host,
    port: config.endpoint.port,
    useSSL: config.endpoint.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey
  });
}

function listObjects(client, bucket) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = client.listObjectsV2(bucket, 'uploads/', true);

    stream.on('data', (object) => {
      objects.push({
        name: object.name,
        size: object.size,
        lastModified: object.lastModified,
        etag: object.etag
      });
    });
    stream.on('error', reject);
    stream.on('end', () => {
      objects.sort((left, right) => new Date(right.lastModified) - new Date(left.lastModified));
      resolve(objects.slice(0, 200));
    });
  });
}

function objectNameFromRequest(req) {
  const name = String(req.query.name || '');

  if (!name.startsWith('uploads/') || name.includes('\0')) {
    const error = new Error('Invalid object name');
    error.status = 400;
    throw error;
  }

  return name;
}

function objectContentType(stat) {
  return stat.metaData?.['content-type'] || 'application/octet-stream';
}

function originalFileName(stat, objectName) {
  return stat.metaData?.['x-amz-meta-original-name'] || path.basename(objectName);
}

function contentDisposition(fileName, download) {
  const mode = download ? 'attachment' : 'inline';

  return `${mode}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function sessionTokenFromRequest(req) {
  return req.get('X-Test-Session') || readCookie(req.get('Cookie'), 'minio_test_session');
}

function requestConnection(req, connectionStore) {
  const token = sessionTokenFromRequest(req);
  const config = connectionStore.get(token);

  if (!config) {
    const error = new Error('请先在页面中填写 MinIO 连接参数并点击连接。');
    error.status = 401;
    throw error;
  }

  return { config, client: createMinioClient(config) };
}

function createApp({
  maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 52_428_800),
  connectionStore = createConnectionStore()
} = {}) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes }
  });

  app.disable('x-powered-by');
  app.use(express.json());

  app.post('/api/connect', async (req, res, next) => {
    try {
      const config = getConfig({ ...req.body, MAX_UPLOAD_BYTES: maxUploadBytes });
      const client = createMinioClient(config);
      const files = await listObjects(client, config.bucket);
      const sessionToken = connectionStore.create(config);

      res.set('Set-Cookie', `minio_test_session=${encodeURIComponent(sessionToken)}; Max-Age=3600; Path=/; HttpOnly; SameSite=Strict`);

      res.status(201).json({
        ok: true,
        sessionToken,
        bucket: config.bucket,
        objectCount: files.length,
        expiresInSeconds: 3600
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/disconnect', (req, res) => {
    connectionStore.remove(req.get('X-Test-Session'));
    res.set('Set-Cookie', 'minio_test_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict');
    res.status(204).end();
  });

  app.get('/api/health', async (req, res, next) => {
    try {
      const { client, config } = requestConnection(req, connectionStore);
      const files = await listObjects(client, config.bucket);
      res.json({ ok: true, bucket: config.bucket, objectCount: files.length });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/files', async (req, res, next) => {
    try {
      const { client, config } = requestConnection(req, connectionStore);
      const files = await listObjects(client, config.bucket);
      res.json({ files });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res, next) => {
    try {
      const { client, config } = requestConnection(req, connectionStore);
      if (!req.file) {
        return res.status(400).json({ error: '请选择一个文件后再上传。' });
      }

      const objectName = makeObjectName(req.file.originalname);
      const metadata = {
        'Content-Type': req.file.mimetype || 'application/octet-stream',
        'X-Amz-Meta-Original-Name': req.file.originalname
      };

      await client.putObject(
        config.bucket,
        objectName,
        req.file.buffer,
        req.file.size,
        metadata
      );

      return res.status(201).json({
        name: objectName,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/download', async (req, res, next) => {
    try {
      const { client, config } = requestConnection(req, connectionStore);
      const objectName = objectNameFromRequest(req);
      const stat = await client.statObject(config.bucket, objectName);
      const range = parseByteRange(req.get('Range'), stat.size);
      const download = req.query.download === '1';

      if (req.get('Range') && !range) {
        res.set('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }

      const stream = range
        ? await client.getPartialObject(config.bucket, objectName, range.start, range.length)
        : await client.getObject(config.bucket, objectName);

      const headers = {
        'Content-Type': objectContentType(stat),
        'Content-Length': String(range ? range.length : stat.size),
        'Content-Disposition': contentDisposition(originalFileName(stat, objectName), download),
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes'
      };

      if (range) {
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      }

      res.status(range ? 206 : 200).set(headers);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'dist')));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `文件不能超过 ${maxUploadBytes} 字节。` });
    }

    const status = error.status || (error.code === 'NoSuchKey' ? 404 : 500);
    console.error(error);
    return res.status(status).json({ error: status === 500 ? '请求失败，请稍后重试。' : error.message });
  });

  return app;
}

function start() {
  const app = createApp();
  const port = Number(process.env.PORT || 8085);

  app.listen(port, '0.0.0.0', () => {
    console.log(`MinIO test web is listening on port ${port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { createApp, createMinioClient, listObjects, sessionTokenFromRequest };
