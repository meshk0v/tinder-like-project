# Tinder-like Project MVP

The main goal of this project is to demonstrate a **Tinder-like system architecture** (microservices + clear service boundaries) 

I built this architecture with an AI Agent to better understand what a solid microservices architecture looks like for a Tinder-like project. I'll probably keep improving it to make the design more enjoyable and the system more scalable  

## Scope Covered

The system implements 4 core features:

1. User profiles (including photos)
2. Recommendations (based on gender/interests/location)
3. Matches (source of truth for matched pairs)
4. Chat available only after a match

## High-Level Architecture

```text
[React Web Client]
        |
        v
     [Gateway]  --auth--> [Profile Service]
        | \
        |  \----> [Recommendation Service] ----> [Profile Service]
        |
        |-------> [Matches Service] <----> [Postgres]
        |
        |-------> [Image Service] ----> [MinIO/S3]
        |                  |
        |                  +----> [Postgres image metadata]
        |
        +-------> [Messaging Service (WebSocket)]
                           |        |
                           |        +--> [Matches Service] (validate match)
                           |
                           +--> [Sessions Service] <--> [Redis]
                           |
                           +--> [Postgres messages]
```

## Why It Is Designed This Way

- `Gateway` centralizes auth and routing so auth logic is not duplicated in every service.
- `Profile` owns profile/account/token logic.
- `Image` stores **files** in S3-compatible storage (MinIO), while DB stores metadata + URLs.
- `Matches` is the single source of truth for matched pairs (stored symmetrically A↔B).
- `Messaging` uses WebSocket push, and validates match state via `Matches` before sending.
- `Sessions` stores `user_id -> connection_id` in Redis (not in gateway).

## Services and Responsibilities

- `gateway` (`:8080`): auth via `profile`, API routing
- `profile` (`:8081`): profiles, registration, login, token validation
- `image` (`:8082`): photo upload/read, metadata in Postgres, files in MinIO
- `recommendation` (`:8083`): candidate selection
- `matches` (`:8084`): swipes and match creation
- `sessions` (`:8085`): online session mapping in Redis
- `messaging` (`:8086`): WebSocket chat + message history

## Key Flows

### 1) Login/Register
1. Client -> `gateway` (`/auth/login` or `/auth/register`)
2. `gateway` -> `profile`
3. `profile` returns token + user_id
4. Client uses Bearer token for protected APIs

### 2) Recommendations
1. Client -> `gateway` `/recommendations`
2. `gateway` reads `user_id` from token
3. `recommendation` fetches user profile from `profile`
4. `recommendation` filters candidates (not self, same location, interested_in)

### 3) Match
1. Client swipes left/right -> `gateway` `/swipes`
2. `matches` stores swipe
3. If there is a mutual right-swipe, `matches` creates 2 rows:
   - `(A, B)`
   - `(B, A)`

### 4) Chat
1. Client opens WS: `ws://localhost:8086/ws?user_id=<id>`
2. `messaging` registers session in `sessions`
3. On `send_message`:
   - validates match via `matches`
   - stores message in Postgres
   - pushes to online recipient via WS (if active session exists)

### 5) Images
1. Client uploads base64 -> `gateway` `/images`
2. `image` uploads file to MinIO
3. `image` stores metadata (`image_id/user_id/object_url/object_key`) in Postgres

## Storage

- **Postgres**:
  - `profiles`, `auth_users`, `auth_tokens`
  - `images` (metadata)
  - `swipes`, `matches`
  - `messages`
- **Redis**:
  - online sessions: `session:<user_id>`
- **MinIO (S3)**:
  - binary photo objects

## Migrations and Seed Data

Schema and test data are initialized automatically.

- `backend/migrations/001_init.sql` — tables and indexes
- `backend/migrations/002_seed_users.sql` — 100 test users
- `backend/scripts/migrate.js` — migration runner

`docker-compose` includes a dedicated `migrator` service that runs before backend services.

## Run

```bash
docker compose down -v
docker compose up --build
```

UI: `http://localhost:3000`  
Gateway API: `http://localhost:8080`

Also exposed:

- WS: `ws://localhost:8086/ws?user_id=u1`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001` (`minio` / `minio123`)

## Test Accounts

- `alex@demo.app / demo123`
- `sam@demo.app / demo123`
- `taylor@demo.app / demo123`
- also `user4@demo.app` ... `user100@demo.app` (all with password `demo123`)

## Lecture Constraints Implemented

- Gateway does not keep auth state; token validation is delegated to `profile`
- Photos are stored in file/object storage + metadata DB
- Chat uses persistent protocol (WebSocket), not HTTP pull
- Session mapping ownership belongs to `sessions`
- `matches` is source of truth for matched pairs
- Chat send path validates `are they matched?` before persisting/delivering

## Current MVP Limits

- Recommendation logic is simple filtering (no ranking/ML)
- No async event bus/queue yet
- No production hardening yet (rate limit, observability, retries, circuit breaker)

This still demonstrates solid decomposition and clear service boundaries.
