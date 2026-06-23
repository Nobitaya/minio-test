const test = require('node:test');
const assert = require('node:assert/strict');
const { createDirectStorage } = require('../src/browser/direct-storage.js');

class ListObjectsV2Command {
  constructor(input) {
    Object.assign(this, input);
  }
}

class GetObjectCommand {
  constructor(input) {
    Object.assign(this, input);
  }
}

class PutObjectCommand {
  constructor(input) {
    Object.assign(this, input);
  }
}

const commands = { ListObjectsV2Command, GetObjectCommand, PutObjectCommand };

test('connects with path-style S3 settings and lists uploads newest first', async () => {
  const created = [];
  const storage = createDirectStorage({
    createClient: (options) => {
      const client = {
        options,
        send: async (command) => {
          if (command instanceof ListObjectsV2Command) {
            return {
              Contents: [
                { Key: 'uploads/old.txt', Size: 1, LastModified: new Date('2025-01-01T00:00:00Z') },
                { Key: 'uploads/new.txt', Size: 2, LastModified: new Date('2026-01-01T00:00:00Z') }
              ]
            };
          }
          throw new Error('Unexpected command');
        }
      };
      created.push(client);
      return client;
    },
    commands,
    getSignedUrl: async () => 'https://s3.example.com/signed'
  });

  const result = await storage.connect({
    endpoint: 'https://s3.example.com',
    bucket: 'test-upload',
    accessKey: 'key',
    secretKey: 'secret'
  });

  assert.equal(result.objectCount, 2);
  assert.equal(created[0].options.forcePathStyle, true);
  assert.equal(created[0].options.region, 'us-east-1');
  assert.deepEqual((await storage.listFiles()).map((file) => file.name), ['uploads/new.txt', 'uploads/old.txt']);
});

test('uses short-lived presigned URLs for media and download', async () => {
  const signingCalls = [];
  const storage = createDirectStorage({
    createClient: () => ({ send: async () => ({ Contents: [] }) }),
    commands,
    getSignedUrl: async (client, command, options) => {
      signingCalls.push({ client, command, options });
      return 'https://s3.example.com/short-lived';
    }
  });

  await storage.connect({ endpoint: 'https://s3.example.com', bucket: 'test-upload', accessKey: 'key', secretKey: 'secret' });

  assert.equal(await storage.getPreviewUrl({ name: 'uploads/photo.jpg' }), 'https://s3.example.com/short-lived');
  assert.equal(await storage.getDownloadUrl({ name: 'uploads/photo.jpg' }), 'https://s3.example.com/short-lived');
  assert.equal(signingCalls[0].options.expiresIn, 900);
  assert.equal(signingCalls[0].command.Key, 'uploads/photo.jpg');
  assert.match(signingCalls[1].command.ResponseContentDisposition, /^attachment;/);
});

test('rejects a non-HTTPS MinIO endpoint in direct mode', async () => {
  const storage = createDirectStorage({ createClient: () => ({}), commands, getSignedUrl: async () => '' });

  await assert.rejects(
    () => storage.connect({ endpoint: 'http://192.168.31.129:9000', bucket: 'test-upload', accessKey: 'key', secretKey: 'secret' }),
    /HTTPS/
  );
});
