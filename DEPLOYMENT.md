# MinIO 测试页面部署手册

本项目是独立的 MinIO 文件上传、列表、图片和视频预览测试页面。它不会修改既有的 MinIO Compose，也不会占用或挂载 MinIO 的 `/docker/minio` 数据目录。

页面支持两种连接方式，可在页面顶部的“连接方式”下拉框中切换：

| 方式 | 适用位置 | MinIO 凭据所在位置 | MinIO 是否需要 CORS |
| --- | --- | --- | --- |
| 服务端代理（Docker / 内网） | 测试服务器、本地开发 | 测试页面后端的短期内存会话 | 不需要 |
| 浏览器直连（Netlify / HTTPS MinIO） | Netlify 或纯静态站点 | 访问者当前浏览器内存 | 需要 |

两种模式都支持多文件顺序上传、对象列表、下载、常规图片预览、常规视频预览，以及 HEIC/HEIF 和 TIFF/TIF 的浏览器端临时转换预览。转换不会改写 MinIO 中保存的原文件。

## 已知地址与网络策略

| 角色 | 地址/端口 | 备注 |
| --- | --- | --- |
| MinIO S3 API | `192.168.31.129:9000/TCP` | 测试页面访问对象存储的 API；生产环境建议由 Nginx 以 HTTPS 域名反向代理 |
| MinIO Console | `192.168.31.129:9001/TCP` | 仅管理员使用；测试页面不需要访问它 |
| Docker 测试页面 | `<测试服务器 IP>:8085/TCP` | 内网测试人员访问页面；可再由 Nginx 转发 |
| Netlify 测试页面 | `https://<你的站点>.netlify.app` | 静态页面直连 HTTPS MinIO API |

建议的安全策略：

- Docker 代理模式：仅允许“测试页面服务器 IP/CIDR”访问 `192.168.31.129:9000`，不开放 9001；例如测试服务器为 `192.168.31.150` 时，来源写为 `192.168.31.150/32`。
- Netlify 直连模式：S3 API 必须通过 HTTPS 域名对 Netlify 页面开放；不要把 `9000` 或 `9001` 直接暴露到公网。
- 两种模式都只能使用专用、受限的测试账号，禁止使用 `MINIO_ROOT_USER` / 根管理员密钥。
- 此页面没有自身登录功能。能够访问 Docker 代理页面的人，均可使用其输入的受限账号读写测试桶；请只放非敏感测试数据。

## 1. 初始化 MinIO 测试桶与受限账号

以下命令在拥有 MinIO 管理权限的管理机执行。示例 API 地址是当前测试 MinIO：`192.168.31.129:9000`。

```bash
mc alias set local-minio http://192.168.31.129:9000 MINIO_ADMIN_ACCESS_KEY MINIO_ADMIN_SECRET_KEY
mc mb --ignore-existing local-minio/test-upload
mc admin policy create local-minio test-web-policy minio-test-web-policy.json
mc admin user add local-minio test-web REPLACE_WITH_A_LONG_RANDOM_SECRET
mc admin policy attach local-minio test-web-policy --user test-web
```

`minio-test-web-policy.json` 仅授权 `test-upload` 桶的列举、读取和上传，不包含删除、其他桶访问或 MinIO 管理权限。将 `test-web` 的 Access Key/Secret 保存到受控的密码管理工具中；不要写进 `.env`、代码仓库或网页源代码。

## 2. Docker / Express 代理模式（内网推荐）

该模式由 Node/Express 后端访问 MinIO，因此浏览器不会直接访问 `192.168.31.129:9000`，MinIO 不需要配置 CORS。页面显示“服务端代理（Docker / 内网）”时就是此模式。

### 2.1 部署

在测试服务器上安装 Docker Engine 和 Docker Compose v2，然后将整个项目目录复制到例如 `/docker/minio-test-web`：

```bash
cd /docker/minio-test-web
docker compose -f docker-compose.yml config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 minio-test-web
```

打开：`http://<测试服务器 IP>:8085`。

在页面中选择“服务端代理（Docker / 内网）”，再输入以下实时连接参数：

- MinIO API 地址：`http://192.168.31.129:9000`
- 桶：`test-upload`
- Access Key / Secret Key：上节创建的 `test-web` 受限账号

连接成功后，凭据只存在服务端的短期内存会话中。浏览器只保存不透明会话标识，并通过同源 `HttpOnly` Cookie 加载预览、视频和下载内容；服务重启、主动断开或一小时无操作后会话失效。

### 2.2 运维命令

```bash
cd /docker/minio-test-web
docker compose logs -f minio-test-web
docker compose restart minio-test-web
docker compose stop
```

`MAX_UPLOAD_BYTES` 默认是 50 MiB。代理模式的上传文件会经过测试页面服务的内存；调大此限制前，请评估测试服务器内存与并发量。

## 3. Netlify / 浏览器直连模式

此模式发布纯静态页面到 Netlify。页面使用浏览器端 S3 客户端直接访问你经 Nginx 代理出来的 HTTPS MinIO API；Access Key 和 Secret Key 只保存在当前标签页内存中，刷新页面、切换模式或点击断开都会清除。

### 3.1 发布到 Netlify

1. 将本仓库推送到 GitHub：<https://github.com/Nobitaya/minio-test>。
2. 在 Netlify 选择 **Add new project** → **Import an existing project** → GitHub，并选择 `Nobitaya/minio-test`。
3. 构建分支选择 `main`；仓库根目录就是本项目，无需设置 Base directory。
4. 构建命令填写 `npm run build`，发布目录填写 `dist`。仓库中的 `netlify.toml` 已包含同样配置，并固定 Node.js 22。
5. 点击 Deploy。无需在 Netlify 环境变量中填写 MinIO 地址、Access Key 或 Secret Key。

