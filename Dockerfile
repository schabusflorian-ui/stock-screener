# Dockerfile
# Multi-stage build for the Investment Research Platform
# Produces a production-ready image with Node.js and Python runtimes

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-slim AS deps

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install Python dependencies
COPY python-services/requirements.txt ./python-services/
RUN pip3 install --break-system-packages --no-cache-dir \
    requests beautifulsoup4 sentence-transformers psycopg2-binary \
    && pip3 install --break-system-packages --no-cache-dir \
    -r python-services/requirements.txt

# ============================================
# Stage 2: Build frontend
# ============================================
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ ./

ENV GENERATE_SOURCEMAP=false
ENV CI=false
RUN npm run build

# ============================================
# Stage 3: Production image
# ============================================
FROM node:20-slim AS production

WORKDIR /app

# Install Python runtime and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from deps stage
COPY --from=deps /usr/local/lib/python3*/dist-packages/ /usr/local/lib/python3*/dist-packages/ 2>/dev/null || true
COPY --from=deps /usr/lib/python3/dist-packages/ /usr/lib/python3/dist-packages/ 2>/dev/null || true

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY python-services/ ./python-services/
COPY python/ ./python/
COPY knowledge_base/ ./knowledge_base/

# Copy built frontend
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Create data directory
RUN mkdir -p /app/data

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the application
CMD ["npm", "run", "start:production"]
