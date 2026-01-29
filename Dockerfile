# Dockerfile for Investment Project
# Multi-stage build for smaller production image
# Supports both SQLite (dev) and PostgreSQL (production)

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
# - python3, make, g++ for node-gyp
# - sqlite for better-sqlite3 (optional, fallback)
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# ============================================
# Stage 2: Builder (for frontend)
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build frontend
RUN if [ -d "frontend" ]; then \
      cd frontend && npm ci && npm run build; \
    fi

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
# curl for healthcheck, sqlite for fallback
RUN apk add --no-cache curl sqlite

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Create necessary directories
RUN mkdir -p /app/data /app/logs && \
    chown -R appuser:nodejs /app/data /app/logs

# Copy package files for production dependencies
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=appuser:nodejs src ./src
COPY --chown=appuser:nodejs scripts ./scripts

# Copy built frontend if exists
COPY --from=builder --chown=appuser:nodejs /app/frontend/build ./frontend/build 2>/dev/null || true

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Start command - runs migrations then starts server
CMD ["npm", "run", "start:production"]
