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
const connectionMode = document.querySelector('#connection-mode');
const connectionModeHint = document.querySelector('#connection-mode-hint');
const connectButton = document.querySelector('#connect-button');
const disconnectButton = document.querySelector('#disconnect-button');
const connectionStatus = document.querySelector('#connection-status');
const endpointInput = document.querySelector('#minio-endpoint');
const bucketInput = document.querySelector('#minio-bucket');
const accessKeyInput = document.querySelector('#minio-access-key');
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
const runtimePromise = import('/assets/runtime.js').then((module) => {
  const factory = module.createBrowserRuntime || module.default?.createBrowserRuntime;
  if (!factory) throw new Error('页面运行组件加载失败。');
  return factory();
});

let runtime;
let activeStorage;
let pendingFiles = [];
let uploadInProgress = false;
let connecting = false;
let temporaryObjectUrl;

function hasProxyApi() {
  return window.__MINIO_TEST_HAS_PROXY_API__ === true || window.__MINIO_TEST_HAS_PROXY_API__ === 'true';
}

function currentMode() {
  return connectionMode.value;
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function displayFileName(name) {
  const baseName = String(name).split('/').pop();
  return baseName.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f-]{36}-/i, '') || baseName;
}

function modeIsAvailable() {
  return Boolean(runtime?.canUseMode(currentMode(), { hasProxyApi: hasProxyApi() }));
}

function syncControls() {
  connectButton.disabled = !runtime || !modeIsAvailable() || connecting;
  disconnectButton.disabled = !activeStorage;
  uploadButton.disabled = !activeStorage || pendingFiles.length === 0 || uploadInProgress;
}

function updateModeHint() {
  if (!runtime) {
    connectionModeHint.textContent = '正在加载连接组件…';
    return;
  }

  if (currentMode() === runtime.CONNECTION_MODES.DIRECT) {
    connectionModeHint.textContent = '浏览器将直接请求 HTTPS MinIO API。凭据仅保留在当前页面内存中；请使用受限测试账号，并确保 CORS 与代理签名头已配置。';
  } else if (!hasProxyApi()) {
    connectionModeHint.textContent = '服务端代理模式需要 Docker/Express 后端，纯 Netlify 静态站点无法使用。';
  } else {
    connectionModeHint.textContent = '浏览器通过本服务的 /api 访问 MinIO；凭据保存在临时服务端会话中。';
  }
}

function setPendingFiles(files, resetFeedback = true) {
  pendingFiles = Array.from(files || []);
  const totalSize = pendingFiles.reduce((sum, file) => sum + file.size, 0);
  selectedFiles.hidden = pendingFiles.length === 0;
  selectedFiles.textContent = pendingFiles.length ? `已选择 ${pendingFiles.length} 个文件，共 ${formatBytes(totalSize)}` : '';
  if (resetFeedback) {
    uploadStatus.textContent = '';
    uploadResult.replaceChildren();
  }
  syncControls();
}

function setConnectionState(message) {
  connectionStatus.textContent = message;
  syncControls();
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

async function convertHeic(blob) {
  await loadScript('heic2any', '/vendor/heic2any/heic2any.js');
  if (typeof window.heic2any !== 'function') throw new Error('HEIC 转码组件不可用');
  const result = await window.heic2any({ blob, toType: 'image/jpeg' });
  return Array.isArray(result) ? result[0] : result;
}

async function convertTiff(blob) {
  await loadScript('pako', '/vendor/pako/pako.min.js');
  await loadScript('utif2', '/vendor/utif2/UTIF.js');
  if (!window.UTIF) throw new Error('TIFF 转码组件不可用');
  const buffer = await blob.arrayBuffer();
  const image = window.UTIF.decode(buffer)[0];
  if (!image) throw new Error('TIFF 文件中没有可预览的图像');
  window.UTIF.decodeImage(buffer, image);
  const width = image.width || image.t256;
  const height = image.height || image.t257;
  if (!width || !height) throw new Error('TIFF 图像尺寸无效');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(width, height);
  imageData.data.set(window.UTIF.toRGBA8(image));
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

async function renderPreview(file) {
  if (!activeStorage) return;
  const strategy = MediaPreview.previewStrategy(file.name);
  if (strategy === 'unsupported') return showViewerMessage(fallbackPreviewMessage);
  viewerLoading.hidden = false;
  viewerLoading.textContent = strategy === 'heic' ? '正在转换 HEIC/HEIF 图片…' : strategy === 'tiff' ? '正在转换 TIFF 图片…' : '正在准备预览…';

  try {
    if (strategy === 'native-image') {
      viewerImage.src = await activeStorage.getPreviewUrl(file);
      viewerImage.hidden = false;
    } else if (strategy === 'video') {
      viewerVideo.src = await activeStorage.getPreviewUrl(file);
      viewerVideo.hidden = false;
    } else {
      const blob = await activeStorage.getObjectBlob(file);
      if (strategy === 'heic') {
        temporaryObjectUrl = URL.createObjectURL(await convertHeic(blob));
        viewerImage.src = temporaryObjectUrl;
      } else {
        viewerImage.src = await convertTiff(blob);
      }
      viewerImage.hidden = false;
    }
  } catch {
    showViewerMessage(fallbackPreviewMessage);
  } finally {
    viewerLoading.hidden = true;
  }
}

async function openViewer(file) {
  if (!activeStorage) return;
  clearViewer();
  viewerTitle.textContent = displayFileName(file.name);
  mediaViewer.showModal();
  try {
    viewerDownload.href = await activeStorage.getDownloadUrl(file);
  } catch {
    showViewerMessage(fallbackPreviewMessage);
  }
  await renderPreview(file);
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
    fragment.querySelector('.file-name').textContent = displayFileName(file.name);
    fragment.querySelector('.file-meta').textContent = `${formatBytes(file.size)} · ${new Date(file.lastModified).toLocaleString('zh-CN')}`;
    fragment.querySelector('.file-preview').addEventListener('click', () => openViewer(file));
    const download = fragment.querySelector('.file-download');
    download.href = '#';
    download.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!activeStorage) return;
      window.open(await activeStorage.getDownloadUrl(file), '_blank', 'noopener');
    });
    fileList.append(fragment);
  }
}