发布后，页面会自动识别为静态部署：选择“浏览器直连（Netlify / HTTPS MinIO）”，填入 HTTPS API 地址、`test-upload` 和受限测试账号即可。静态部署中“服务端代理”会被禁用，这是预期行为。

### 3.2 Nginx 反向代理 MinIO API

生产环境建议使用独立域名，例如 `https://s3-test.example.com`，而不是直接对公网开放 `:9000`。反向代理必须原样保留签名所依赖的请求路径、查询参数与请求头；不要重写路径、丢弃查询参数或强制改写 `Host`。

```nginx
server {
    listen 443 ssl http2;
    server_name s3-test.example.com;

    # 根据测试文件体积调整；应与页面上传限制相匹配或更大。
    client_max_body_size 100m;

    location / {
        proxy_pass http://192.168.31.129:9000;
        proxy_http_version 1.1;

        # S3 SigV4 签名请求需要完整保留这些信息。
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass_request_headers on;

        # 上传与视频在线播放不应被代理缓冲。
        proxy_request_buffering off;
        proxy_buffering off;
    }
}
```

Nginx 配置完成后，页面中的 MinIO API 地址填 `https://s3-test.example.com`。不要填 Console 的 `:9001` 地址。

### 3.3 配置桶 CORS

浏览器直连需要在 `test-upload` 桶上设置精确的 CORS 来源。将下例中的 Netlify 域名和自定义域名替换为真实值；不要使用 `*`，不要把生产后台等无关站点加入来源。

创建 `cors.json`：

```json
[
  {
    "AllowedOrigins": [
      "https://your-site.netlify.app",
      "https://test.example.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": [
      "Authorization",
      "Content-Type",
      "Range",
      "X-Amz-Date",
      "X-Amz-Content-Sha256",
      "X-Amz-Security-Token",
      "X-Amz-User-Agent",
      "X-Amz-Checksum-Mode",
      "X-Amz-Checksum-Crc32",
      "X-Amz-Checksum-Crc32c",
      "X-Amz-Checksum-Sha1",
      "X-Amz-Checksum-Sha256",
      "X-Amz-Meta-Original-Name",
      "Amz-Sdk-Invocation-Id",
      "Amz-Sdk-Request"
    ],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

应用并检查：

```bash
mc cors set local-minio/test-upload cors.json
mc cors get local-minio/test-upload
```

让 Nginx 透传 `OPTIONS` 请求和 MinIO 返回的 CORS 响应头；不要在 Nginx 与 MinIO 同时配置两套相互冲突的 CORS 响应头。若浏览器仍提示 CORS 错误，请在浏览器开发者工具的 Network 面板检查预检请求实际发送的请求头，并将缺失的具体头名加入 `AllowedHeaders`，而不是放宽为任意来源。

## 4. 本地启动与验证

开发机需要 Node.js 22（或兼容的 Node.js 20+）。首次安装依赖并启动：

```powershell
cd <本项目目录>
npm.cmd install
npm.cmd start
```

默认监听 `http://localhost:8085`。启动命令会构建 Docker/Express 版本的静态资源，再启动服务。可用以下命令确认首页：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8085/
```

预期返回 `StatusCode : 200`。在浏览器打开 `http://localhost:8085` 后，选择“服务端代理（Docker / 内网）”并输入受限账号即可测试。

若开发机无法直接访问 `192.168.31.129:9000`，但可 SSH 到该服务器，可临时建立仅本机可见的隧道：

```bash
ssh -N -L 127.0.0.1:19000:127.0.0.1:9000 root@192.168.31.129
```

然后将页面里的 API 地址改为 `http://127.0.0.1:19000`。隧道只转发 S3 API 9000，不需要也不应转发 Console 9001。

## 5. 功能边界与排查

- 普通图片：JPG/JPEG、PNG、GIF、WebP、BMP、AVIF、SVG、ICO 可由浏览器原生预览。
- HEIC/HEIF 会在浏览器内临时转为 JPEG，TIFF/TIF 会临时解码为 PNG；原文件保持不变。
- RAW、PSD、AI、EPS 等专业图片格式，或转换失败的图片，会显示“不支持查看”的下载提示。
- 视频播放器支持浏览器通常可播放的 MP4、M4V、WebM、Ogg/OGV、MOV；具体取决于浏览器及文件内的编码。MKV、AVI、FLV 等通常提示下载后使用本地播放器。
- 代理模式的视频支持 HTTP Range；直连模式通过 MinIO 的预签名 GET URL 播放。
- 切换连接方式会断开当前会话并清空 Access Key 与 Secret Key，避免凭据跨模式残留。

常见错误：

| 现象 | 优先检查 |
| --- | --- |
| Docker 模式无法连接 MinIO | 测试页面服务器到 `192.168.31.129:9000` 的路由/防火墙、桶名、受限策略与账号 |
| Netlify 模式提示“必须使用 HTTPS” | 页面 API 地址必须是 `https://` 的 Nginx 域名 |
| Netlify 模式提示 CORS 错误 | 桶 CORS 的精确来源、`Authorization` 和 `X-Amz-*` 请求头、Nginx 是否透传 `OPTIONS` |
| 上传返回签名错误 | Nginx 是否保留原路径、查询参数和 `Host`，是否错误地添加了路径前缀 |
| 图片或视频无法预览 | 先确认格式和编码是否受浏览器支持；页面会保留下载入口 |
