# MinIO 双连接模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个页面中支持 Docker/Express 服务端代理模式与 Netlify 浏览器直连 MinIO 模式，并保持批量上传和媒体预览能力。

**Architecture:** 页面通过 `StorageAdapter` 调用存储能力。代理适配器使用 `/api/*` 与 HttpOnly 会话 Cookie；直连适配器用浏览器端 S3 客户端和短期预签名 URL。构建过程输出 `dist/`，Docker 服务 `dist/`，Netlify 发布 `dist/`。

**Tech Stack:** Node.js 22、Express、MinIO SDK、AWS SDK v3、esbuild、Netlify、Node Test Runner。

---

## 文件结构

- 新建：`src/browser/mode.js`、`src/browser/adapter-selector.js`、`src/browser/proxy-storage.js`、`src/browser/direct-storage.js`。
- 新建：`src/browser/runtime.js`、`scripts/build.mjs`、`netlify.toml`。
- 新建：`test/mode.test.js`、`test/adapter-selector.test.js`、`test/direct-storage.test.js`、`test/build.test.js`。
- 修改：`public/index.html`、`public/app.js`、`public/styles.css`、`src/server.js`、`package.json`、`package-lock.json`、`Dockerfile`、`.dockerignore`、`DEPLOYMENT.md`。

### Task 1: 模式状态与适配器选择

**Files:**

- Create: `test/mode.test.js`
- Create: `test/adapter-selector.test.js`
- Create: `src/browser/mode.js`
- Create: `src/browser/adapter-selector.js`

- [ ] **Step 1: 写出模式状态失败测试**

```js
const { CONNECTION_MODES, canUseMode, clearSensitiveConnectionFields } = require('../src/browser/mode.js');

assert.equal(canUseMode(CONNECTION_MODES.PROXY, { hasProxyApi: true }), true);
assert.equal(canUseMode(CONNECTION_MODES.PROXY, { hasProxyApi: false }), false);
assert.equal(canUseMode(CONNECTION_MODES.DIRECT, { hasProxyApi: false }), true);
assert.deepEqual(clearSensitiveConnectionFields({ endpoint: 'https://s3.example.com', bucket: 'test', accessKey: 'a', secretKey: 'b' }), {
  endpoint: 'https://s3.example.com', bucket: 'test', accessKey: '', secretKey: ''
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test test/mode.test.js`

Expected: 模块不存在而失败。

- [ ] **Step 3: 实现最小模式模块**

```js
const CONNECTION_MODES = Object.freeze({ PROXY: 'proxy', DIRECT: 'direct' });
function canUseMode(mode, { hasProxyApi }) {
  return mode === CONNECTION_MODES.DIRECT || (mode === CONNECTION_MODES.PROXY && hasProxyApi);
}
function clearSensitiveConnectionFields(connection) {
  return { ...connection, accessKey: '', secretKey: '' };
}
module.exports = { CONNECTION_MODES, canUseMode, clearSensitiveConnectionFields };
```

- [ ] **Step 4: 写出适配器选择失败测试并实现**

`test/adapter-selector.test.js` 必须断言 `selectAdapter('direct', { hasProxyApi: false }, factories)` 选择 `factories.direct()`，而代理模式在 `hasProxyApi: false` 时抛出含 `Docker/Express` 的错误。

```js
const { CONNECTION_MODES, canUseMode } = require('./mode.js');
async function selectAdapter(mode, environment, factories) {
  if (!canUseMode(mode, environment)) throw new Error('服务端代理模式需要在 Docker/Express 部署中使用。');
  return mode === CONNECTION_MODES.DIRECT ? factories.direct() : factories.proxy();
}
module.exports = { selectAdapter };
```

- [ ] **Step 5: 验证并提交**

Run: `npm.cmd test`

Expected: 模式与选择器测试通过，既有测试不回归。

Commit: `git commit -am "feat: define connection mode selection"`

