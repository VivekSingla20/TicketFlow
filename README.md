# TicketFlow — High-Concurrency Ticket Booking System

TicketFlow is a production-ready, monorepo-structured ticket booking application designed to handle high-concurrency traffic safely. It is engineered to allow **20,000 concurrent users competing for 200 seats** without any double-bookings, utilizing a multi-layered concurrency architecture (Redis Redlock, PostgreSQL transactions, and Version optimistic locking).

---

## 📂 Project Structure

This project is organized as a monorepo containing two key modules:

```
ticketflow/
├── backend/              # Fastify & Prisma Node.js API + BullMQ Background Processors
│   ├── src/
│   │   ├── api/          # Express-style routes, controllers, and schema validators
│   │   ├── services/     # Core business logic (hot paths, events, bookings)
│   │   ├── websocket/    # Socket.io connection gateway & cross-process broadcaster
│   │   ├── queues/       # BullMQ job producers
│   │   ├── workers/      # BullMQ worker consumers (Expiry handlers, refunds)
│   │   └── cache/        # Redis status caching layers
└── frontend/             # Vite + TanStack Start (React Router & Query) Client App
    ├── src/
    │   ├── routes/       # File-based TanStack routes (Admin, Bookings, Events map, Checkout)
    │   ├── lib/          # API fetch wrapper, WebSocket hook, Auth provider context
    │   └── components/   # Tailwind-styled UI components
```

---

## 🛠 Tech Stack

### Backend
*   **Runtime**: Node.js (v20+ LTS)
*   **Framework**: Fastify (high-throughput API routing)
*   **Database**: PostgreSQL 15+ (Prisma ORM)
*   **Queue & Cache**: Redis 7+ (BullMQ job broker & `ioredis` client)
*   **Distributed Locking**: Redlock pattern
*   **WebSockets**: Socket.io (with Redis pub/sub adapter for horizontal scaling)
*   **Auth**: JWT Access tokens (HTTP header) + Refresh tokens (HttpOnly Cookie)

### Frontend
*   **Core**: React 19 + TypeScript
*   **Build Tool**: Vite & Nitro
*   **Router**: TanStack Router & Start (with file-system routing)
*   **Data Fetching**: TanStack React Query & fetch wrappers
*   **WebSocket Client**: Native WebSocket connection manager
*   **Styling**: TailwindCSS v4 + Radix UI Primitives

---

## 🔒 Concurrency Design (Seat Reservation Hot-Path)

To prevent race conditions, the seat booking path features three layers of protection:

1.  **Redis Distributed Lock (Redlock)**: Rejects concurrent requests for the same seat ID at the application layer in under `100ms`, protecting the database from transaction pool saturation.
2.  **Row Locking (SELECT FOR SHARE)**: Verifies seat availability inside a strict database transaction.
3.  **Optimistic Locking (`version` check)**: The final safety net during update (`WHERE version = $expectedVersion`). If another process updated the seat first, the version mismatch causes a rollback.

---

## 🔑 Environment Variables Setup

Configure these keys to run the application locally.

### Backend `.env` (`backend/.env`)

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
WORKER_CONCURRENCY=10

# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?schema=public

# Redis Connection (Required for rate limiter, queues, and websocket pub/sub)
REDIS_URL=redis://localhost:6379

# Authentication (Minimum 16 characters required for secrets)
JWT_SECRET=secure_jwt_secret_passphrase_min_16_chars
REFRESH_COOKIE_SECRET=secure_cookie_secret_passphrase_min_16_chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Payment Integration Webhook Secret
MOCK_PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
MOCK_PAYMENT_SUCCESS_RATE=0.95
MOCK_PAYMENT_DELAY_MS_MIN=200
MOCK_PAYMENT_DELAY_MS_MAX=1200

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=500
RATE_LIMIT_GLOBAL_WINDOW_MS=60000

# Websocket CORS Access
WS_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend `.env` (`frontend/.env`)
Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000/ws
```

---

## 🚀 Getting Started

Ensure you have a running **PostgreSQL** instance and a **Redis** instance locally.

### 1. Initialize Database & Seed Content
On your first run, setup tables, apply schemas, and populate sample venues/events/users:
```bash
cd backend
npm run prisma:migrate:deploy
npm run prisma:seed
```
*   **Admin account**: `admin@ticketbooking.com` / `Admin@123`
*   **Test user**: `user@ticketbooking.com` / `User@123`

### 2. Start the Backend API & Queue Worker
Start the HTTP API server and background workers in separate terminal windows:
```bash
# Terminal 1: Starts HTTP/WebSocket API server
cd backend
npm run dev

# Terminal 2: Starts BullMQ Workers (handles reservations expiration, refunds, notifications)
cd backend
npm run worker:dev
```

### 3. Start the Frontend Dev Server
Run the frontend dev server:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` to test the application!

---

## 📊 BullMQ Workers & WebSockets Room Architecture

*   **Reservation Expiry Queue (`reservation-expiry`)**: Checks reservation status. If `PENDING` and expired, it resets seats back to `AVAILABLE` and notifies the client.
*   **Websocket Rooms**:
    *   `event:{eventId}`: Public room where all seat status updates are broadcasted.
    *   `user:{userId}`: Authenticated private room for transactional events (e.g. payment confirmations, expiry warnings).
