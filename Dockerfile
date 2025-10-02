# ---------- 1) Build the frontend from ./web ----------
FROM node:20-bookworm AS webbuild

ARG FRONTEND_DIR=web          
ARG FRONTEND_BUILD_DIR=dist   

# put us inside /app/web
WORKDIR /app/web

# copy the entire frontend (simple & robust; fine for most apps)
COPY ${FRONTEND_DIR}/ ./

# install with the right tool (yarn/pnpm/npm) and build
RUN corepack enable && \
    if [ -f yarn.lock ]; then \
      echo "Using yarn"; yarn install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then \
      echo "Using pnpm"; pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      echo "Using npm ci"; npm ci; \
    else \
      echo "No lockfile found → npm install"; npm install; \
    fi && \
    npm run build

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

# app lives at /srv/server
WORKDIR /srv/server

# copy server (package.json + src)
COPY ${SERVER_DIR}/ ./

# install server deps (prefer lockfile if present)
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# static assets for the UI
WORKDIR /srv
RUN mkdir -p server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
