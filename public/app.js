const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const selectedFiles = document.querySelector('#selected-files');
const uploadButton = document.querySelector('#upload-button');
const uploadStatus = document.querySelector('#upload-status');
const uploadResult = document.querySelector('#upload-result');
const refreshButton = document.querySelector('#refresh-button');
const health = document.querySelector('#health');
const fileList = document.querySelector('#file-list');
const fileTemplate = document.querySelector('#file-template');
const connectionForm = document.querySelector('#connection-form');
const connectButton = document.querySelector('#connect-button');
const disconnectButton = document.querySelector('#disconnect-button');
const connectionStatus = document.querySelector('#connection-status');
const secretKeyInput = document.querySelector('#minio-secret-key');
const mediaViewer = document.querySelector('#media-viewer');
const viewerTitle = document.querySelector('#viewer-title');
const viewerImage = document.querySelector('#viewer-image');
const viewerVideo = document.querySelector('#viewer-video');
const viewerLoading = document.querySelector('#viewer-loading');
const viewerMessage = document.querySelector('#viewer-message');
const viewerDownload = document.querySelector('#viewer-download');

const fallbackPreviewMessage = '当前浏览器无法预览此文件，请下载后使用本地软件打开。';
const libraryPromises = new Map();

let pendingFiles = [];
let uploadInProgress = false;
let temporaryObjectUrl;
let sessionToken = sessionStorage.getItem('minio-test-session') || '';

function formatBytes(size) {
  if (!Number.isFinite(size) || size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function displayFileName(name) {
  const baseName = String(name).split('/').pop();
  const generatedPrefix = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f-]{36}-/i;

  return baseName.replace(generatedPrefix, '') || baseName;
}

function syncUploadButton() {
  uploadButton.disabled = !sessionToken || pendingFiles.length === 0 || uploadInProgress;
}

function setPendingFiles(files, resetFeedback = true) {
  pendingFiles = Array.from(files || []);
  const totalSize = pendingFiles.reduce((sum, file) => sum + file.size, 0);

  selectedFiles.hidden = pendingFiles.length === 0;
  selectedFiles.textContent = pendingFiles.length
    ? `已选择 ${pendingFiles.length} 个文件，共 ${formatBytes(totalSize)}`
    : '';

  if (resetFeedback) {
    uploadStatus.textContent = '';
    uploadResult.replaceChildren();
  }

  syncUploadButton();
}

function setConnectionState(connected, message) {
  disconnectButton.disabled = !connected;
  connectButton.disabled = false;
  connectionStatus.textContent = message;
  syncUploadButton();
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || '请求失败，请检查连接参数。');
  }

  return data;
}

function connectionHeaders(headers = {}) {
  return sessionToken ? { ...headers, 'X-Test-Session': sessionToken } : headers;
}

function apiUrl(path, name, download = false) {
  const params = new URLSearchParams({ name });
  if (download) params.set('download', '1');
  return `${path}?${params}`;
}

function hideViewerMessage() {
  viewerMessage.hidden = true;
  viewerMessage.textContent = '';
}

function showViewerMessage(message) {
  viewerImage.hidden = true;
  viewerVideo.hidden = true;
  viewerLoading.hidden = true;
  viewerMessage.textContent = message;
  viewerMessage.hidden = false;
}

function clearViewer() {
  if (temporaryObjectUrl) {
    URL.revokeObjectURL(temporaryObjectUrl);
    temporaryObjectUrl = undefined;
  }

  viewerVideo.pause();
  viewerVideo.removeAttribute('src');
  viewerVideo.load();
  viewerImage.removeAttribute('src');
  viewerImage.hidden = true;
  viewerVideo.hidden = true;
  viewerLoading.hidden = true;
  hideViewerMessage();
}

function loadScript(key, source) {
  if (!libraryPromises.has(key)) {
    libraryPromises.set(key, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('预览转码组件加载失败'));
      document.head.append(script);
    }));
  }

  return libraryPromises.get(key);
}

async function fetchObjectBlob(file) {
  const response = await fetch(apiUrl('/api/download', file.name), {
    headers: connectionHeaders()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || fallbackPreviewMessage);
  }

  return response.blob();
}

