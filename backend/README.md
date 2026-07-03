# 🎫 High-Concurrency Ticket Booking Backend

> Production-ready ticket booking backend in Node.js capable of safely handling **20,000 concurrent users competing for 200 seats** with zero double-bookings.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (LTS) |
| Framework | Fastify v5 |
| Database | PostgreSQL 15 |
| ORM | Prisma 7 |
| Cache / Lock / Queue | Redis 7 |
| Job Queue | BullMQ |
| WebSockets | Socket.io + Redis Adapter |
| Auth | JWT (access + refresh tokens) |
| Logging | Winston (structured JSON) |
| API Docs | Swagger / OpenAPI 3.0 |
| Containerization | Docker + Docker Compose |

## Quick Start

### Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, Redis, API, Worker, BullMQ Board)
docker-compose up --build -d

# View logs
docker-compose logs -f api

# Stop
docker-compose down
```

**Services after startup:**
- **API Server**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/health
- **BullMQ Board**: http://localhost:3001

### Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Start PostgreSQL and Redis (via Docker)
docker-compose up -d postgres redis

# Run migrations
npm run prisma:migrate:deploy

# Seed the database
npm run prisma:seed

# Start API server (with hot reload)
npm run dev

# Start worker (in separate terminal)
npm run worker:dev
```

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@ticketbooking.com | Admin@123 |
| User | user@ticketbooking.com | User@123 |

## API Endpoints

### Auth — `/api/auth`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Create user account |
| POST | `/login` | Get access + refresh tokens |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Revoke tokens |

### Admin — `/api/admin` (ADMIN role required)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/venues` | Create venue with seat layout |
| GET | `/venues` | List venues |
| POST | `/events` | Create event |
| PUT | `/events/:id` | Update event (DRAFT only) |
| PATCH | `/events/:id/publish` | Publish event + warm cache |
| PATCH | `/events/:id/cancel` | Cancel event + mass refunds |
| GET | `/events/:id/dashboard` | Real-time booking stats |

### Events — `/api/events`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List published events |
| GET | `/:id` | Event detail |
| GET | `/:id/seats` | Live seat map from Redis |

### Reservations — `/api/reservations`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | **Reserve seats (critical hot path)** |
| GET | `/:id` | Check reservation status |
| DELETE | `/:id` | Cancel reservation |

### Bookings — `/api/bookings`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Confirm reservation (idempotent) |
| GET | `/` | Booking history |
| GET | `/:id` | Booking detail |
| POST | `/:id/cancel` | Cancel + refund |

### Payments — `/api/payments`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/webhook` | Payment provider callback |

### Notifications — `/api/notifications`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | User notifications |
| PATCH | `/:id/read` | Mark as read |
| PATCH | `/read-all` | Mark all as read |

## Concurrency Safety (3-Layer Lock)

```
Layer 1: Redis Distributed Lock (SET NX PX)
  → Prevents concurrent DB transactions for same seat
  → Seats locked in sorted order to prevent deadlocks

Layer 2: Prisma Interactive Transaction
  → Atomic multi-table updates
  → Re-reads seat status inside transaction

Layer 3: Optimistic Locking (version field)
  → WHERE version = expected_version
  → Final safety net — 0 rows affected = conflict
```

## Project Structure

```
src/
├── api/
│   ├── routes/           # Route registration per domain
│   ├── controllers/      # Thin layer, delegates to services
│   ├── middlewares/       # auth, rateLimit, requestId, errorHandler
│   └── validators/       # Zod schemas per endpoint
├── services/             # Core business logic
├── workers/              # BullMQ job consumers
├── queues/               # Queue definitions + producers
├── websocket/            # Socket.io init + event emitters
├── db/
│   ├── prisma/           # Schema + client
│   └── transactions/     # Multi-table transaction helpers
├── cache/                # Redis client + seat cache
├── locks/                # Distributed lock (SET NX PX)
├── mock-payment/         # Simulated payment gateway
├── utils/                # Logger, errors, pagination, idempotency
├── config/               # Env validation with Joi
├── app.js                # Fastify app factory
├── server.js             # HTTP + Socket.io entry
└── worker.js             # BullMQ worker entry
```

## Environment Variables

See `.env.example` for all configuration options.

## License

ISC
