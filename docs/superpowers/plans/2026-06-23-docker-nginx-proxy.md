# Docker Nginx Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run an Nginx Docker container on `192.168.31.129` that exposes the MinIO test page on HTTP port 80 and proxies it to `minio-test-web:8085`.

**Architecture:** Nginx and the existing test-page container join `minio-test-web-net`. Nginx publishes `80:80`, mounts its host configuration from `/docker/nginx/conf.d`, and resolves `minio-test-web` using Docker DNS. The test-page container remains bound only to host loopback on port 8085.

**Tech Stack:** Docker Engine 27, `nginx:alpine`, Docker user-defined bridge networking, Nginx reverse proxy.

---

## File Structure

- Create on `192.168.31.129`: `/docker/nginx/conf.d/minio-test-web.conf` — HTTP virtual host and upstream proxy configuration.
- Create on `192.168.31.129`: Docker container `minio-test-nginx` — Nginx container publishing port 80 and mounting `/docker/nginx/conf.d` read-only.
- Modify: `DEPLOY_OFFLINE_DOCKER_IMAGE.md` — document Nginx-container deployment and the 80/TCP access URL.

### Task 1: Preflight the Nginx deployment

**Files:**

- Read: Docker network `minio-test-web-net`
- Read: host port `80/TCP`
- Read: container `minio-test-web`

- [ ] **Step 1: Verify the application container and Docker network**

Run on `192.168.31.129`:

```bash
docker ps --filter name='^/minio-test-web$' --format '{{.Names}} {{.Status}} {{.Networks}}'
docker network inspect minio-test-web-net --format '{{.Name}} {{range .Containers}}{{.Name}} {{end}}'
```

Expected: `minio-test-web` is running and belongs to `minio-test-web-net`.

- [ ] **Step 2: Verify port 80 is unused**

Run on `192.168.31.129`:

```bash
ss -ltn 'sport = :80'
```

Expected: only the table header is shown; no process listens on port 80.

### Task 2: Create the Nginx mounted configuration

**Files:**

- Create: `/docker/nginx/conf.d/minio-test-web.conf`

- [ ] **Step 1: Create the host configuration directory**

Run on `192.168.31.129`:

```bash
mkdir -p /docker/nginx/conf.d
```

Expected: `/docker/nginx/conf.d` exists and is writable by root.

- [ ] **Step 2: Write the reverse-proxy virtual host**

Create `/docker/nginx/conf.d/minio-test-web.conf` with:

```nginx
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 100m;

    location / {
        proxy_pass http://minio-test-web:8085;
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

Expected: Nginx proxies all page and `/api/*` requests to the Docker DNS endpoint `minio-test-web:8085`.

### Task 3: Start and validate the Nginx container

**Files:**

- Create: Docker container `minio-test-nginx`

- [ ] **Step 1: Pull the Nginx image**

Run on `192.168.31.129`:

```bash
docker pull nginx:alpine
```

Expected: Docker reports a downloaded or up-to-date `nginx:alpine` image.

- [ ] **Step 2: Validate the mounted Nginx configuration**

Run on `192.168.31.129`:

```bash
docker run --rm \
  --network minio-test-web-net \
  -v /docker/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:alpine nginx -t
```

Expected: `syntax is ok` and `test is successful`.

- [ ] **Step 3: Start Nginx on port 80**

Run on `192.168.31.129`:

```bash
docker run -d \
  --name minio-test-nginx \
  --restart unless-stopped \
  --network minio-test-web-net \
  -p 80:80 \
  -v /docker/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:alpine
```

Expected: Docker returns the new container ID.

- [ ] **Step 4: Validate server-local proxy access**

Run on `192.168.31.129`:

```bash
curl --connect-timeout 5 --max-time 10 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/
```

Expected: `200`.

- [ ] **Step 5: Validate container state and public bind**

Run on `192.168.31.129`:

```bash
docker ps --filter name='^/minio-test-nginx$' --format '{{.Names}} {{.Status}} {{.Ports}} {{.Networks}}'
ss -ltn 'sport = :80'
```

Expected: `minio-test-nginx` is running, belongs to `minio-test-web-net`, and the host listens on `0.0.0.0:80`.

### Task 4: Update the offline deployment documentation

**Files:**

- Modify: `DEPLOY_OFFLINE_DOCKER_IMAGE.md`

- [ ] **Step 1: Add the Docker Nginx deployment command and mounted configuration path**

Document `/docker/nginx/conf.d/minio-test-web.conf`, the `nginx:alpine` Docker command from Task 3, and the access URL `http://192.168.31.129/`.

- [ ] **Step 2: Add the Nginx verification command**

Document:

```bash
curl -I http://127.0.0.1/
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 3: Commit the documentation**

```bash
git add DEPLOY_OFFLINE_DOCKER_IMAGE.md
git commit -m "docs: add Docker Nginx proxy deployment"
```
