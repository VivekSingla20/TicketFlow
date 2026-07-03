# ─── Build stage ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and prisma config
COPY package*.json ./
COPY prisma.config.ts ./
COPY src/db/prisma/schema.prisma ./src/db/prisma/schema.prisma

# Install all dependencies (including dev for prisma CLI)
RUN npm ci

# Generate Prisma client — needs a dummy DATABASE_URL for prisma.config.ts
# (no actual connection is made during generation)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --schema=./src/db/prisma/schema.prisma

# ─── Production stage ────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/src/generated /app/src/generated

# Copy Prisma schema + config (needed for migrations at runtime)
COPY prisma.config.ts ./
COPY src/db/prisma/ ./src/db/prisma/

# Copy application source
COPY src/ ./src/

# Install prisma CLI for migrations at runtime
RUN npm install -g prisma

# Expose port
EXPOSE 3000

# Default command (overridden in docker-compose for worker)
CMD ["node", "src/server.js"]