async function loadFiles() {
  if (!activeStorage) {
    fileList.innerHTML = '<p class="empty-state">连接 MinIO 后显示测试桶中的文件。</p>';
    return;
  }
  fileList.innerHTML = '<p class="empty-state">正在读取对象列表…</p>';
  try {
    const files = await activeStorage.listFiles();
    health.className = 'health health--ready';
    health.textContent = `已连接 · ${files.length} 个对象`;
    renderFiles(files);
  } catch (error) {
    health.className = 'health health--error';
    health.textContent = 'MinIO 连接失败';
    fileList.innerHTML = `<p class="empty-state empty-state--error">${error.message || '无法读取文件列表。'}</p>`;
  }
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

async function disconnectActiveStorage(message) {
  if (activeStorage) await activeStorage.disconnect();
  activeStorage = undefined;
  clearViewer();
  setPendingFiles();
  health.className = 'health health--checking';
  health.textContent = '等待连接配置';
  setConnectionState(message);
  await loadFiles();
}

async function handleModeChange() {
  const cleared = runtime.clearSensitiveConnectionFields({
    endpoint: endpointInput.value,
    bucket: bucketInput.value,
    accessKey: accessKeyInput.value,
    secretKey: secretKeyInput.value
  });
  accessKeyInput.value = cleared.accessKey;
  secretKeyInput.value = cleared.secretKey;
  await disconnectActiveStorage('已切换连接方式，请重新填写专用测试账号。');
  updateModeHint();
  syncControls();
}

fileInput.addEventListener('change', () => setPendingFiles(fileInput.files));
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('drop-zone--active'); });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('drop-zone--active'); });
}
dropZone.addEventListener('drop', (event) => setPendingFiles(event.dataTransfer.files));

uploadButton.addEventListener('click', async () => {
  if (!activeStorage || !pendingFiles.length || uploadInProgress) return;
  uploadInProgress = true;
  syncControls();
  const filesToUpload = pendingFiles;
  try {
    const result = await UploadQueue.uploadSequentially(
      filesToUpload,
      (file, index, total) => activeStorage.upload(file, ({ percent }) => {
        uploadStatus.textContent = `正在上传 ${index + 1}/${total}：${file.name}（${percent}%）`;
      }),
      ({ file, index, total }) => { uploadStatus.textContent = `准备上传 ${index + 1}/${total}：${file.name}`; }
    );
    fileInput.value = '';
    setPendingFiles([], false);
    renderUploadResult(result);
    uploadStatus.textContent = result.failures.length ? '部分文件上传失败。' : '全部文件上传完成。';
    await loadFiles();
  } finally {
    uploadInProgress = false;
    syncControls();
  }
});

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  await loadFiles();
  refreshButton.disabled = false;
});

connectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!modeIsAvailable()) return;
  connecting = true;
  syncControls();
  setConnectionState('正在验证 MinIO 连接…');
  try {
    const factories = {
      proxy: () => runtime.createProxyAdapter(),
      direct: () => runtime.createDirectAdapter()
    };
    const storage = await runtime.selectAdapter(currentMode(), { hasProxyApi: hasProxyApi() }, factories);
    const result = await storage.connect({ endpoint: endpointInput.value, bucket: bucketInput.value, accessKey: accessKeyInput.value, secretKey: secretKeyInput.value });
    secretKeyInput.value = '';
    activeStorage = storage;
    setConnectionState(`已连接 ${result.bucket} · ${result.objectCount} 个对象。`);
    await loadFiles();
  } catch (error) {
    activeStorage = undefined;
    const detail = currentMode() === 'direct'
      ? '直连失败：请检查 HTTPS 地址、CORS、Nginx S3 签名头和测试账号权限。'
      : error.message;
    setConnectionState(detail);
    health.className = 'health health--error';
    health.textContent = 'MinIO 连接失败';
  } finally {
    connecting = false;
    syncControls();
  }
});

connectionMode.addEventListener('change', () => handleModeChange());
disconnectButton.addEventListener('click', () => disconnectActiveStorage('已断开。填写参数后可重新连接。'));
mediaViewer.addEventListener('close', clearViewer);

runtimePromise.then(async (loadedRuntime) => {
  runtime = loadedRuntime;
  updateModeHint();
  setConnectionState('填写参数后连接 MinIO。');
  await loadFiles();
}).catch((error) => {
  connectionModeHint.textContent = error.message;
  connectionStatus.textContent = '页面运行组件加载失败。';
});
