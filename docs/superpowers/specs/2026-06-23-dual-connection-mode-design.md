# MinIO 测试页双连接模式设计

## 目标

在同一个文件测试页面中，通过“连接方式”下拉框选择两种运行模式：

- **服务端代理**：保持现有浏览器 → Express `/api` → MinIO 的工作方式，适合 Docker 与内网测试服务器。
- **浏览器直连**：浏览器 → 用户代理后的 MinIO S3 API，适合 Netlify 静态站点。

两种模式共享文件选择、批量上传、对象列表、图片/视频查看和下载界面。用户始终手工输入仅限测试桶的 MinIO 账号；不得使用 Root 凭据。

## 不在范围内

- 不让 Netlify Function 访问内网 MinIO。
- 不保存或自动填充 Access Key、Secret Key。
- 不把 S3 凭据写入 Netlify 环境变量、前端源码或浏览器本地存储。
- 不改变 MinIO 原对象、桶策略或 Nginx 配置；只在部署文档中列出其必要条件。

## 两种模式的数据流

### 服务端代理

1. 用户填写地址、桶和专用测试账号，选择“服务端代理”。
2. 浏览器请求本项目 `/api/connect`，Express 将配置保存在内存会话中。
3. 浏览器通过 `/api/*` 上传、列举、下载与预览；图片、视频和下载 URL 使用同源 `HttpOnly` 会话 Cookie。
4. 此模式保留当前 Docker Compose 启动方式。

### 浏览器直连

1. 用户填写**代理后的 HTTPS MinIO S3 API 地址**、桶和专用测试账号，选择“浏览器直连”。
2. 浏览器使用打包进静态站点的 S3 兼容客户端直接执行 `ListObjectsV2`、`PutObject`、`GetObject`。
3. 图片、视频和下载使用浏览器端生成的短期预签名 GET URL；HEIC/HEIF、TIFF/TIF 先以带签名的请求读取 Blob，再沿用现有本地转码查看器。
4. 凭据只存活于当前 JavaScript 内存；切换模式、断开连接或刷新页面后需要重新填写。

## 架构

页面主逻辑通过一个小型 `StorageAdapter` 接口屏蔽连接方式差异：

```text
connect(config) → { bucket, objectCount }
listFiles()     → FileMetadata[]
upload(file, onProgress) → UploadedObject
getPreviewUrl(file) → URL
getObjectBlob(file) → Blob
getDownloadUrl(file) → URL
disconnect() → void
```

- `ProxyStorageAdapter` 调用现有 Express API，保留内存会话和 Cookie。
- `DirectStorageAdapter` 使用 AWS SDK v3 的 S3 兼容客户端，固定 `forcePathStyle: true`，默认区域 `us-east-1`，并在浏览器中生成预签名 URL。
- 主页面只根据当前适配器调用上述接口，因此批量上传、媒体预览、错误提示和 UI 不重复实现。

## 构建与部署

现有 `public/` 静态资源将构建到 `dist/`：

1. 构建脚本复制 HTML、CSS、转码资源到 `dist/`。
2. 使用本地构建器将 `DirectStorageAdapter` 与 AWS SDK v3 打包为按需加载的浏览器模块，避免代理模式首次下载直连依赖。
3. Docker 镜像在构建阶段生成 `dist/`，Express 静态服务改为提供 `dist/`。
4. 新增 `netlify.toml`：执行构建命令、发布 `dist/`，不配置 Function。

Netlify 部署只启用“浏览器直连”；页面仍保留代理模式下拉选项，但会明确提示该模式需要同源 Express 后端，因此不能在纯 Netlify 站点使用。

## 直连模式的 MinIO 与 Nginx 前置条件

- S3 API 必须经 HTTPS 域名可访问；不要把 Console 9001 暴露给测试页面。
- MinIO CORS 应仅允许 Netlify 站点域名和自定义域名，不使用无条件 `*`。允许 `GET`、`PUT`、`HEAD`；允许 `Authorization`、`Content-Type`、`Range`、`x-amz-*` 请求头；暴露 `ETag`、`Content-Length`、`Content-Range`、`Accept-Ranges` 响应头。
- Nginx 必须保留 S3 签名相关查询参数和请求头，尤其是 `Authorization`、`x-amz-date`、`x-amz-content-sha256`、`Range` 与 `Content-Type`。
- 账号策略继续只限测试桶的列举、读取和上传权限；没有删除、桶管理或管理员权限。

## 错误处理与安全提示

- 直连模式的首次“连接”会列举桶，用于报告 CORS、代理、网络、签名或权限错误。
- 预签名 URL 只保留在内存中且使用短时过期；不写入浏览器存储。
- CORS 不通过时，页面说明需要检查 MinIO/Nginx 的域名、允许来源和 S3 签名请求头。
- 代理模式在 Netlify 上被选中时，页面禁止连接并显示“请在 Docker/Express 部署中使用此模式”。
- 未知格式、浏览器无法解码的视频或转换失败的图片继续显示下载入口和明确提示。

## 测试与验收

- 单元测试：适配器选择、直连配置、对象名映射、预签名 URL 生命周期与模式切换时清除敏感状态。
- 浏览器构建测试：确认 `dist/` 含主页面、直连按需模块与本地 HEIC/TIFF 转码资源，且不含账号密钥。
- 代理回归测试：既有 19 项测试必须继续通过。
- 手工验收：Docker 下验证代理模式；Netlify 预览站点下用受限账号验证直连模式的连接、批量上传、图片/视频查看、HEIC/TIFF 与不支持格式提示。
