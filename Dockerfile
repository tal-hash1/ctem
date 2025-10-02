# ---------- 1) Build the frontend from ./web ----------
FROM node:20-bookworm AS webbuild

ARG FRONTEND_DIR=web
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /app/web

# Copy manifests and install deps
COPY ${FRONTEND_DIR}/package.json ./
COPY ${FRONTEND_DIR}/package-lock.json ./ || true
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source and build
COPY ${FRONTEND_DIR}/ ./
RUN npm run build

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /srv/server

# Install server deps
COPY ${SERVER_DIR}/package.json ./
COPY ${SERVER_DIR}/package-lock.json ./ || true
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy server source
COPY ${SERVER_DIR}/src ./src

# Copy built frontend into server/public
WORKDIR /srv
RUN mkdir -p server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
EOF
