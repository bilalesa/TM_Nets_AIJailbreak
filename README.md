# TM_Nets_AIJailbreak

An interactive AI jailbreak challenge where players attempt to prompt-inject various LLM personas to retrieve secret flags across multiple stages.

## Architecture

- **Frontend**: Next.js (React) application configured for deployment on Vercel.
- **Backend**: Node.js/Express API running in Docker, designed for AWS EC2 behind an Nginx reverse proxy.
- **Data & Caching**: Supabase (PostgreSQL) for persistence and Redis for queueing/rate-limiting.

## Local Development

### 1. Backend Setup

```bash
cd backend
cp .env.example .env  # Configure SUPABASE_URL, LLM_API_ENDPOINT, REDIS_URL
docker compose up -d --build
```
> The backend runs on `http://localhost:3001` by default. Verify its health by visiting `http://localhost:3001/health`.

### 2. Frontend Setup

```bash
cd frontend
cp .env.example .env.local  # Set NEXT_PUBLIC_BACKEND_URL to your backend
npm install
npm run dev
```
> The frontend runs locally on `http://localhost:3000`.

## Production Deployment

### Backend (AWS EC2)

1. Provision an EC2 instance and install Docker / Docker Compose.
2. Clone the repository and configure `backend/.env` with production secrets. Set `CORS_ORIGINS` to match your Vercel frontend domain.
3. Use the provided Nginx configuration (`deploy/nginx/`) as a reverse proxy.
4. Run `docker compose up -d --build`.

### Frontend (Vercel)

1. Import the repository into Vercel, setting the root directory to `frontend/`.
2. Configure all environment variables. Set `BACKEND_URL` pointing to your EC2 instance's public IP or domain.
3. Deploy.

## Performance & Security

- **Concurrency Handling**: The backend implements dedicated LLM backpressure, request shedding, and queue limiters to support high-traffic (300+ concurrent players) efficiently without crashing. 
- **Security Guardrails**: Built with comprehensive security controls including JWT-based auth, recovery codes, IP fingerprinting, and strict CORS.
