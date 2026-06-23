# MinIO 独立测试页面部署手册

本目录是独立服务，只部署到**测试服务器**。它不会修改现有 MinIO 的 Compose，也不会挂载 `/docker/minio`。浏览器访问测试页；测试页后端再通过 S3 API 访问 MinIO。

## 网络与地址

| 角色 | 地址/端口 | 用途 |
| --- | --- | --- |
| 现有 MinIO API | `192.168.31.129:9000/TCP` | 测试服务访问对象存储 |
| 现有 MinIO Console | `192.168.31.129:9001/TCP` | 测试服务不需要访问 |
| 测试服务器 | `TEST_SERVER_IP_OR_CIDR` | 在部署前替换为测试服务器实际 IP 或网段 |
| 测试页面 | `<测试服务器IP>:8085/TCP` | 内网测试者通过浏览器访问 |

MinIO 服务器的防火墙或安全组应只允许 `TEST_SERVER_IP_OR_CIDR` 访问 `192.168.31.129:9000/TCP`。不需要为本测试页面开放 MinIO 的 9001 端口，也不需要配置 MinIO CORS，因为浏览器不会直连 MinIO。

> 例：测试服务器地址为 `192.168.31.150` 时，规则的来源应写为 `192.168.31.150/32`；若使用整个内网段，则写为 `192.168.31.0/24`。请按现有防火墙产品配置，避免覆盖已有允许规则。

## MinIO 端初始化

在现有 MinIO 中创建私有桶 `test-upload`。不要为该桶设置匿名读写策略。

随后创建一个仅供本测试页面使用的 MinIO 用户或 Service Account，并赋予 `minio-test-web-policy.json` 中的策略。该策略只允许列出桶、获取对象和上传对象；不允许删除、访问其他桶或管理 MinIO。

若使用 `mc` 命令行，先在具备管理员权限的管理机配置别名，然后执行：

```bash
mc alias set local-minio http://192.168.31.129:9000 MINIO_ADMIN_ACCESS_KEY MINIO_ADMIN_SECRET_KEY
mc mb --ignore-existing local-minio/test-upload
mc admin policy create local-minio test-web-policy minio-test-web-policy.json
mc admin user add local-minio test-web REPLACE_WITH_A_LONG_RANDOM_SECRET
mc admin policy attach local-minio test-web-policy --user test-web
```

保存 `test-web` 和它的随机密钥到受控的密码管理工具。测试时在页面顶部的实时连接参数中输入；不要使用或复制 MinIO 根管理员凭据。若通过 Console 创建账号，请附加同等权限的策略，不要赋予管理员权限。

## 部署测试页面

测试服务器需要 Docker Engine 与 Docker Compose v2，并且可访问 `192.168.31.129:9000`。将整个 `minio-test-web` 目录复制到测试服务器，例如 `/opt/minio-test-web`：

```bash
mkdir -p /opt/minio-test-web
cd /opt/minio-test-web
```

部署前解析 Compose：

```bash
docker compose -f docker-compose.yml config
```

启动服务：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 minio-test-web
```

浏览器打开 `http://<测试服务器IP>:8085`。页面显示“已连接”后，可一次选择或拖入多个不超过 50 MiB 的非敏感测试文件。文件会按选择顺序逐个上传；某个文件失败不会中断后续文件，页面会显示成功数量、失败数量与失败原因。上传结束后确认对象出现在列表中，并检查预览和下载。

图片查看器原生预览 JPG、JPEG、PNG、GIF、WebP、BMP、AVIF、SVG 和 ICO。HEIC/HEIF 会在浏览器内临时转换为 JPEG，TIFF/TIF 会在浏览器内临时解码为 PNG；这些转换不会修改 MinIO 中保存的原始文件，也不需要外网或服务器安装图像处理工具。RAW、PSD、AI、EPS 等专业图片格式，或任一格式的转换失败，都会显示“当前浏览器无法预览此文件，请下载后使用本地软件打开”。

视频查看器使用浏览器原生播放器，支持 MP4、M4V、WebM、Ogg/OGV 和 MOV（具体播放能力仍取决于浏览器与文件内的编解码器）；接口支持 HTTP Range，因此可拖动视频进度条。MKV、AVI、FLV 等格式通常不能由浏览器直接解码，页面会显示相同的下载提示。

## 在本机启动以进行页面验证

以下步骤适用于 Windows 开发机或其他拥有 Node.js 20+ 的本机环境。它与 Docker 部署互不影响，但同样需要专用的 MinIO 测试账号，绝不能使用 MinIO 根管理员账号。

```powershell
cd <本目录路径>
npm.cmd install --no-save --no-package-lock --ignore-scripts
npm.cmd start
```

Node 启动脚本默认监听 `http://localhost:8085`。MinIO 地址、桶和专用测试账号在浏览器页面中实时填写，而不是写入服务端 `.env`。可用以下命令确认首页已启动：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8085/
```

预期返回 `StatusCode : 200`。随后在浏览器打开 `http://localhost:8085`。访问健康接口可确认页面后端是否真正拥有 MinIO 访问能力：

```powershell
Invoke-RestMethod http://127.0.0.1:8085/api/health
```

在页面填写连接参数并成功连接后，健康接口才会返回 `ok: true`。若首页可以打开但连接失败，优先检查页面中的 MinIO API 地址、测试账号策略、`test-upload` 桶，以及测试机到 MinIO 的网络连通性。

### 本机无法直连 MinIO 时使用 SSH 隧道

若本机无法访问 `192.168.31.129:9000`，但可 SSH 登录 MinIO 服务器，可在另一个终端保持如下隧道连接：

```bash
ssh -N -L 127.0.0.1:19000:127.0.0.1:9000 root@192.168.31.129
```

保留隧道终端运行，在页面的“MinIO API 地址”中填入 `http://127.0.0.1:19000`，再输入 `test-upload`、专用 Access Key 和 Secret Key 后点击“连接 MinIO”。SSH 隧道只转发 API 9000；测试页面不需要也不应转发 MinIO 管理控制台 9001。

## 页面实时连接配置

页面顶部提供 MinIO API 地址、存储桶、Access Key 与 Secret Key 输入框。点击“连接 MinIO”后，服务会先尝试列出该桶，以验证地址、网络和权限。成功时，凭据只保存在测试服务的内存会话中；浏览器保存随机会话标识，并接收一个仅用于图片、视频和下载请求的 `HttpOnly` 同源 Cookie。两者都不是 MinIO 凭据；服务重启、点击“断开连接”或一小时超时后，该会话自动失效。

不要在页面中输入 MinIO 根管理员凭据。请使用本手册前面创建的、仅限 `test-upload` 桶的专用账号。页面用于内网测试，不应对公网开放。

## 运维与安全边界

```bash
# 查看日志、重启或停止独立测试页面
cd /opt/minio-test-web
docker compose logs -f minio-test-web
docker compose restart minio-test-web
docker compose stop
```

- 此页面无登录，能访问页面的内网用户都可上传和读取 `test-upload` 中的文件；不要上传敏感数据。
- 页面不提供删除功能。清理测试对象应由 MinIO 管理员在明确确认后执行。
- `MAX_UPLOAD_BYTES` 默认 50 MiB。上传会经过测试服务器内存，因此提高该值前应评估测试服务器内存与并发数。
- 专用 Access Key/Secret 只在页面连接时输入；不要保存到 `.env`、代码仓库或网页源码中，也不要复制 MinIO 根管理员凭据。
