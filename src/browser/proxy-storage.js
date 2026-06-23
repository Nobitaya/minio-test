function apiUrl(path, name, download = false) {
  const params = new URLSearchParams({ name });
  if (download) params.set('download', '1');
  return `${path}?${params}`;
}

function createProxyStorage({ fetchImpl = fetch, XMLHttpRequestImpl = XMLHttpRequest, sessionStore = sessionStorage }) {
  let sessionToken = sessionStore.getItem('minio-test-session') || '';

  function headers(headers = {}) {
    return sessionToken ? { ...headers, 'X-Test-Session': sessionToken } : headers;
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '请求失败，请检查连接参数。');
    return data;
  }

  async function connect(connection) {
    const response = await fetchImpl('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MINIO_ENDPOINT: connection.endpoint,
        MINIO_BUCKET: connection.bucket,
        MINIO_ACCESS_KEY: connection.accessKey,
        MINIO_SECRET_KEY: connection.secretKey
      })
    });
    const data = await readJson(response);
    sessionToken = data.sessionToken;
    sessionStore.setItem('minio-test-session', sessionToken);
    return { bucket: data.bucket, objectCount: data.objectCount };
  }

  async function listFiles() {
    const response = await fetchImpl('/api/files', { headers: headers() });
    return (await readJson(response)).files;
  }

  function upload(file, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequestImpl();
      const form = new FormData();
      form.append('file', file);
      request.open('POST', '/api/upload');
      request.setRequestHeader('X-Test-Session', sessionToken);
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress({ percent: Math.round((event.loaded / event.total) * 100) });
      });
      request.addEventListener('load', () => {
        if (request.status >= 200 && request.status < 300) {
          resolve(JSON.parse(request.responseText));
          return;
        }
        try {
          reject(new Error(JSON.parse(request.responseText).error));
        } catch {
          reject(new Error('上传失败，请重试。'));
        }
      });
      request.addEventListener('error', () => reject(new Error('网络错误，上传未完成。')));
      request.send(form);
    });
  }

  async function getObjectBlob(file) {
    const response = await fetchImpl(apiUrl('/api/download', file.name), { headers: headers() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || '无法读取对象内容。');
    }
    return response.blob();
  }

  function getPreviewUrl(file) {
    return apiUrl('/api/download', file.name);
  }

  function getDownloadUrl(file) {
    return apiUrl('/api/download', file.name, true);
  }

  async function disconnect() {
    if (sessionToken) await fetchImpl('/api/disconnect', { method: 'POST', headers: headers() });
    sessionToken = '';
    sessionStore.removeItem('minio-test-session');
  }

  return { connect, listFiles, upload, getPreviewUrl, getDownloadUrl, getObjectBlob, disconnect };
}

module.exports = { createProxyStorage };
