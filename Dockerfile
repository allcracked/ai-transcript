# Stage 1: Build web frontend
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web
COPY apps/web ./apps/web
RUN npm run build --workspace=apps/web

# Stage 2: Build server
FROM node:20-alpine AS server-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
RUN npm ci --workspace=apps/server
COPY apps/server ./apps/server
RUN npm run build --workspace=apps/server

# Stage 3: Production image
FROM node:20-alpine
WORKDIR /app

# Install build tools needed for better-sqlite3 native addon, then remove them
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
RUN apk add --no-cache python3 make g++ && \
    npm ci --workspace=apps/server --omit=dev && \
    apk del make g++ && \
    rm -rf /var/cache/apk/*

# Copy compiled server
COPY --from=server-builder /app/apps/server/dist ./apps/server/dist

# Copy built frontend into server's public folder (served as static files)
COPY --from=web-builder /app/apps/web/dist ./apps/server/dist/public

# Persistent data directories (mount these as volumes in Coolify)
RUN mkdir -p apps/server/data apps/server/uploads

EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
