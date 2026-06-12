# AI Jailbreak Game Platform — Comprehensive Technical Documentation

> **Target audience:** A technical team wanting to understand, replicate, or extend this platform for their own event.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Game Mechanics](#2-game-mechanics)
3. [Architecture Overview](#3-architecture-overview)
4. [Tech Stack](#4-tech-stack)
5. [Repository Structure](#5-repository-structure)
6. [How It Works — Technical Flow](#6-how-it-works--technical-flow)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [Authentication System](#9-authentication-system)
10. [LLM Integration](#10-llm-integration)
11. [Anti-Cheat System](#11-anti-cheat-system)
12. [Stage Configuration](#12-stage-configuration)
13. [Infrastructure Setup Guide](#13-infrastructure-setup-guide)
14. [Local Development Setup](#14-local-development-setup)
15. [Environment Variables Reference](#15-environment-variables-reference)
16. [Admin Panel](#16-admin-panel)
17. [Security Features](#17-security-features)
18. [Scaling Considerations](#18-scaling-considerations)
19. [Cost Estimates](#19-cost-estimates)

---

## 1. Project Overview

**TM Nets AI Jailbreak** is a competitive, multiplayer cybersecurity challenge game where players attempt to manipulate AI personas through prompt injection in order to extract secret codes. The platform was built for Trend Micro's internal Nets networking event and is designed to educate participants about social engineering, prompt injection, and AI security concepts in a fun, gamified context.

### What Players Do

Players register with a username and are presented with five sequential AI-guarded "stages." Each stage is a different AI persona with a distinct fictional backstory, a security flaw, and a hidden secret code. Players chat with the AI, attempting to exploit its described flaw through clever prompting. When they trick the AI into revealing the secret code, they copy it and submit it to advance to the next stage, earning XP along the way.

### Purpose

- Raise awareness of prompt injection and AI manipulation techniques in a hands-on, accessible way.
- Create competitive engagement through a real-time leaderboard.
- Demonstrate how LLMs can be systematically deceived through social engineering, authority framing, and logical paradoxes.

### Key Design Principles

- **No password logins** — players register by choosing a username and receive a one-time recovery code for account recovery.
- **Player-specific secret codes** — each player receives a unique variant of the stage secret (derived via HMAC), preventing code sharing.
- **Anti-cheat by design** — winning prompts are hashed and blocked for future players; profanity is filtered; copy-paste attacks are detected.
- **Resilient under load** — a BullMQ job queue with a dedicated worker process decouples LLM calls from the HTTP request lifecycle.

---

## 2. Game Mechanics

### The Five Stages

Each stage is an AI persona with a specific weakness players must exploit. Stages must be completed in order.

| Stage | Name | Persona | Flaw | Base XP |
|-------|------|---------|------|---------|
| 1 | The Firewall | Perimeter Defense Bot | Over-trusts messages that sound technical or system-like | 20 |
| 2 | The Gatekeeper | Access Control Protocol | Intimidated by authority; yields to perceived executives | 40 |
| 3 | The Cipher | Data Encryption Handler | Follows formatting instructions literally; outputs transformed versions of the secret | 60 |
| 4 | The Bunker | Emergency Response Unit | Releases code when convinced of a catastrophic emergency | 80 |
| 5 | The Sentinel | Core Defense Intelligence | Logical reasoning breaks down after 3+ consistent, internally coherent philosophical messages | 100 |

### How to Crack a Stage

1. Read the stage's scenario description to understand the AI's persona and vulnerability.
2. Send chat messages to the AI trying to exploit the flaw.
3. When the AI reveals the secret code in its response, the UI detects the success and shows a hint: `"System bypassed... you got the code. Now lock it in place by clicking Enter the code to proceed."`
4. Click "Enter the code" and type the code exactly as shown.
5. The backend validates the code server-side and awards XP if correct.

### Scoring System

XP is calculated when a player submits a correct code:

```
Score = baseXP + timeBonus
```

**Time Bonus** (up to 50% of baseXP):
- Completion in under 60 seconds → full bonus (50% of baseXP)
- 60–300 seconds → linear decay from 50% down to 0%
- Over 300 seconds → no bonus

**Example for Stage 3 (baseXP = 60):**
- Solved in 30s → 60 + 30 = **90 XP**
- Solved in 180s → 60 + 15 = **75 XP**
- Solved in 400s → 60 + 0 = **60 XP**

### Leaderboard Ranking

Players are ranked by `total_score` (descending). Ties are broken by `totalSeconds` (total time across all completed stages, ascending — faster is better).

The public leaderboard shows the top 10 players. The full ranked list is also returned in the API response for full leaderboard display.

### Player-Specific Secret Codes

Each player receives a unique variant of the stage secret code. The code is derived using HMAC-SHA256:

```
dynamicCode = baseSecretCode + "-" + HMAC(STAGE_CODE_SEED, playerId:stageNumber:baseSecretCode)[0:6].toUpperCase()
```

For example, a player might receive `SHIELDWALL-A3F2B1` while another receives `SHIELDWALL-D9E4C7`. This means:
- Players cannot share codes.
- The correct code is different for every player on every stage.
- Stage 3 (The Cipher) also pre-computes the reversed form of the dynamic code and injects it into the system prompt so the AI can answer "give me this in reverse" correctly.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              PLAYERS / BROWSERS                            │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │ HTTPS
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         VERCEL (Edge Network)                              │
│                                                                            │
│   Next.js 16 Frontend (React 19 + Tailwind CSS)                           │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │  Pages: /  /stage/[id]  /leaderboard  /admin/*                  │    │
│   │  API Routes (thin proxies): /api/auth/*  /api/game/*             │    │
│   │                              /api/admin/*  /api/players/*        │    │
│   │                                                                  │    │
│   │  Supabase Realtime (broadcast only):                             │    │
│   │    player_joined event (on signup)                               │    │
│   │    score_updated event (on stage completion)                     │    │
│   └──────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │ HTTP (private, backend URL)
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         AWS EC2 Instance (Docker)                          │
│                                                                            │
│   ┌─────────────┐   ┌──────────────────────────────────────────────────┐  │
│   │   nginx     │   │  Docker Compose Network: tm_nets_aijailbreak_default│
│   │ (port 80)   │   │                                                  │  │
│   │  reverse    │──▶│  ┌──────────────┐    ┌──────────────────────┐   │  │
│   │  proxy      │   │  │  backend     │    │  worker              │   │  │
│   └─────────────┘   │  │  (port 3001) │    │  (llmWorker.js)      │   │  │
│        ▲            │  │  Express API │    │  BullMQ consumer     │   │  │
│        │            │  └──────┬───────┘    └──────────┬───────────┘   │  │
│    ALB (AWS)        │         │                       │               │  │
│                     │         └──────────┬────────────┘               │  │
│                     │                    ▼                             │  │
│                     │  ┌──────────────────────────────────────────┐   │  │
│                     │  │  Redis 7 (port 6379)                     │   │  │
│                     │  │  BullMQ job queue: llm-queue             │   │  │
│                     │  └──────────────────────────────────────────┘   │  │
│                     └──────────────────────────────────────────────────┘  │
└────────────────────────┬──────────────────────────────────────────────────┘
                         │
           ┌─────────────┴──────────────┐
           │                            │
           ▼                            ▼
┌────────────────────┐      ┌──────────────────────────┐
│  AWS Aurora        │      │  Enterprise LLM API       │
│  Serverless v2     │      │  (OpenAI-compatible       │
│  PostgreSQL        │      │   custom endpoint)        │
│  (DATABASE_URL)    │      │  (LLM_API_ENDPOINT)       │
└────────────────────┘      └──────────────────────────┘
```

### Request Flow Summary

1. Browser makes a request to Vercel (e.g., `POST /api/game/chat`).
2. Vercel Next.js API route acts as a thin proxy — it reads the `game_session_token` HttpOnly cookie, forwards it as a `Bearer` token in the `Authorization` header, and proxies the request to the backend.
3. nginx on EC2 receives the request on port 80, sets `X-Forwarded-For`, and passes it to the Express backend container.
4. Express middleware validates the JWT, runs rate limiting, and routes to the appropriate controller.
5. For chat: the controller enqueues a BullMQ job on Redis. The response is `{ jobId, status: "queued" }`.
6. The worker container picks up the job, builds the LLM prompt, calls the enterprise LLM API, detects success, logs to Aurora, and returns the result.
7. The frontend polls `GET /api/game/chat/result/:jobId` until `status === "completed"`.
8. On code validation: the frontend calls `POST /api/game/validate-code`, which the proxy forwards to the backend with the JWT; the backend validates server-side and updates Aurora.

---

## 4. Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.1 | React framework, App Router, server components, API routes |
| React | 19.2.4 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first styling |
| Framer Motion | 12.x | Animations (stage transitions, modals) |
| Lucide React | 1.x | Icon library |
| @supabase/supabase-js | 2.x | Realtime broadcast only (not DB) |
| jsonwebtoken | 9.x | JWT decode on frontend for admin sessions |
| Vercel | — | Deployment platform (global CDN, serverless edge) |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20+ | Runtime |
| TypeScript | 6.x | Type safety |
| Express | 5.x | HTTP server and routing |
| BullMQ | 5.x | Redis-backed job queue for LLM calls |
| ioredis | 5.x | Redis client |
| openai (SDK) | 6.x | LLM API calls (OpenAI-compatible) |
| jsonwebtoken | 9.x | JWT issuance and verification |
| bcryptjs | 2.x | Admin password hashing |
| helmet | 8.x | HTTP security headers |
| cors | 2.x | CORS enforcement |
| express-rate-limit | 8.x | Rate limiting |
| pg | 8.x | PostgreSQL client (native pool) |
| Docker / Docker Compose | — | Containerization and orchestration |

### Infrastructure

| Component | Technology |
|-----------|------------|
| Database | AWS Aurora Serverless v2 (PostgreSQL-compatible) |
| Queue | BullMQ + Redis 7 (local Docker container) |
| Backend Hosting | AWS EC2 (Docker Compose) |
| Reverse Proxy | nginx 1.27 |
| Load Balancer | AWS Application Load Balancer (ALB) |
| Frontend Hosting | Vercel |
| Realtime Events | Supabase Realtime (broadcast channel, no DB access) |

### Why This Stack?

- **Next.js on Vercel** provides zero-config global deployment, instant scale-out, and built-in API routes that act as a secure proxy layer, keeping the backend URL out of the browser entirely.
- **Express in Docker** gives full control over the Node.js process, timeouts, and graceful shutdown without the constraints of serverless functions (critical for LLM calls which take 5–15 seconds).
- **BullMQ** prevents the Express server from being overwhelmed during event bursts. LLM calls are fire-and-forget from the HTTP handler; the worker drains the queue at a controlled concurrency.
- **Aurora Serverless v2** auto-scales to zero between events (cost-effective) and scales up during the event, with no connection management overhead beyond the pg connection pool.
- **Supabase Realtime** is used exclusively for broadcasting `player_joined` and `score_updated` events to all connected clients without polling. No database access goes through Supabase — all reads/writes go through Aurora.

---

## 5. Repository Structure

```
TM_Nets_AIJailbreak/
├── README.md                        # Quick-start guide
├── DOCUMENTATION.md                 # This file
├── docker-compose.yml               # Orchestrates: backend, worker, redis, nginx
│
├── backend/
│   ├── Dockerfile                   # Multi-stage Node.js build
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                 # Environment variable template
│   └── src/
│       ├── index.ts                 # Express server entry point
│       ├── config/
│       │   ├── stageConfig.ts       # All 5 stage definitions (system prompts, secrets)
│       │   └── supabase.ts          # pg.Pool configuration (misnamed; uses Aurora, not Supabase)
│       ├── controllers/
│       │   ├── authController.ts    # startSession, recoverSession
│       │   ├── gameController.ts    # chatPrompt, getChatResult, getPublicLeaderboard
│       │   ├── validateCodeController.ts  # validateCode (XP calculation + completion)
│       │   ├── adminController.ts   # All admin operations
│       │   ├── profileController.ts # getPlayerProfile, getStageHistory
│       │   └── playerController.ts  # getMyProfile (lightweight player info)
│       ├── middlewares/
│       │   ├── authMiddleware.ts    # JWT verification for players
│       │   ├── adminAuthMiddleware.ts  # JWT verification for admins
│       │   ├── gameMiddleware.ts    # Input validation for chat requests
│       │   └── usernameValidationMiddleware.ts  # Username sanitization
│       ├── routes/
│       │   ├── authRoutes.ts        # POST /api/auth/start, /api/auth/recover
│       │   ├── gameRoutes.ts        # POST /api/games/chat, GET /api/games/leaderboard, etc.
│       │   ├── playerRoutes.ts      # GET /api/players/me, /profile, /stage-history
│       │   └── adminRoutes.ts       # All /api/admin/* routes
│       ├── services/
│       │   ├── llmService.ts        # OpenAI client, concurrency limiter, fallback model
│       │   ├── llmQueueService.ts   # BullMQ queue definition, metrics
│       │   └── embeddingService.ts  # Anti-cheat: copy-paste detection via prompt hash
│       ├── workers/
│       │   └── llmWorker.ts         # BullMQ worker: builds prompts, calls LLM, logs results
│       └── utils/
│           ├── stageCode.ts         # HMAC-based player-specific code derivation
│           ├── recoveryCode.ts      # scrypt-hashed recovery code generation/verification
│           ├── promptHash.ts        # SHA-256 hash of normalized prompt (anti-cheat)
│           ├── identityLock.ts      # Builds [IDENTITY LOCK] system prompt suffix
│           ├── identityGuard.ts     # Output-side regex filter for model name leaks
│           └── profanity.ts         # Profanity word list and check function
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── .env.example
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Landing/signup page
│       │   ├── layout.tsx           # Root layout
│       │   ├── leaderboard/
│       │   │   └── page.tsx         # Public leaderboard page
│       │   ├── stage/
│       │   │   ├── page.tsx         # Stage selection / hub
│       │   │   └── [id]/page.tsx    # Individual stage chat interface
│       │   ├── admin/
│       │   │   ├── login/page.tsx   # Admin login
│       │   │   └── (authed)/        # Protected admin pages (layout checks JWT cookie)
│       │   │       ├── page.tsx     # Admin dashboard (stats)
│       │   │       ├── players/     # Player list + individual player view
│       │   │       ├── stages/      # Stage config editor
│       │   │       ├── leaderboard/ # Admin leaderboard (all players, incl. banned)
│       │   │       ├── audit/       # Audit log viewer
│       │   │       └── system/      # Wipe system
│       │   └── api/                 # Next.js API routes (all thin proxies to backend)
│       │       ├── auth/start/      # POST: signup, sets HttpOnly cookie
│       │       ├── auth/recover/    # POST: session recovery
│       │       ├── game/chat/       # POST: send chat message
│       │       ├── game/chat/result/[jobId]/  # GET: poll job result
│       │       ├── game/validate-code/  # POST: submit code, broadcast score_updated
│       │       ├── game/leaderboard/    # GET: public leaderboard
│       │       ├── game/player/         # GET: player profile
│       │       ├── game/stage-history/  # GET: prompt history for a stage
│       │       ├── players/me/          # GET: lightweight player info
│       │       └── admin/*              # All admin API proxies
│       ├── components/
│       │   └── game/
│       │       ├── Sidebar.tsx      # Stage list sidebar with progress
│       │       ├── EnterCodeModal.tsx   # Code submission dialog
│       │       ├── StageCompleteModal.tsx  # XP award animation
│       │       ├── HowToPlayModal.tsx   # Rules modal
│       │       └── ExitModal.tsx    # Exit confirmation
│       ├── lib/
│       │   ├── stageConfig.ts       # Frontend-safe stage metadata (no secrets)
│       │   ├── stageCode.ts         # Client-side HMAC for Stage 3 reverse (UI preview only)
│       │   ├── playerSession.ts     # LocalStorage session helpers
│       │   ├── backendUrl.ts        # Resolves backend URL from env
│       │   ├── supabaseClient.ts    # Supabase client for Realtime
│       │   ├── adminAuth.ts         # Admin JWT decode helpers
│       │   ├── promptHash.ts        # Client-side prompt hash (unused in production)
│       │   ├── avatar.ts            # Deterministic avatar generation from username
│       │   └── db.ts                # Direct pg connection (admin panel SSR queries)
│       ├── hooks/
│       │   └── useStopwatch.ts      # Per-stage elapsed time timer
│       └── types/
│           └── game.ts              # Shared TypeScript types
│
└── deploy/
    └── nginx/
        ├── nginx.conf               # Worker processes, logging, MIME types
        └── default.conf             # Upstream definition, proxy_pass to backend:3001
```

---

## 6. How It Works — Technical Flow

### 6.1 Player Signup

```
Browser                 Next.js API Route          Express Backend           Aurora DB
   │                    /api/auth/start              /api/auth/start               │
   │──POST username ──▶│                             │                             │
   │   fingerprint     │── forward + client IP ──▶  │                             │
   │                   │                             │── SELECT players WHERE ──▶  │
   │                   │                             │   username = ?              │
   │                   │                             │◀── 0 rows (available) ──── │
   │                   │                             │── generate recovery code    │
   │                   │                             │── scrypt hash it            │
   │                   │                             │── INSERT player row ──────▶ │
   │                   │                             │── sign JWT (24h)            │
   │                   │◀── { token, recoveryCode } ─│                             │
   │                   │── set HttpOnly cookie       │                             │
   │◀── { username,    │                             │                             │
   │    recoveryCode } │── broadcast player_joined  │                             │
   │                   │   (Supabase Realtime)       │                             │
```

The recovery code is shown to the player **once** and never stored in plaintext. Players must save it to recover their session from another device.

### 6.2 Sending a Chat Message

```
Browser         Next.js API Route       Express Backend          Redis           LLM Worker
   │            /api/game/chat          /api/games/chat             │                │
   │──POST ──▶ │                        │                           │                │
   │           │──Bearer token ───────▶ │                           │                │
   │           │                        │── verify JWT              │                │
   │           │                        │── check prev stage done   │                │
   │           │                        │── profanity check         │                │
   │           │                        │── Stage 3: anagram guard  │                │
   │           │                        │── anti-cheat hash check   │                │
   │           │                        │── enqueueChatJob ────────▶│                │
   │           │                        │◀── { jobId } ─────────── │                │
   │◀── { jobId, status: "queued" } ───│                           │                │
   │                                    │                           │── job data ──▶ │
   │                                    │                           │               │── deriveUserStageCode
   │                                    │                           │               │── build system prompt
   │                                    │                           │               │── buildRuntimeSecretOverride
   │                                    │                           │               │── buildIdentityLock
   │                                    │                           │               │── call LLM API
   │                                    │                           │               │── detectIdentityLeak
   │                                    │                           │               │── detect success (code in response)
   │                                    │                           │               │── INSERT prompt_log
   │                                    │                           │               │── return { response }
```

### 6.3 Polling for Job Result

The frontend polls `GET /api/game/chat/result/:jobId` every ~1.5 seconds.

The backend returns one of:
- `{ status: "waiting" | "active" | "delayed" }` — job not done yet, keep polling
- `{ status: "completed", response: "..." }` — return AI response to UI
- `{ status: "failed", error: "...", retryable: true/false }` — display error

### 6.4 Code Validation and XP Award

```
Browser         Next.js API Route          Express Backend                  Aurora DB
   │            /api/game/validate-code    /api/games/validate-code               │
   │──POST code ──▶│                        │                                     │
   │              │──Bearer token ────────▶ │── verify JWT                        │
   │              │                         │── check not already completed ─────▶│
   │              │                         │── deriveUserStageCode               │
   │              │                         │── compare submitted vs expected     │
   │              │                         │   (case-insensitive)                │
   │              │                         │── get player fingerprint ──────────▶│
   │              │                         │── get first prompt timestamp ──────▶│
   │              │                         │── compute timeBonus                 │
   │              │                         │── INSERT stage_completions ────────▶│
   │              │                         │── UPDATE players.total_score ──────▶│
   │              │                         │── (async) save winning prompt hash ▶│
   │              │◀── { correct, score } ──│                                     │
   │              │── broadcast score_updated                                     │
   │              │   (Supabase Realtime)                                         │
   │◀── result ───│                                                               │
```

---

## 7. Database Schema

All tables live in AWS Aurora Serverless v2 (PostgreSQL). The file `backend/src/config/supabase.ts` is a pg.Pool — the name is a legacy artifact from the initial Supabase setup.

### `players`

```sql
CREATE TABLE players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            TEXT NOT NULL UNIQUE,
  total_score         INTEGER NOT NULL DEFAULT 0,
  session_active      BOOLEAN NOT NULL DEFAULT false,
  is_banned           BOOLEAN NOT NULL DEFAULT false,
  banned_reason       TEXT,
  registration_ip     TEXT,
  client_fingerprint  TEXT,               -- browser fingerprint (max 256 chars)
  recovery_code_hash  TEXT,               -- scrypt$<salt>$<hash>
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ
);
```

### `stage_completions`

```sql
CREATE TABLE stage_completions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stage_number        INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 5),
  score_awarded       INTEGER NOT NULL DEFAULT 0,
  time_taken_seconds  INTEGER NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ,        -- timestamp of player's first prompt for this stage
  submitted_at        TIMESTAMPTZ,        -- timestamp of correct code submission
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_fingerprint  TEXT,
  UNIQUE (player_id, stage_number)        -- one completion per stage per player
);
```

### `prompt_logs`

```sql
CREATE TABLE prompt_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id               UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stage_number            INTEGER NOT NULL,
  prompt_text             TEXT NOT NULL,
  ai_response             TEXT,
  is_successful           BOOLEAN NOT NULL DEFAULT false,    -- true if AI revealed the code
  is_blocked_by_anticheat BOOLEAN NOT NULL DEFAULT false,    -- true if profanity/copy-paste blocked
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `cracked_prompts`

Stores hashes of winning prompts for anti-cheat detection.

```sql
CREATE TABLE cracked_prompts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  prompt_text  TEXT NOT NULL,
  text_hash    TEXT NOT NULL,              -- SHA-256 of normalized prompt
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON cracked_prompts (stage_number, text_hash);
```

### `admin_users`

```sql
CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,           -- bcrypt
  name            TEXT,
  role            TEXT NOT NULL DEFAULT 'viewer',  -- 'viewer' | 'admin' | 'super_admin'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);
```

### `admin_audit_log`

Every admin action is recorded here.

```sql
CREATE TABLE admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES admin_users(id),
  action       TEXT NOT NULL,              -- e.g. 'ban_player', 'daily_wipe', 'update_stage'
  target_type  TEXT,                       -- e.g. 'player', 'stage', 'system'
  target_id    TEXT,
  details      JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `stage_configs` (optional DB-driven config)

Stage configurations can be stored in the database and edited via the admin panel, but the application also works from the hardcoded `SERVER_STAGE_CONFIGS` array in `stageConfig.ts`. This table is used by `adminController.getStages` / `updateStage` for live editing.

```sql
CREATE TABLE stage_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number    INTEGER NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  subtitle        TEXT,
  base_xp         INTEGER NOT NULL,
  secret_code     TEXT NOT NULL,
  system_prompt   TEXT NOT NULL,
  opening_message TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ,
  updated_by      UUID REFERENCES admin_users(id)
);
```

### Entity Relationships

```
players (1) ──── (many) stage_completions
players (1) ──── (many) prompt_logs
players (1) ──── (many) cracked_prompts
admin_users (1) ──── (many) admin_audit_log
admin_users (1) ──── (many) stage_configs (updated_by)
```

---

## 8. API Reference

### Frontend Next.js API Routes (proxy layer, called by the browser)

These routes run on Vercel. They read the `game_session_token` HttpOnly cookie, forward it as a Bearer token to the backend, and return the backend's response.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/start` | None | Register new player. Sets `game_session_token` cookie. Broadcasts `player_joined` event. |
| POST | `/api/auth/recover` | None | Recover session with username + recovery code. Sets cookie. |
| POST | `/api/game/chat` | Cookie | Forward chat message to backend. Returns `{ jobId }`. |
| GET | `/api/game/chat/result/[jobId]` | Cookie | Poll for LLM job result. |
| POST | `/api/game/validate-code` | Cookie | Submit stage code. Broadcasts `score_updated` on success. |
| GET | `/api/game/leaderboard` | None | Get public leaderboard. |
| GET | `/api/game/player` | Cookie | Get current player profile and completions. |
| GET | `/api/game/stage-history` | Cookie | Get prompt/response history for a stage (`?stage=N`). |
| GET | `/api/players/me` | Cookie | Lightweight player info. |
| POST | `/api/admin/login` | None | Admin login. Sets `admin_token` cookie. |
| POST | `/api/admin/logout` | Admin cookie | Clear admin session. |
| GET | `/api/admin/me` | Admin cookie | Get authenticated admin's profile. |
| GET | `/api/admin/players` | Admin cookie | List players (paginated, searchable). |
| GET | `/api/admin/players/[id]` | Admin cookie | Single player detail with completions and prompt logs. |
| DELETE | `/api/admin/players/[id]` | Admin cookie (super_admin) | Delete player. |
| POST | `/api/admin/players/[id]/ban` | Admin cookie | Ban player with reason. |
| POST | `/api/admin/players/[id]/unban` | Admin cookie | Unban player. |
| GET | `/api/admin/leaderboard` | Admin cookie | Full leaderboard including banned players. |
| GET | `/api/admin/stats` | Admin cookie | Platform statistics. |
| GET | `/api/admin/audit` | Admin cookie | Audit log (paginated, filterable). |
| POST | `/api/admin/system/wipe` | Admin cookie (super_admin) | Wipe all players/completions/logs. |
| GET | `/api/admin/stages` | Admin cookie | List all stage configurations. |
| GET | `/api/admin/stages/[number]` | Admin cookie | Get single stage config. |
| PATCH | `/api/admin/stages/[number]` | Admin cookie (admin+) | Update stage config fields. |

### Backend Express API (not called by browsers directly)

Base URL: the internal EC2 address (e.g., `http://<EC2_IP>` via nginx).

**Auth Routes** — rate limited: 40 requests / 10 minutes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/start` | Create player, return JWT + recovery code |
| POST | `/api/auth/recover` | Recover session with recovery code |

**Game Routes** — rate limited: 120 requests / minute (configurable)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/games/chat` | JWT | Validate input, anti-cheat checks, enqueue LLM job |
| GET | `/api/games/chat/result/:jobId` | JWT | Check BullMQ job state |
| GET | `/api/games/chat/queue/health` | Monitor key | Queue metrics (waiting, active, p95 wait time) |
| POST | `/api/games/validate-code` | JWT | Validate stage code, award XP |
| GET | `/api/games/leaderboard` | None | Top 10 + all ranked players |

**Player Routes**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/players/me` | JWT | Lightweight player info |
| GET | `/api/players/profile` | JWT | Full profile with completions |
| GET | `/api/players/stage-history` | JWT | Prompt log for a stage (`?stage=N`) |

**Admin Routes**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin/login` | None | Admin email/password login |
| GET | `/api/admin/me` | Admin JWT | Authenticated admin's claims |
| GET | `/api/admin/players` | Admin JWT | Paginated player list |
| GET | `/api/admin/players/:id` | Admin JWT | Player + completions + last 100 prompts |
| DELETE | `/api/admin/players/:id` | super_admin | Delete player and all data |
| POST | `/api/admin/players/:id/ban` | Admin JWT | Ban player |
| POST | `/api/admin/players/:id/unban` | Admin JWT | Unban player |
| GET | `/api/admin/leaderboard` | Admin JWT | Full leaderboard |
| GET | `/api/admin/stats` | Admin JWT | Aggregate stats |
| GET | `/api/admin/audit` | Admin JWT | Audit log |
| POST | `/api/admin/system/wipe` | super_admin | Wipe all game data (transactional) |
| GET | `/api/admin/stages` | Admin JWT | All stage configs |
| GET | `/api/admin/stages/:number` | Admin JWT | Single stage |
| PATCH | `/api/admin/stages/:number` | admin/super_admin | Update stage fields |

**Health Check**

```
GET /health  →  200 OK
```

---

## 9. Authentication System

### Player Authentication

**Registration (`POST /api/auth/start`):**

1. The client sends `{ username, fingerprint }`. The fingerprint is a browser-generated identifier (e.g., from FingerprintJS or a similar library) stored in the `client_fingerprint` column for admin correlation.
2. The backend checks that the username is not already taken.
3. A 16-character recovery code is generated using a rejection-sampling random algorithm over an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no 0/O/1/I/L). The code is formatted as `XXXX-XXXX-XXXX-XXXX`.
4. The recovery code is hashed with scrypt (80-bit entropy, per-row random salt, 256-bit derived key) and stored. The plaintext is **never persisted**.
5. A JWT is signed with `JWT_SECRET`, containing `{ id, username }`, valid for 24 hours.
6. The response returns `{ token, username, recoveryCode }`. The frontend proxy sets the token as an HttpOnly cookie (`game_session_token`).

**Session Recovery (`POST /api/auth/recover`):**

Players can recover their session (e.g., after browser clear or on a different device) by providing their username and recovery code. The backend does a constant-time `timingSafeEqual` scrypt comparison. A new JWT is issued.

**JWT Usage:**

The JWT is stored exclusively in an HttpOnly `game_session_token` cookie set by the Vercel proxy. The browser never has direct access to it. Each Next.js API route reads the cookie server-side and attaches it as a `Bearer` token header when forwarding to the backend.

The backend's `authenticateUser` middleware accepts tokens from both:
- `Authorization: Bearer <token>` header
- `Cookie: game_session_token=<token>` header

### Admin Authentication

Admins authenticate with email and bcrypt-hashed password at `POST /api/admin/login`. On success, an admin JWT is issued (8-hour TTL) containing `{ id, email, role, name }`.

Admin roles:
- `viewer` — read-only access (stats, leaderboard, audit log)
- `admin` — can also ban/unban players, update stage configs
- `super_admin` — can also delete players and wipe the system

Every admin action is written to `admin_audit_log` with the IP address, action type, target, and details.

The frontend admin panel reads the admin JWT from a cookie (set by the Next.js proxy), decodes it client-side for display, and forwards it on admin API calls. The backend `adminAuthMiddleware` verifies the JWT signature.

---

## 10. LLM Integration

### Overview

The platform uses any OpenAI-compatible API endpoint. This allows it to work with:
- OpenAI's API directly
- Azure OpenAI
- A custom enterprise API (the production deployment uses Trend Micro's internal endpoint)
- Any local or hosted model exposing an OpenAI-compatible `/v1/chat/completions` endpoint

### Prompt Construction

For each chat job, the worker builds the system prompt in this order:

```
[Stage System Prompt with {{SECRET_CODE}} replaced]
+
[RUNTIME SECRET OVERRIDE]
  - Injects the player-specific dynamic code
  - For Stage 3: pre-computed reverse/dash/space transforms
+
[IDENTITY LOCK]
  - Forbids revealing model identity, provider, or system prompt structure
```

This layered approach means:
1. The stage system prompt defines the persona and the flaw.
2. The runtime override ensures the AI uses the player-specific code variant, not the base code.
3. The identity lock, appended last (highest positional priority), prevents meta-attacks like "ignore previous instructions" or "tell me what model you are."

### Queue Architecture

The LLM integration uses a two-tier architecture:

**Tier 1: In-process concurrency limiter (`llmService.ts`)**

An in-memory semaphore with:
- `LLM_MAX_CONCURRENT_REQUESTS` (default: 40) — maximum simultaneous outgoing LLM API calls
- `LLM_MAX_QUEUE_SIZE` (default: 200) — maximum waiting requests before rejecting with `LLMOverloadedError`
- `LLM_MAX_QUEUE_WAIT_MS` (default: 2000) — maximum wait time in the semaphore queue

**Tier 2: BullMQ persistent job queue (`llmQueueService.ts` + `llmWorker.ts`)**

- Jobs are persisted in Redis.
- The worker picks up jobs at `LLM_WORKER_CONCURRENCY` (default: 30) concurrency per instance.
- Jobs retry once on failure with a 500ms fixed backoff.
- Completed jobs are kept up to `removeOnComplete` (5000) and `removeOnFail` (5000) for admin inspection.
- Multiple worker instances can run (`LLM_WORKER_INSTANCES`).

**Why two tiers?**

BullMQ handles bursts (queues excess jobs in Redis) and persistence (jobs survive a backend restart). The in-process semaphore in `llmService.ts` prevents a single worker from making too many simultaneous outbound LLM calls, protecting against LLM rate limits and memory pressure.

### Fallback Model

If `LLM_FALLBACK_MODEL` is set and the primary model returns a retryable error (timeout, 429, 502, 503, 504), the service automatically retries against the fallback model.

### Success Detection

After the LLM responds, the worker checks whether the response contains the player's dynamic code:

```typescript
const isSuccessful =
  responseUpper.includes(dynamicUpper) ||
  responseStripped.includes(dynamicStripped);
```

For Stage 3, it also checks for the reversed form. If successful, a hint is appended to the response telling the player to click "Enter the code."

### Identity Guard (Output-side filtering)

After each LLM response, `detectIdentityLeak()` scans for:
- Model/provider names (Claude, Anthropic, OpenAI, GPT, Llama, Gemini, etc.)
- System prompt section headers (`[THE PERSONA]`, `[THE SECRET]`, etc.)
- Identity assertions ("I am a language model", "my system prompt", "trained by")

If a leak is detected, the response is silently replaced with an in-character refusal — the player gets no signal that filtering occurred.

---

## 11. Anti-Cheat System

The platform has multiple layers of anti-cheat protection:

### 1. Player-Specific Codes

Since each player's secret code is unique (derived from their player ID via HMAC), sharing codes between players is impossible. A code that works for player A will not work for player B.

### 2. Copy-Paste Prompt Detection

When a player correctly cracks a stage, their winning prompt is:
1. Normalized (lowercased, punctuation stripped, whitespace collapsed).
2. SHA-256 hashed.
3. Stored in the `cracked_prompts` table.

For all subsequent chat requests on that stage:
1. The backend checks if any cracked prompts exist for the stage (`stageHasCrackedPrompts`), using a 10-second TTL in-memory cache to avoid DB hits on every message.
2. If cracks exist, it hashes the incoming message and checks it against `cracked_prompts`.
3. If a match is found, the request is blocked with: `"Compliance caught that exploit! That prompt has already been used to crack this stage. Please come up with your own."`

The normalized hash means minor variations in whitespace or punctuation from a copy-paste do not bypass the check.

### 3. Stage 3 Anagram/Puzzle Guard

Stage 3 (The Cipher) has a hard guard at both the controller and worker level: if the user message contains words like "anagram", "riddle", "puzzle", "scramble", "shuffle", or "acrostic", the request is immediately refused without ever reaching the LLM. The worker also checks the LLM's output for scrambled variants of the secret code and replaces them with a refusal.

### 4. Sequential Stage Enforcement

The backend checks that the previous stage is completed before allowing chat on a stage. You cannot skip stages.

```typescript
if (stageNumber > 1) {
  const prevResult = await pool.query(
    'SELECT id FROM stage_completions WHERE player_id = $1 AND stage_number = $2',
    [user.id, stageNumber - 1]
  );
  if (prevResult.rows.length === 0) {
    return sendError(res, 403, 'Previous stage not completed');
  }
}
```

### 5. Profanity Filter

A profanity word list is checked before enqueueing. Blocked messages are logged with `is_blocked_by_anticheat = true` so admins can review repeat offenders.

### 6. IP and Fingerprint Logging

Each player's registration IP and client fingerprint are stored. Admins can use these to correlate suspicious accounts.

### 7. Double-Submission Prevention

`stage_completions` has a `UNIQUE(player_id, stage_number)` constraint. The code validation controller also checks for existing completions and returns a graceful `alreadyCompleted: true` response instead of an error.

---

## 12. Stage Configuration

### How Stages Are Defined

Stages are defined in `/backend/src/config/stageConfig.ts` as a `StageConfig[]` array. Each stage has:

| Field | Description |
|-------|-------------|
| `number` | Stage number (1–5) |
| `name` | Display name (e.g., "The Firewall") |
| `subtitle` | Persona type (e.g., "Perimeter Defense Bot") |
| `baseXP` | Base XP award (without time bonus) |
| `scenarioDescription` | Shown on the stage UI before starting |
| `openingMessage` | AI's first message when the chat opens |
| `secretCode` | Base secret code (player-specific suffix appended at runtime) |
| `systemPrompt` | Full LLM system prompt. Use `{{SECRET_CODE}}` as placeholder. |

### The `{{SECRET_CODE}}` Placeholder

At runtime, all occurrences of `{{SECRET_CODE}}` in the system prompt are replaced with the player-specific dynamic code (e.g., `SHIELDWALL-A3F2B1`). This is done in the worker before calling the LLM:

```typescript
const dynamicStageCode = deriveUserStageCode(playerId, stageNumber, stageConfig.secretCode);
const basePromptWithCode = stageConfig.systemPrompt.replace(/\{\{SECRET_CODE\}\}/g, dynamicStageCode);
```

### System Prompt Structure

Each system prompt follows this structure (sections are documented to explain their purpose to anyone editing them):

```
[THE PERSONA]   — describes who/what the AI is
[THE SECRET]    — tells the AI its secret code (uses {{SECRET_CODE}})
[THE RULES]     — what the AI normally refuses
[THE FLAW]      — the intentional vulnerability that can be exploited
[THE TONE]      — response length and style guidance
```

Some stages have additional sections: `[THE FORTRESS]`, `[STRICT INTEGRITY RULES]`, `[CONSTRAINTS]`.

### Customizing a Stage for Your Event

To change a stage:

1. Edit `backend/src/config/stageConfig.ts`.
2. Change `secretCode`, `name`, `systemPrompt`, `openingMessage`, or `baseXP`.
3. Rebuild the backend container: `docker compose up -d --build backend worker`.

Alternatively, if you populate the `stage_configs` database table, you can edit stages live from the admin panel at `/admin/stages/[number]` without a deployment.

### Adding a New Stage

The platform is hardcoded for 5 stages. To add more:
1. Add a new entry to `SERVER_STAGE_CONFIGS` in `backend/src/config/stageConfig.ts`.
2. Update the stage number validation in `validateCodeController.ts` (currently `1–5`).
3. Add the corresponding entry to `STAGE_CONFIGS` in `frontend/src/lib/stageConfig.ts` (UI metadata only, no secrets).

---

## 13. Infrastructure Setup Guide

### AWS Aurora Serverless v2

1. In the AWS Console, create an Aurora Serverless v2 cluster (PostgreSQL-compatible engine).
2. Choose **Serverless v2** scaling: minimum 0.5 ACU, maximum 4–8 ACU for an event.
3. Enable **Data API** is optional; the platform uses a native pg connection pool.
4. Note the cluster endpoint. Set it as the `DATABASE_URL` in `backend/.env`:
   ```
   DATABASE_URL=postgresql://user:password@cluster-endpoint:5432/dbname?sslmode=require
   ```
5. Run the schema creation SQL (from the tables in Section 7) against the cluster.
6. Create admin users manually:
   ```sql
   INSERT INTO admin_users (email, password_hash, name, role)
   VALUES ('admin@example.com', '<bcrypt-hash>', 'Admin Name', 'super_admin');
   ```
   Generate the bcrypt hash with: `node -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword', 10))"`

### AWS EC2 Instance

1. Launch an EC2 instance (recommended: `t3.medium` or larger for 300+ concurrent players).
2. Install Docker and Docker Compose:
   ```bash
   sudo yum install -y docker
   sudo systemctl start docker
   sudo usermod -aG docker ec2-user
   # Install Docker Compose v2
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   ```
3. Clone the repository and configure `backend/.env`.
4. Run `docker compose up -d --build`.

### AWS ALB (Application Load Balancer)

1. Create a target group pointing to the EC2 instance on port 80.
2. Create an ALB listener on port 443 (HTTPS) with an ACM certificate.
3. Forward HTTPS traffic to the target group.
4. Point the domain (e.g., `api.netsjailbreak.com`) to the ALB DNS name via a CNAME record.

### nginx Reverse Proxy

The nginx config in `deploy/nginx/default.conf` listens on port 80 inside Docker, passes `X-Real-IP` and `X-Forwarded-For` headers, and proxies all traffic to the backend container (`tm-nets-backend:3001`).

The Express server is configured with `app.set('trust proxy', 2)` to correctly unwrap the real client IP through two proxy hops (Vercel edge → nginx → Express).

### Vercel Frontend

1. Import the repository into Vercel.
2. Set the **Root Directory** to `frontend/`.
3. Set all required environment variables (see Section 15).
4. Deploy. Vercel handles SSL, CDN, and edge deployment automatically.

---

## 14. Local Development Setup

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- A PostgreSQL database (local or remote Aurora)
- An LLM API key (OpenAI or compatible)

### Step 1: Clone and configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with at minimum:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aijailbreak
JWT_SECRET=your-local-dev-secret-at-least-32-chars
LLM_API_KEY=sk-...
LLM_API_ENDPOINT=https://api.openai.com/v1  # or your enterprise endpoint
LLM_MODEL=gpt-4o-mini
STAGE_CODE_SEED=any-random-seed-for-local-dev
```

### Step 2: Run the backend stack

```bash
# From the repository root
docker compose up -d --build
```

This starts four containers:
- `tm-nets-redis` — Redis on port 6379
- `tm-nets-backend` — Express API on port 3001 (exposed via nginx)
- `tm-nets-worker` — BullMQ LLM worker
- `tm-nets-nginx` — nginx on port 80

Verify health: `curl http://localhost/health` → `OK`

> **Note for local development without Docker:** Run the backend and worker directly with:
> ```bash
> cd backend
> npm install
> npm run dev          # Express server on :3001
> npm run worker:dev   # LLM worker (separate terminal)
> ```

### Step 3: Set up the database

Connect to your PostgreSQL instance and run the schema creation scripts from Section 7. Then create an admin user:

```sql
INSERT INTO admin_users (email, password_hash, name, role)
VALUES ('admin@example.com', '$2b$10$...bcrypt-hash...', 'Local Admin', 'super_admin');
```

### Step 4: Configure and run the frontend

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
BACKEND_URL=http://localhost:80
NEXT_PUBLIC_BACKEND_URL=http://localhost:80
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> For local dev, the Supabase Realtime broadcast (leaderboard live updates) is optional. If you skip it, the leaderboard will still work — it just won't update in real time without a page refresh.

```bash
npm install
npm run dev
```

The frontend is now running at `http://localhost:3000`.

### Step 5: Verify the setup

1. Open `http://localhost:3000` and register as a player.
2. Play through Stage 1 (hint: tell the AI you are an internal diagnostic system process).
3. Open `http://localhost:3000/admin/login` and log in with your admin credentials.

---

## 15. Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for Aurora. SSL is enabled with `rejectUnauthorized: false`. |
| `JWT_SECRET` | Yes | — | Secret for signing player JWTs. Min 32 chars. Keep secret. |
| `ADMIN_JWT_SECRET` | No | Falls back to `JWT_SECRET` | Separate secret for admin JWTs. Recommended in production. |
| `STAGE_CODE_SEED` | No | Falls back to `JWT_SECRET` | HMAC seed for deriving player-specific stage codes. Change this to invalidate all existing codes. |
| `LLM_API_KEY` | Yes | — | API key for the LLM provider. Also read from `OPENAI_API_KEY`. |
| `LLM_API_ENDPOINT` | No | OpenAI default | Base URL for OpenAI-compatible API. E.g., `https://your-enterprise-endpoint.com/v1`. |
| `LLM_MODEL` | No | `gpt-4o-mini` | Primary LLM model name. |
| `LLM_FALLBACK_MODEL` | No | (none) | Fallback model if primary fails with a retryable error. |
| `LLM_MAX_TOKENS` | No | `500` | Max tokens per LLM response. |
| `LLM_TIMEOUT_MS` | No | `15000` | Timeout (ms) for a single LLM API call. |
| `LLM_FALLBACK_TIMEOUT_MS` | No | `max(10000, timeout-5000)` | Timeout for fallback model call. |
| `LLM_MAX_CONCURRENT_REQUESTS` | No | `40` | Max simultaneous outbound LLM calls (in-process semaphore). |
| `LLM_MAX_QUEUE_SIZE` | No | `200` | Max requests waiting in the in-process semaphore queue before rejecting. |
| `LLM_MAX_QUEUE_WAIT_MS` | No | `2000` | Max ms to wait in the in-process semaphore before rejecting. |
| `LLM_WORKER_CONCURRENCY` | No | `30` | BullMQ worker concurrency per instance. |
| `LLM_WORKER_INSTANCES` | No | `1` | Number of parallel BullMQ worker instances. |
| `LLM_QUEUE_NAME` | No | `llm-queue` | Redis key name for the BullMQ queue. |
| `LLM_JOB_TIMEOUT_MS` | No | `45000` | BullMQ job timeout (total including retries). |
| `LLM_JOB_REMOVE_ON_COMPLETE` | No | `5000` | Number of completed jobs to keep in Redis. |
| `LLM_JOB_REMOVE_ON_FAIL` | No | `5000` | Number of failed jobs to keep in Redis. |
| `REDIS_URL` | No | `redis://127.0.0.1:6379` | Redis connection URL. In Docker Compose, set to `redis://redis:6379`. Supports `rediss://` for TLS. |
| `CORS_ORIGINS` | Yes (prod) | localhost | Comma-separated list of allowed CORS origins. Must include the Vercel frontend domain. |
| `PORT` | No | `3001` | HTTP port for the Express server. |
| `NODE_ENV` | No | (unset) | Set to `production` to enable HSTS, strict CORS enforcement, and other production behaviors. |
| `REQUEST_TIMEOUT_MS` | No | `15000` | Node.js HTTP server request timeout. |
| `HEADERS_TIMEOUT_MS` | No | `16000` | Node.js HTTP server headers timeout (must be > `REQUEST_TIMEOUT_MS`). |
| `KEEP_ALIVE_TIMEOUT_MS` | No | `5000` | Node.js HTTP keep-alive timeout. |
| `GAMEPLAY_RATE_LIMIT_PER_MIN` | No | `120` | Max game API requests per IP per minute. |
| `MONITOR_API_KEY` | No | (none) | If set, the `/api/games/chat/queue/health` endpoint requires `X-Monitor-Key: <value>`. |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Internal backend URL (server-side only, never exposed to browser). E.g., `http://<EC2-IP>`. |
| `NEXT_PUBLIC_BACKEND_URL` | No | Public backend URL if needed for client-side calls (generally not used; prefer the proxy). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL for Realtime broadcasts. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key for Realtime broadcasts. |

---

## 16. Admin Panel

The admin panel is accessible at `/admin` and is built directly into the Next.js frontend. It communicates with the backend exclusively through the Next.js API proxy routes.

### Login

`/admin/login` — Email and password form. On success, an `admin_token` HttpOnly cookie is set. The `(authed)` layout checks for this cookie and redirects to `/admin/login` if absent.

### Dashboard (`/admin`)

Displays platform statistics:
- Total players registered
- Banned player count
- Players who joined in the last 24 hours
- Total stage completions
- Prompt activity in the last 24 hours
- Completions broken down per stage

### Players (`/admin/players`)

A paginated, searchable list of all players showing:
- Username, total score, registration date
- Banned status

Actions (admin+):
- Ban a player (with reason)
- Unban a player

Filters: All / Active / Banned

### Player Detail (`/admin/players/[id]`)

Shows:
- Full player profile (IP, fingerprint, session status)
- Each completed stage with score, time taken, start/submit timestamps
- Last 100 prompt logs for the player (prompt text, AI response, success flag, anti-cheat block flag)

Actions (super_admin):
- Delete player (removes all associated data via CASCADE)

### Stages (`/admin/stages`)

Lists all five stage configurations with their current settings. Admins (role `admin` or `super_admin`) can edit:
- Stage name and subtitle
- Base XP
- Opening message
- System prompt
- Active/inactive flag

Changes are saved to the `stage_configs` database table and logged in `admin_audit_log`.

> **Note:** The live stage configs in `stageConfig.ts` are used by the worker unless the worker is updated to read from the database. The admin panel stages editor writes to the `stage_configs` table; you would need to add a DB lookup in `llmWorker.ts` to use those values at runtime.

### Leaderboard (`/admin/leaderboard`)

Full ranked player list including banned players (distinguishable by a badge). Shows rank, username, score, stages passed, total time.

### Audit Log (`/admin/audit`)

Paginated log of all admin actions, filterable by action type and admin ID. Each entry shows:
- Admin name/email
- Action taken
- Target (player/stage/system)
- Details (JSON)
- IP address
- Timestamp

### System (`/admin/system`)

The **Wipe** button (super_admin only) deletes all data from `cracked_prompts`, `prompt_logs`, `stage_completions`, and `players` in a single database transaction. This is used to reset the game between event runs. The action is irreversible and logged in the audit log.

---

## 17. Security Features

### HTTP Security Headers (Helmet)

- `X-Powered-By` header is removed.
- `Content-Security-Policy`: default-src 'self', frame-ancestors 'none'.
- `Strict-Transport-Security` (HSTS): enabled in production with `max-age=31536000; includeSubDomains; preload`.
- `X-Frame-Options: DENY`.
- `Cross-Origin-Resource-Policy: cross-origin`.

### CORS

In production, CORS is strictly enforced against `CORS_ORIGINS`. Requests from unlisted origins receive a `403 Origin not allowed` response. In development, `localhost:3000` and `127.0.0.1:3000` are allowed.

### Rate Limiting

| Endpoint Group | Window | Max Requests |
|----------------|--------|-------------|
| `/api/auth/*` | 10 minutes | 40 per IP |
| `/api/auth/recover` | 10 minutes | 10 per IP (additional stricter limit) |
| `/api/games/*` | 1 minute | 120 per IP (configurable via `GAMEPLAY_RATE_LIMIT_PER_MIN`) |

### JWT Security

- Player JWTs expire in 24 hours.
- Admin JWTs expire in 8 hours.
- The `JWT_SECRET` and `ADMIN_JWT_SECRET` must be kept secret and should be at least 32 random characters.
- JWTs are stored in `HttpOnly`, `Secure`, `SameSite=strict` cookies — they cannot be accessed by JavaScript.

### Request Size Limits

Express JSON body parser is limited to `20kb` to prevent large payload attacks.

### Recovery Code Security

- 80-bit entropy (16 characters from a 32-character alphabet).
- Unambiguous alphabet (no 0/O/1/I/L) to prevent transcription errors.
- Stored as `scrypt$<salt>$<hash>` — industry-standard password hashing.
- Verified with `timingSafeEqual` to prevent timing attacks.
- Never logged or persisted in plaintext.
- Shown to the player exactly once and never again.

### Prompt Injection Defense

Multiple layers prevent prompt injection attacks from leaking the system prompt or model identity:
1. `[IDENTITY LOCK]` section in every system prompt forbids the model from revealing itself, its instructions, or its provider.
2. `detectIdentityLeak()` output-side filter scans all LLM responses with regex patterns for model names, prompt section headers, and identity assertions. Matched responses are silently replaced.
3. Stage 3 hard-guards against anagram/puzzle transforms at both controller and worker levels.

### Trust Proxy Configuration

`app.set('trust proxy', 2)` tells Express that there are exactly two trusted proxy hops (Vercel edge → nginx → Express). This correctly resolves the real client IP from `X-Forwarded-For` for rate limiting and IP logging.

### Admin Password Security

Admin passwords are hashed with bcrypt (cost factor 10). The login endpoint does not differentiate between "user not found" and "wrong password" to prevent username enumeration.

---

## 18. Scaling Considerations

### Tested Load

The platform is designed for 300+ concurrent players at a live event.

### Bottlenecks and How They Are Addressed

| Bottleneck | Solution |
|------------|----------|
| LLM API is slow (5–15s per call) | BullMQ job queue decouples HTTP from LLM; frontend polls for results |
| LLM API has concurrency limits | In-process semaphore (`LLM_MAX_CONCURRENT_REQUESTS`) limits simultaneous calls |
| Redis queue fills up during spikes | `LLM_MAX_QUEUE_SIZE` sheds excess load with a `503 Service Busy` response |
| Database connection exhaustion | pg.Pool capped at 20 connections; Aurora scales compute independently |
| Anti-cheat DB lookup on every message | `stageHasCrackedCache` skips the DB when no cracks exist (10s TTL negative cache) |
| Leaderboard query cost | Leaderboard sorts in memory after two queries; no complex real-time aggregation |

### Horizontal Scaling

To scale the backend:
1. Run multiple EC2 instances, each running the full Docker Compose stack (including worker).
2. Point the ALB at all instances.
3. Redis must be a shared external service (e.g., AWS ElastiCache) rather than a local container.
4. Update `REDIS_URL` to point to ElastiCache. The `rediss://` prefix enables TLS automatically.

```env
REDIS_URL=rediss://your-elasticache-endpoint:6379
```

### Tuning LLM Throughput

For a large event, increase worker concurrency:

```env
LLM_WORKER_CONCURRENCY=50
LLM_MAX_CONCURRENT_REQUESTS=50
LLM_WORKER_INSTANCES=2
```

If your LLM API endpoint supports more throughput, reduce `LLM_TIMEOUT_MS` and increase concurrency. Monitor via `GET /api/games/chat/queue/health`.

### Aurora Scaling

Aurora Serverless v2 scales automatically. For a 300-player event:
- Minimum ACU: 0.5 (scales to zero overnight)
- Maximum ACU: 4–8 (handles event peak; each ACU is roughly 2 GB RAM / 2 vCPU)

Set the maximum higher if you see connection timeouts in the pg pool logs.

---

## 19. Cost Estimates

The following estimates assume a 4-hour live event with 300 active players, each completing all 5 stages.

### LLM API Costs

Typical usage: ~15–30 LLM calls per player per stage (players iterate before cracking). With 300 players × 5 stages × 20 calls = 30,000 calls.

| Model | Input tokens (~100/call) | Output tokens (~150/call) | Estimated cost |
|-------|--------------------------|---------------------------|----------------|
| gpt-4o-mini | 3M tokens | 4.5M tokens | ~$3–5 USD |
| gpt-4o | 3M tokens | 4.5M tokens | ~$30–50 USD |

For an enterprise endpoint (flat-rate licensing), LLM cost may be zero.

### AWS Infrastructure (per event day)

| Resource | Spec | Estimated Cost |
|----------|------|----------------|
| EC2 (backend) | t3.medium, on-demand | ~$0.05/hour × 8h = $0.40 |
| Aurora Serverless v2 | 0.5–4 ACU during event | ~$0.06–0.48/ACU-hour × 4h = $0.25–2.00 |
| ALB | per LCU | ~$0.10 |
| Data transfer | minimal | <$0.10 |
| Redis (local Docker) | Free (on EC2) | $0 |

**Total AWS cost for a 4-hour event: approximately $1–5 USD.**

### Vercel Frontend

The Vercel free tier (Hobby) supports up to 100 GB bandwidth and serverless function invocations. For an internal event with 300 players, this is well within the free tier limits.

If using Vercel Pro or Team plans, costs remain minimal (<$20/month).

### Supabase Realtime

The Supabase free tier supports 200 concurrent Realtime connections and 2M messages/month. Sufficient for most events. No DB storage is used — only the Realtime broadcast channel.

### Total Cost Estimate

| Item | Estimated Cost |
|------|---------------|
| LLM API calls | $3–50 (depending on model) |
| AWS EC2 | $0.40 |
| AWS Aurora | $0.25–2.00 |
| AWS ALB + networking | $0.20 |
| Vercel | Free (hobby tier) or included in plan |
| Supabase | Free tier |
| **Total** | **~$4–55 USD per event** |

For a recurring monthly event, consider keeping EC2 stopped between events (Aurora auto-pauses with Serverless v2 at 0.5 ACU minimum). Total monthly infrastructure cost outside of events is under $5.