### Task 2: 浏览器直连 S3 适配器

**Files:**

- Create: `test/direct-storage.test.js`
- Create: `src/browser/direct-storage.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 写出直连适配器失败测试**

测试向 `createDirectStorage` 注入假的 `createClient`、S3 Command 类与 `getSignedUrl`，不得访问网络。它必须断言：客户端用 `endpoint`、`region: 'us-east-1'`、`forcePathStyle: true` 和临时凭据创建；列举仅请求 `uploads/`；结果以 `LastModified` 倒序；预览 URL 过期参数为 900 秒。

- [ ] **Step 2: 运行失败测试**

Run: `node --test test/direct-storage.test.js`

Expected: `direct-storage.js` 不存在而失败。

- [ ] **Step 3: 安装固定构建依赖并生成锁文件**

```bash
npm install --save-dev @aws-sdk/client-s3 @aws-sdk/s3-request-presigner esbuild
```

Expected: `package-lock.json` 存在，后续 Docker 与 Netlify 使用 `npm ci`。

- [ ] **Step 4: 实现直连适配器**

`createDirectStorage(dependencies)` 暴露 `connect`、`listFiles`、`upload`、`getPreviewUrl`、`getObjectBlob`、`getDownloadUrl`、`disconnect`。`connect` 拒绝非 HTTPS 地址；`upload` 发送 `PutObjectCommand`；`getPreviewUrl` 和 `getDownloadUrl` 用 `GetObjectCommand` 与 `getSignedUrl(client, command, { expiresIn: 900 })`；`disconnect` 删除客户端和内存中的凭据引用。

```js
function mapObject(object) {
  return { name: object.Key, size: object.Size || 0, lastModified: object.LastModified || new Date(0), etag: object.ETag };
}
```

- [ ] **Step 5: 验证并提交**

Run: `npm.cmd test`

Expected: 直连测试全绿且无外部网络请求。

Commit: `git commit -am "feat: add direct S3 storage adapter"`

### Task 3: 封装代理适配器并切换 UI

**Files:**

- Create: `src/browser/proxy-storage.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `test/ui-integration.test.js`

- [ ] **Step 1: 写出页面失败测试**

在 `test/ui-integration.test.js` 增加以下断言：

```js
assert.match(indexHtml, /id="connection-mode"/);
assert.match(indexHtml, /value="proxy"/);
assert.match(indexHtml, /value="direct"/);
assert.match(appJs, /selectAdapter/);
assert.match(appJs, /clearSensitiveConnectionFields/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test`

Expected: 因下拉框和模式切换尚未接入而失败。

- [ ] **Step 3: 实现代理适配器**

`ProxyStorageAdapter` 将 `/api/connect`、`/api/health`、`/api/files`、`/api/upload`、`/api/download` 封装为与直连适配器相同的方法。它保留 `X-Test-Session`、同源 Cookie、XMLHttpRequest 上传进度和下载 Blob 行为。

- [ ] **Step 4: 加入下拉框、说明和状态清理**

```html
<label>
  <span>连接方式</span>
  <select id="connection-mode" name="CONNECTION_MODE">
    <option value="proxy">服务端代理（Docker / 内网）</option>
    <option value="direct">浏览器直连（Netlify / HTTPS MinIO）</option>
  </select>
</label>
<p id="connection-mode-hint" class="connection-mode-hint" aria-live="polite"></p>
```

切换模式时清空 Access Key 与 Secret Key、断开当前适配器、停止查看器、清空上传队列。直连说明固定提示 HTTPS、CORS、受限账号和“凭据仅在当前页面内存中”；Netlify 环境禁用代理模式的连接按钮并显示 Docker/Express 提示。

- [ ] **Step 5: 将页面操作改为适配器调用**

连接、列表、批量上传、图片/视频预览 URL、下载 URL 和 HEIC/TIFF Blob 全部经 `activeStorage` 调用。批量顺序队列、视频 Range、转码失败提示保持现有行为。`activeStorage.disconnect()` 后必须赋值为 `undefined`。

