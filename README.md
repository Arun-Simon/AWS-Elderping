# ElderPing 🩺

A microservices-based elderly care application built with **Node.js (Express)**, **React (Vite)**, **Tailwind CSS**, and **PostgreSQL** — designed as a clean DevOps demonstration showcasing Docker, Kubernetes readiness, and CI/CD best practices.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    ui-service (React)                │
│               Runs on http://localhost:8080          │
└──────────┬──────────┬──────────┬───────────┬────────┘
           │          │          │           │
    ┌──────▼──┐ ┌─────▼──┐ ┌────▼───┐ ┌────▼────┐
    │  auth-  │ │health- │ │reminder│ │ alert-  │
    │ service │ │service │ │service │ │ service │
    │  :3001  │ │ :3002  │ │ :3003  │ │  :3004  │
    └──────┬──┘ └─────┬──┘ └────┬───┘ └────┬────┘
           │          │         │           │
       ┌───▼──┐  ┌────▼─┐  ┌───▼──┐  ┌────▼─┐
       │auth  │  │health│  │remind│  │alert │
       │  db  │  │  db  │  │  db  │  │  db  │
       └──────┘  └──────┘  └──────┘  └──────┘
```

### Services

| Service | Port | Database | Description |
|---|---|---|---|
| `ui-service` | 8080 | — | React SPA (Vite + Tailwind) |
| `auth-service` | 3001 | `users_db` | JWT registration & login |
| `health-service` | 3002 | `health_db` | Check-ins & vitals |
| `reminder-service` | 3003 | `reminder_db` | Medication CRUD & tracking |
| `alert-service` | 3004 | `alert_db` | Internal alert logging |

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 24
- Docker Compose ≥ 2.x (bundled with Docker Desktop)

### 1. Clone & configure
```bash
git clone https://github.com/your-org/elderpinq.git
cd elderpinq

# Create a root .env from the template and set a strong JWT_SECRET
cp .env.example .env
```

### 2. Launch everything
```bash
docker compose up --build -d
```

This spins up **9 containers**: 5 services + 4 PostgreSQL instances. Tables are created automatically via the SQL init scripts in `db-init/`.

### 3. Open the UI
Navigate to **http://localhost:8080** — you'll land on the login page.

#### Demo users (register via API or extend the init script)
```bash
# Register an elder
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"grandma","password":"password123","role":"elder"}'

# Register a family member
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"daughter","password":"password123","role":"family"}'
```

---

## API Reference

### `auth-service` (:3001)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/register` | Create a new user |
| POST | `/login` | Returns JWT token |
| GET | `/me` | Returns authenticated user (Bearer token) |

### `health-service` (:3002)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/checkin` | Log an elder check-in |
| POST | `/vitals` | Log heart rate & blood pressure |
| GET | `/vitals/:userId` | Get recent vitals for a user |

### `reminder-service` (:3003)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/reminders` | Add a medication reminder |
| GET | `/reminders/:userId` | List reminders for a user |
| PUT | `/reminders/:id/take` | Mark medication as taken |

### `alert-service` (:3004)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/alerts` | Log an internal alert |
| GET | `/alerts` | Get 50 most recent alerts |

---

## DevOps Features

### Multi-Stage Dockerfiles
Every service uses a **2-stage build**:
1. `build` — installs dependencies and compiles/bundles assets.
2. `production` — a minimal image running as a **non-root user** (`node` or `nginx`).

### Health Checks
All backend services expose `GET /health → 200 OK`. These are also wired as Docker Compose health checks on the PostgreSQL containers (`pg_isready`), so services only start **after** their DB is ready.

### Environment Variables
Zero hardcoded secrets. All DB credentials, JWT secrets, and service URLs are passed via environment variables — compatible with Kubernetes `ConfigMap` and `Secret` objects.

### Kubernetes Readiness
- `/health` endpoints → **Liveness & Readiness probes**
- Non-root containers → **Pod Security Standards (restricted)**
- Environment-variable-driven config → **12-Factor App** compatible

---

## Project Structure

```
ElderPinq/
├── docker-compose.yaml        # Orchestrates all 9 containers
├── .env.example               # Root env template
├── db-init/                   # PostgreSQL init SQL scripts
│   ├── auth-init.sql
│   ├── health-init.sql
│   ├── reminder-init.sql
│   └── alert-init.sql
├── auth-service/
│   ├── Dockerfile             # Multi-stage, non-root
│   ├── .dockerignore
│   ├── package.json
│   └── src/server.js
├── health-service/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── src/server.js
├── reminder-service/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── src/server.js
├── alert-service/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── src/server.js
└── ui-service/
    ├── Dockerfile             # Node build → nginx production
    ├── .dockerignore
    ├── nginx.conf             # SPA routing, caching, security headers
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        └── pages/
            ├── Login.jsx
            ├── ElderDashboard.jsx
            └── FamilyDashboard.jsx
```

---

## Useful Commands

```bash
# Bring everything up (rebuild images)
docker compose up --build -d

# View logs for a specific service
docker compose logs -f auth-service

# Stop and remove all containers + volumes
docker compose down -v

# Check all container health statuses
docker compose ps

# Scale a service (e.g., 2 replicas of health-service)
docker compose up -d --scale health-service=2
```
