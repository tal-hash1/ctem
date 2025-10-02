# ---------- 1) Build the frontend from ./web ----------
FROM node:20-bookworm AS webbuild

ARG FRONTEND_DIR=web
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /app/web

# Copy only manifests first for better caching
COPY ${FRONTEND_DIR}/package.json ./
# Copy lockfile if present (won't fail if missing)
COPY ${FRONTEND_DIR}/package-lock.json ./ || true

# Install deps (ci if lock exists, else install)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the frontend source and build
COPY ${FRONTEND_DIR}/ ./
RUN npm run build

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

# Server lives here
WORKDIR /srv/server

# Copy server manifests and install prod deps
COPY ${SERVER_DIR}/package.json ./
COPY ${SERVER_DIR}/package-lock.json ./ || true
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy server source
COPY ${SERVER_DIR}/src ./src

# Copy built frontend into server/public
WORKDIR /srv
RUN mkdir -p server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public
=======
# -------- Configurable paths (override via --build-arg) --------
ARG FRONTEND_DIR=client          # set to "." if your frontend is at repo root
ARG FRONTEND_BUILD_DIR=dist      # "dist" for Vite, "build" for CRA
ARG SERVER_DIR=server

# ---------- 1) Build the frontend ----------
FROM node:20-bookworm AS webbuild
# Re-declare args in this stage
ARG FRONTEND_DIR
ARG FRONTEND_BUILD_DIR

WORKDIR /app

# Copy only frontend manifests for caching
# If the path doesn't exist, COPY will fail — so set FRONTEND_DIR correctly!
COPY ${FRONTEND_DIR}/package.json ${FRONTEND_DIR}/package-lock.json* ${FRONTEND_DIR}/pnpm-lock.yaml* ${FRONTEND_DIR}/yarn.lock* ${FRONTEND_DIR}/.npmrc* ./client/
RUN cd client && npm ci

# Copy the rest of the frontend source and build
COPY ${FRONTEND_DIR} ./client
WORKDIR /app/client
RUN npm run build   # produces /app/client/${FRONTEND_BUILD_DIR}

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime
ARG SERVER_DIR
ARG FRONTEND_BUILD_DIR

WORKDIR /srv

# Install server deps
COPY ${SERVER_DIR}/package.json ${SERVER_DIR}/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Copy built frontend into server/public
COPY --from=webbuild /app/client/${FRONTEND_BUILD_DIR} ./server/public

# Copy server source
COPY ${SERVER_DIR}/src ./server/src

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
