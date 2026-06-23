# MinIO 测试页面：离线 Docker 镜像部署手册

本文适用于已经拿到镜像文件 `minio-test-web-1.0.0-linux-amd64.tar` 的场景。目标服务器**不需要**项目源码、GitHub、Docker Hub 或 npm Registry 访问权限。

镜像运行的是服务端代理模式：浏览器访问测试页面，页面后端再访问 MinIO S3 API。因此浏览器不直连 MinIO，也不需要 MinIO CORS。

```text
浏览器 → Nginx（HTTPS） → minio-test-web 容器 → MinIO S3 API
```

## 1. 准备镜像文件

当前镜像：

```text
文件：minio-test-web-1.0.0-linux-amd64.tar
镜像：minio-test-web:1.0.0
架构：linux/amd64
SHA-256：9908af6808db64cae97dd64a55df27d19825471433f8c8f7830dd3ec6f3bd3c7
```

将 tar 文件通过 SCP、SFTP、U 盘或企业文件传输工具复制到目标服务器，例如：

```bash
sudo mkdir -p /docker/minio-test-web
sudo mv minio-test-web-1.0.0-linux-amd64.tar /docker/minio-test-web/
cd /docker/minio-test-web
sha256sum minio-test-web-1.0.0-linux-amd64.tar
```

校验值必须与上方 SHA-256 完全一致。

## 2. 加载镜像

```bash
docker load -i /docker/minio-test-web/minio-test-web-1.0.0-linux-amd64.tar
docker image inspect minio-test-web:1.0.0 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

预期看到 `linux/amd64`。如果该服务器就是构建镜像的服务器，镜像已加载，可跳过 `docker load`。

## 3. 创建专用 Docker 网络

不要依赖 Docker 默认的 `bridge` 网络。部分服务器的默认 `172.17.0.0/16` 与既有路由冲突，会表现为容器内部正常、但宿主机访问发布端口时被重置。

以下示例使用 `172.30.250.0/24`。若该网段已被你的网络使用，请选择一个未冲突的私有 `/24` 网段：

```bash
docker network create \
  --driver bridge \
  --subnet 172.30.250.0/24 \
  minio-test-web-net

ip route get 172.30.250.2
```

最后一条命令应显示该地址经一个 `br-...` Docker bridge 路由，而不是经业务网关路由。

## 4. 启动容器

以下命令将页面仅绑定到本机 `127.0.0.1:8085`，由 Nginx 对外提供访问：

```bash
docker run -d \
  --name minio-test-web \
  --restart unless-stopped \
  --network minio-test-web-net \
  -p 127.0.0.1:8085:8085 \
  minio-test-web:1.0.0
```

检查：

```bash
docker ps --filter name='^/minio-test-web$'
docker logs --tail=100 minio-test-web
curl -I http://127.0.0.1:8085/
```

首页预期返回 `HTTP/1.1 200 OK`。`/api/health` 在尚未于页面中建立 MinIO 会话时返回 401，这是正常行为。

> 若存在旧容器，请先确认它不再使用，然后执行 `docker rm -f minio-test-web`，再运行本节的启动命令。

## 5. Nginx 代理

Nginx 只代理测试页面，不代理 MinIO 的 `9000` 或 Console 的 `9001`：

```nginx
server {
    listen 443 ssl http2;
    server_name minio-test.example.com;

    ssl_certificate     /etc/nginx/certs/minio-test.example.com.crt;
    ssl_certificate_key /etc/nginx/certs/minio-test.example.com.key;
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
```

应用配置：

```bash
nginx -t
systemctl reload nginx
```

## 6. 页面中的 MinIO 连接参数

打开 Nginx 域名后，选择“服务端代理（Docker / 内网）”，输入：

| 字段 | 值 |
| --- | --- |
| MinIO API 地址 | `http://192.168.31.129:9000`；或者同一 Docker 网络的 `http://minio:9000` |
| 桶 | `test-upload` |
| Access Key / Secret Key | 仅具有 `test-upload` 桶权限的专用账号 |

不要使用：

- `http://127.0.0.1:9000`：它在 `minio-test-web` 容器中指向容器自身，不是宿主机 MinIO。
- `http://域名:9000/minio`：MinIO S3 API 不应使用 `/minio` 子路径代理。
- MinIO 根管理员凭据。

## 7. 防火墙与网络

| 端口 | 建议来源 | 用途 |
| --- | --- | --- |
| 443/TCP | 被授权测试人员网段 | Nginx 测试页面 |
| 8085/TCP | 仅 `127.0.0.1` | 测试容器；通过 Docker 端口绑定实现 |
| 9000/TCP | 本机 Docker 网桥或必要内网来源 | MinIO S3 API |
| 9001/TCP | 仅管理员网段 | MinIO Console |

若 MinIO 和测试容器都在同一宿主机但不共享 Docker 网络，使用服务器内网 IP（本例为 `192.168.31.129:9000`）时，要确认主机防火墙允许 Docker 网桥网段访问 9000。

## 8. 升级与回滚

新版本镜像 tar 到达后：

```bash
docker load -i /docker/minio-test-web/minio-test-web-NEW-linux-amd64.tar
docker rm -f minio-test-web
docker run -d \
  --name minio-test-web \
  --restart unless-stopped \
  --network minio-test-web-net \
  -p 127.0.0.1:8085:8085 \
  minio-test-web:NEW
```

保留旧镜像标签即可回滚：停止并删除当前容器后，使用旧标签重新执行 `docker run`。该服务不保存文件和连接凭据；MinIO 文件仍保存在 MinIO 自身的数据目录中。
