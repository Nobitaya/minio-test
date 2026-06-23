# MinIO 测试页面 Docker Nginx 代理设计

## 目标

在 `192.168.31.129` 上以 Docker 部署 Nginx，为现有 `minio-test-web` 服务提供内网 HTTP 入口。访问地址为 `http://192.168.31.129/`。

## 架构

```text
浏览器 → 宿主机 80/TCP → minio-test-nginx → minio-test-web:8085 → MinIO:9000
```

- `minio-test-nginx` 使用 `nginx:alpine`，仅发布 `80:80`。
- Nginx 与已运行的 `minio-test-web` 都加入 `minio-test-web-net` 专用 Docker 网络。
- Nginx 上游使用 Docker DNS 名称 `minio-test-web:8085`，不经过宿主机 Docker 端口转发。
- `minio-test-web` 继续仅发布 `127.0.0.1:8085:8085`，不直接向局域网开放。
- Nginx 配置文件存放在宿主机 `/docker/nginx/conf.d/minio-test-web.conf`，以只读卷挂载到容器 `/etc/nginx/conf.d`。

## 配置要求

- Nginx 监听 HTTP 80；本阶段不配置域名或 TLS。
- 请求正文限制为 100 MiB，与页面默认 50 MiB 上传限制兼容。
- 关闭 Nginx 请求和响应缓冲，保持上传进度与视频流行为。
- 代理转发标准 Host、客户端 IP 与转发协议信息。
- Nginx 不代理 MinIO S3 API 9000 或 Console 9001；浏览器只访问测试页面。

## 验证标准

1. `minio-test-nginx` 容器为 running，并连接 `minio-test-web-net`。
2. 服务器本机访问 `http://127.0.0.1/` 返回 HTTP 200。
3. 局域网访问 `http://192.168.31.129/` 返回 HTTP 200。
4. `minio-test-web` 仍只监听 `127.0.0.1:8085`。

## 边界

- 不改动 MinIO 容器、MinIO 数据目录 `/docker/minio` 或 9000/9001 端口映射。
- 不创建 HTTPS 证书；后续拥有域名和证书后再增加 443 配置。