async function convertHeic(blob) {
  await loadScript('heic2any', '/vendor/heic2any/heic2any.js');

  if (typeof window.heic2any !== 'function') {
    throw new Error('HEIC 转码组件不可用');
  }

  const result = await window.heic2any({ blob, toType: 'image/jpeg' });
  return Array.isArray(result) ? result[0] : result;
}

async function convertTiff(blob) {
  await loadScript('pako', '/vendor/pako/pako.min.js');
  await loadScript('utif2', '/vendor/utif2/UTIF.js');

  if (!window.UTIF) {
    throw new Error('TIFF 转码组件不可用');
  }

  const buffer = await blob.arrayBuffer();
  const images = window.UTIF.decode(buffer);
  const image = images[0];

  if (!image) {
    throw new Error('TIFF 文件中没有可预览的图像');
  }

  window.UTIF.decodeImage(buffer, image);
  const pixels = window.UTIF.toRGBA8(image);
  const width = image.width || image.t256;
  const height = image.height || image.t257;

  if (!width || !height) {
    throw new Error('TIFF 图像尺寸无效');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(width, height);
  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

async function renderPreview(file) {
  const strategy = MediaPreview.previewStrategy(file.name);
  const sourceUrl = apiUrl('/api/download', file.name);

  if (strategy === 'native-image') {
    viewerImage.src = sourceUrl;
    viewerImage.hidden = false;
    return;
  }

  if (strategy === 'video') {
    viewerVideo.src = sourceUrl;
    viewerVideo.hidden = false;
    return;
  }

  if (strategy === 'unsupported') {
    showViewerMessage(fallbackPreviewMessage);
    return;
  }

  viewerLoading.textContent = strategy === 'heic' ? '正在转换 HEIC/HEIF 图片…' : '正在转换 TIFF 图片…';
  viewerLoading.hidden = false;

  try {
    const blob = await fetchObjectBlob(file);

    if (strategy === 'heic') {
      const converted = await convertHeic(blob);
      temporaryObjectUrl = URL.createObjectURL(converted);
      viewerImage.src = temporaryObjectUrl;
    } else {
      viewerImage.src = await convertTiff(blob);
    }

    viewerImage.hidden = false;
  } catch (error) {
    showViewerMessage(fallbackPreviewMessage);
  } finally {
    viewerLoading.hidden = true;
  }
}

function openViewer(file) {
  clearViewer();
  viewerTitle.textContent = displayFileName(file.name);
  viewerDownload.href = apiUrl('/api/download', file.name, true);
  mediaViewer.showModal();
  renderPreview(file);
}

function renderFiles(files) {
  fileList.replaceChildren();

  if (!files.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '还没有测试文件。上传第一个文件吧。';
    fileList.append(empty);
    return;
  }

  for (const file of files) {
    const fragment = fileTemplate.content.cloneNode(true);
    const name = fragment.querySelector('.file-name');
    const meta = fragment.querySelector('.file-meta');
    const preview = fragment.querySelector('.file-preview');
    const download = fragment.querySelector('.file-download');

    name.textContent = displayFileName(file.name);
    meta.textContent = `${formatBytes(file.size)} · ${new Date(file.lastModified).toLocaleString('zh-CN')}`;
    preview.addEventListener('click', () => openViewer(file));
    download.href = apiUrl('/api/download', file.name, true);
    fileList.append(fragment);
  }
}

async function loadHealth() {
  if (!sessionToken) {
    health.className = 'health health--checking';
    health.textContent = '等待连接配置';
    return;
  }

  try {
    const response = await fetch('/api/health', { headers: connectionHeaders() });
    const data = await readResponse(response);
    health.className = 'health health--ready';
    health.textContent = `已连接 · ${data.bucket} · ${data.objectCount} 个对象`;
  } catch (error) {
    health.className = 'health health--error';
    health.textContent = 'MinIO 连接失败';
    if (error.message.includes('请先在页面中')) {
      sessionToken = '';
      sessionStorage.removeItem('minio-test-session');
      setConnectionState(false, '连接会话已失效，请重新填写参数。');
    }
  }
}

async function loadFiles() {
  if (!sessionToken) {
    fileList.innerHTML = '<p class="empty-state">连接 MinIO 后显示测试桶中的文件。</p>';
    return;
  }

  fileList.innerHTML = '<p class="empty-state">正在读取对象列表…</p>';

  try {
    const response = await fetch('/api/files', { headers: connectionHeaders() });
    const data = await readResponse(response);
    renderFiles(data.files);
  } catch (error) {
    fileList.innerHTML = '<p class="empty-state empty-state--error">无法读取文件列表，请检查测试服务与 MinIO 的连接。</p>';
  }
}

function uploadFile(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    request.open('POST', '/api/upload');
    request.setRequestHeader('X-Test-Session', sessionToken);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress({ percent: Math.round((event.loaded / event.total) * 100) });
      }
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

function renderUploadResult(result) {
  uploadResult.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = `上传完成：成功 ${result.successes.length} 个，失败 ${result.failures.length} 个。`;
  uploadResult.append(summary);

  if (result.failures.length) {
    const failures = document.createElement('ul');
    failures.className = 'upload-result__failures';

    for (const failure of result.failures) {
      const item = document.createElement('li');
      item.textContent = `${failure.file.name}：${failure.error.message || '上传失败'}`;
      failures.append(item);
    }

    uploadResult.append(failures);
  }
}

fileInput.addEventListener('change', () => setPendingFiles(fileInput.files));

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drop-zone--active');
  });
}

