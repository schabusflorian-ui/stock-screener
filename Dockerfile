# Dockerfile for Investment Project
# Multi-stage build for smaller production image

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# ============================================
# Stage 2: Builder (for frontend if needed)
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build frontend if exists
RUN if [ -d "frontend" ]; then \
      cd frontend && npm ci && npm run build; \
    fi

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache sqlite curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:nodejs /app/data

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:nodejs . .

# Copy built frontend
COPY --from=builder --chown=appuser:nodejs /app/frontend/build ./frontend/build 2>/dev/null || true

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "src/api/server.js"]
