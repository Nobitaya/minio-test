# MinIO 测试页面：Docker + Nginx 同机部署手册

本文用于以下拓扑：**MinIO 与 `minio-test-web` 部署在同一台服务器**，Nginx 只对外代理测试页面。浏览器使用页面中的“服务端代理（Docker / 内网）”模式；测试页面容器再访问 MinIO S3 API。

```text
测试人员浏览器
       │ HTTPS 443
       ▼
Nginx（minio-test.example.com）
       │ 127.0.0.1:8085
       ▼
minio-test-web Docker 容器
       │ S3 API 9000（同机 Docker 网络或服务器内网 IP）
       ▼
MinIO
```

在该方案中，浏览器**不会直连** MinIO，因此无需配置浏览器 CORS，也不要将 MinIO S3 API 配置为 `https://域名/minio` 这类子路径地址。

## 1. 前提与地址约定

- 已部署的 MinIO S3 API：`192.168.31.129:9000`
- 已部署的 MinIO Console：`192.168.31.129:9001`（仅管理员使用，本测试服务不访问它）
- 测试页面 Nginx 域名示例：`minio-test.example.com`
- 测试桶：`test-upload`
- 页面端口：`127.0.0.1:8085`，仅让本机 Nginx 访问

准备一个只授权 `test-upload` 桶的 MinIO 专用账号。不要将 MinIO 根管理员 Access Key/Secret Key 输入页面。

## 2. 获取并放置项目

在 MinIO 所在服务器执行：

```bash
sudo mkdir -p /opt/minio-test-web
sudo chown "$USER":"$USER" /opt/minio-test-web
git clone https://github.com/Nobitaya/minio-test.git /opt/minio-test-web
cd /opt/minio-test-web
```

如果服务器无法访问 GitHub，可在有网络的机器下载或克隆后，将整个项目目录复制到 `/opt/minio-test-web`。

## 3. 仅监听本机 8085

编辑 `/opt/minio-test-web/docker-compose.yml`，将 `ports` 中的这一行：

```yaml
- "${WEB_PORT:-8085}:8085"
```

替换为：

```yaml
- "127.0.0.1:${WEB_PORT:-8085}:8085"
```

这样 Docker 测试服务不会直接暴露在服务器网卡上，外部访问只能经过 Nginx。

> 不要将该地址改为 `127.0.0.1:9000` 作为页面中的 MinIO API 地址。`127.0.0.1` 在测试页面容器内指向它自己，并不是宿主机或 MinIO 容器。

## 4. 启动测试页面容器

在项目目录执行：

```bash
cd /opt/minio-test-web
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 minio-test-web
curl -I http://127.0.0.1:8085/
```

最后一条命令应返回 `HTTP/1.1 200 OK`。常用运维命令：

```bash
cd /opt/minio-test-web
docker compose logs -f minio-test-web
docker compose restart minio-test-web
docker compose down
```

## 5. 配置 Nginx 代理测试页面

创建 `/etc/nginx/conf.d/minio-test-web.conf`。证书路径请替换为自己的实际路径；若暂未配置 HTTPS，可先使用 80 端口进行内网验证，再配置证书。

```nginx
server {
    listen 443 ssl http2;
    server_name minio-test.example.com;

    ssl_certificate     /etc/nginx/certs/minio-test.example.com.crt;
    ssl_certificate_key /etc/nginx/certs/minio-test.example.com.key;

    # 应不小于页面允许上传的文件大小；页面默认限制为 50 MiB。
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 上传和视频在线播放不在 Nginx 侧缓冲。
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://minio-test.example.com/
```

**Nginx 不需要、也不应该在此虚拟主机中代理 MinIO `:9000` 或 Console `:9001`。** 页面调用 `/api/*` 时会自动被转发到测试服务；再由测试服务访问 MinIO。

## 6. 页面连接参数

浏览器访问：

```text
https://minio-test.example.com
```

选择“服务端代理（Docker / 内网）”，填写：

| 字段 | 推荐值 |
| --- | --- |
| MinIO API 地址 | `http://192.168.31.129:9000`，或同一 Docker 网络中的 `http://minio:9000` |
| 桶 | `test-upload` |
| Access Key / Secret Key | 只限 `test-upload` 桶的专用测试账号 |

MinIO API 地址必须是根地址，不要填：

```text
http://域名:9000/minio
```

原因是 MinIO S3 API 的 SigV4 签名不能可靠地经过 `/minio` 这类 URI 前缀重写。若未来确实需要对外代理 S3 API，应使用独立域名的根路径，例如 `https://s3-test.example.com`，而非子路径。

## 7. 服务器防火墙与安全组

建议规则：

| 端口 | 来源 | 用途 |
| --- | --- | --- |
| 443/TCP | 被授权的测试人员网段 | Nginx 测试页面 |
| 8085/TCP | 仅 `127.0.0.1` | Docker 测试服务；由 Compose 绑定控制 |
| 9000/TCP | 仅本机 Docker 网络或必要的内网来源 | MinIO S3 API |
| 9001/TCP | 仅管理员网段 | MinIO Console；不对测试人员开放 |

如果 MinIO 运行在另一个 Docker Compose 项目中，推荐让两个容器加入同一个 Docker 网络，再在页面中使用 MinIO 的容器服务名（例如 `http://minio:9000`）。若暂时使用服务器 IP `192.168.31.129:9000`，请确认主机防火墙允许 Docker 网桥网段访问该端口。

## 8. 验收与故障排查

1. `docker compose ps` 显示 `minio-test-web` 为 `running`。
2. `curl -I http://127.0.0.1:8085/` 返回 200。
3. Nginx 域名首页可以打开，并在页面选择“服务端代理（Docker / 内网）”。
4. 使用受限账号连接 `test-upload`，上传一个非敏感文件并验证预览、下载。

| 现象 | 处理方式 |
| --- | --- |
| 页面 502 | `docker compose ps` 和 `docker compose logs -f minio-test-web`；确认 Nginx 上游仍为 `127.0.0.1:8085` |
| 页面能打开但连接 MinIO 失败 | 在容器内检查到 `192.168.31.129:9000` 的网络和防火墙；确认桶、受限账号与策略 |
| 连接时填 `127.0.0.1:9000` 失败 | 改用服务器 IP，或将两个容器加入同一 Docker 网络后使用 `http://minio:9000` |
| 出现 `/minio` 或签名错误 | 移除 MinIO API 地址中的 `/minio`；S3 API 使用根路径 |