dropZone.addEventListener('drop', (event) => setPendingFiles(event.dataTransfer.files));

uploadButton.addEventListener('click', async () => {
  if (!pendingFiles.length || uploadInProgress) return;

  uploadInProgress = true;
  syncUploadButton();
  uploadResult.replaceChildren();
  const filesToUpload = pendingFiles;

  try {
    const result = await UploadQueue.uploadSequentially(
      filesToUpload,
      (file, index, total) => uploadFile(file, ({ percent }) => {
        uploadStatus.textContent = `正在上传 ${index + 1}/${total}：${file.name}（${percent}%）`;
      }),
      ({ file, index, total }) => {
        uploadStatus.textContent = `准备上传 ${index + 1}/${total}：${file.name}`;
      }
    );

    fileInput.value = '';
    setPendingFiles([], false);
    renderUploadResult(result);
    uploadStatus.textContent = result.failures.length ? '部分文件上传失败。' : '全部文件上传完成。';
    await Promise.all([loadHealth(), loadFiles()]);
  } catch (error) {
    uploadStatus.textContent = error.message || '上传未完成。';
  } finally {
    uploadInProgress = false;
    syncUploadButton();
  }
});

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  await Promise.all([loadHealth(), loadFiles()]);
  refreshButton.disabled = false;
});

connectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  connectButton.disabled = true;
  connectionStatus.textContent = '正在验证 MinIO 连接…';

  try {
    const formData = new FormData(connectionForm);
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await readResponse(response);

    sessionToken = data.sessionToken;
    sessionStorage.setItem('minio-test-session', sessionToken);
    secretKeyInput.value = '';
    setConnectionState(true, `已连接 ${data.bucket}，会话将在 ${Math.round(data.expiresInSeconds / 60)} 分钟后自动失效。`);
    await Promise.all([loadHealth(), loadFiles()]);
  } catch (error) {
    setConnectionState(false, error.message);
    health.className = 'health health--error';
    health.textContent = 'MinIO 连接失败';
  }
});

disconnectButton.addEventListener('click', async () => {
  if (sessionToken) {
    await fetch('/api/disconnect', { method: 'POST', headers: connectionHeaders() });
  }

  sessionToken = '';
  sessionStorage.removeItem('minio-test-session');
  setPendingFiles();
  setConnectionState(false, '已断开。填写参数后可重新连接。');
  await Promise.all([loadHealth(), loadFiles()]);
});

mediaViewer.addEventListener('close', clearViewer);

setConnectionState(Boolean(sessionToken), sessionToken ? '正在恢复当前浏览器会话…' : '填写参数后连接 MinIO。');
Promise.all([loadHealth(), loadFiles()]);