- [ ] **Step 6: 验证并提交**

Run: `npm.cmd test`

Expected: 新 UI 测试通过，代理相关测试持续通过。

Commit: `git commit -am "feat: switch MinIO connection modes in the UI"`

### Task 4: 静态构建、Docker 与 Netlify

**Files:**

- Create: `scripts/build.mjs`
- Create: `netlify.toml`
- Create: `test/build.test.js`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `.dockerignore`
- Modify: `src/server.js`

- [ ] **Step 1: 写出构建输出失败测试**

构建测试在临时目录调用构建脚本，并断言：

```js
assert.equal(existsSync(join(outputDirectory, 'index.html')), true);
assert.equal(existsSync(join(outputDirectory, 'assets', 'direct-storage.js')), true);
assert.equal(existsSync(join(outputDirectory, 'vendor', 'heic2any', 'heic2any.js')), true);
assert.equal(existsSync(join(outputDirectory, 'vendor', 'utif2', 'UTIF.js')), true);
assert.equal(existsSync(join(outputDirectory, 'vendor', 'pako', 'pako.min.js')), true);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test test/build.test.js`

Expected: `dist/assets/direct-storage.js` 尚未生成而失败。

- [ ] **Step 3: 实现构建与静态配置**

`scripts/build.mjs` 删除并重建 `dist/`，复制 `public/` 和三个媒体转码文件。它以 `src/browser/runtime.js` 为入口打包一个轻量运行时模块；该模块仅在选择直连模式时动态导入 `direct-storage.js`，从而让 AWS SDK 代码分块不进入代理模式的首次下载。调用：

```js
await build({
  entryPoints: ['src/browser/runtime.js'],
  outdir: 'dist/assets',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  target: ['es2022']
});
```

`package.json` 新增 `"build": "node scripts/build.mjs"`。创建 `netlify.toml`：

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
```

- [ ] **Step 4: 改造 Docker 运行产物**

`public/app.js` 使用 `import('/assets/runtime.js')` 获取模式、代理适配器和直连适配器加载函数。Dockerfile 使用 builder 阶段 `npm ci` 与 `npm run build`，runtime 阶段 `npm ci --omit=dev`，只复制 `src/`、生产依赖和 `dist/`。`src/server.js` 静态服务改为 `dist/`，不再暴露 `node_modules`。`.dockerignore` 排除 `node_modules/`、`dist/`、`.git/`。

- [ ] **Step 5: 验证并提交**

Run: `npm.cmd run build`

Run: `npm.cmd test`

Run: `docker compose config`

Expected: `dist/` 完整、测试通过、Compose 成功解析。

Commit: `git commit -am "build: support Docker and Netlify deployments"`

### Task 5: 部署说明与最终验收

**Files:**

- Modify: `DEPLOYMENT.md`
- Modify: `.gitignore`

- [ ] **Step 1: 写明 Docker 代理部署**

记录 `docker compose up -d --build`，页面选择“服务端代理”，测试服务器访问内网 S3 API；本模式不要求 MinIO CORS。

- [ ] **Step 2: 写明 Netlify 直连部署**

记录 GitHub 导入、分支 `main`、构建命令 `npm run build`、发布目录 `dist`。列出 HTTPS S3 API、精确 CORS 来源、允许 `Authorization`/`x-amz-*`/`Range`、Nginx 保留签名头和查询参数、只使用受限账号的检查项。

- [ ] **Step 3: 执行最终验证**

Run: `npm.cmd test`

Run: `npm.cmd run build`

Run: `git status --short`

Expected: 测试全绿、构建成功、`dist/` 被 `.gitignore` 排除且没有账号或密钥文件。

- [ ] **Step 4: 提交检查点**

Commit: `git commit -am "docs: document Docker and Netlify modes"`
