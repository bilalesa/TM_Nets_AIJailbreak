# TM_Nets_AIJailbreak

## Deployment Targets

- Backend: Docker container on AWS EC2
- Frontend: Vercel (Next.js)

## Enterprise Architecture (Current)

- `frontend/src/app/api/game/chat/route.ts` is now a thin proxy only.
- LLM generation and anti-cheat checks run on backend EC2 at `POST /api/games/chat`.
- Nginx reverse proxy fronts backend containers (`docker-compose.yml` + `deploy/nginx/*`).

## Performance Reality Check (300+ concurrent users)

300+ concurrent users is achievable only if request shedding/backpressure is enabled and LLM provider quotas are sized appropriately.

This project now includes:

- Backend LLM backpressure and queue limits (`LLM_MAX_CONCURRENT_REQUESTS`, `LLM_MAX_QUEUE_SIZE`)
- Backend LLM timeout and fail-fast behavior (`LLM_TIMEOUT_MS`)
- Backend route rate limiting and JSON body limits
- Vercel API route LLM queue/concurrency limits and timeout controls
- Graceful shutdown and HTTP server timeout settings on backend

Without these controls, spikes can pile up pending promises and trigger latency cliffs or container restarts.

## Backend (EC2 + Docker)

### 1. Configure environment

1. Copy `backend/.env.example` to `backend/.env`.
2. Set all required secrets and origins.
3. Set `CORS_ORIGINS` to your Vercel domain(s), comma separated.

### 2. Build and run

```bash
docker compose up -d --build
```

Validate compose syntax before starting:

```bash
docker-compose config -q
```

### 3. Verify health

```bash
curl http://<EC2_PUBLIC_IP>:3001/health
```

Expected response:

```json
{"ok":true}
```

### 4. Secure EC2 networking

1. Allow inbound `22` only from your admin IP.
2. Allow inbound `3001` only from trusted sources (or put backend behind ALB/Nginx and expose `443` only).
3. Enable AWS Security Group egress to required APIs (LLM and Supabase).

### 5. Nginx reverse proxy

- Main config: `deploy/nginx/nginx.conf`
- Site config: `deploy/nginx/default.conf`

What it provides:

- Reverse proxy to backend upstream
- Basic request rate limiting at edge (`limit_req`)
- Security headers
- Upstream timeouts to prevent hung connections
- TLS-ready commented server block for certificate wiring

## Frontend (Vercel)

### 1. Configure environment variables in Vercel

Use values from `frontend/.env.example`.

Critical values:

- `BACKEND_URL` should point to your EC2 backend base URL
- `JWT_SECRET` must match backend `JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` must be server-only

### 2. Deploy

Connect repo to Vercel and deploy `frontend` as the project root.

`frontend/vercel.json` provides:

- API max duration cap
- Security headers
- Region pinning

## Recommended Production Safeguards

1. Put backend behind HTTPS reverse proxy (ALB or Nginx) with TLS 1.2+.
2. Add WAF/rate limits at edge (AWS WAF or Cloudflare).
3. Store secrets in AWS SSM/Secrets Manager and Vercel encrypted env vars.
4. Enable centralized logs and alerting (CloudWatch + alarms).
5. Set autoscaling if using ALB + EC2 Auto Scaling Group.
6. Use a managed Redis store for distributed rate limiting if you run multiple backend replicas.

## Load Test (Capacity Validation)

Run this against backend from a separate machine in the same region:

```bash
k6 run \
	-e API_BASE_URL=http://<EC2_PUBLIC_IP> \
	-e API_PATH=/api/games/chat \
	-e JWT_TOKEN=<JWT_TOKEN> \
	-e STAGE_NUMBER=1 \
	loadtest/k6-chat-load.js
```

The script `loadtest/k6-chat-load.js` runs three scenarios:

- `chat_100`: constant 100 virtual users for 2 minutes
- `chat_300`: constant 300 virtual users for 2 minutes
- `chat_500`: constant 500 virtual users for 2 minutes

How it works:

1. Each virtual user repeatedly calls `POST /api/games/chat` with realistic payload.
2. Auth is passed via `Authorization: Bearer <JWT_TOKEN>`.
3. Responses `200`, `429`, `503`, and `504` are treated as expected behavior under load.
4. Any other status increments `unexpected_errors`.
5. Thresholds enforce global SLOs:
	 - `http_req_failed < 5%`
	 - `p95 < 2500ms`, `p99 < 5000ms`
	 - expected availability > 95%
	 - unexpected errors count below cap

Pass criteria to target before production launch:

- P95 latency under your SLO (example `< 2.5s`)
- Error rate `< 1%` excluding intentional `429/503`
- No container restarts/OOM during 10-15 minute sustained test

## Important Architecture Note

Centralizing LLM on backend gives you a single control plane for:

- queue/backpressure
- rate limiting
- timeout policy
- observability and scaling