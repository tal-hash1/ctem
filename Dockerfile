# ---------- 1) Build the frontend (web/) ----------
FROM node:20-bookworm AS webbuild

# Declare build args INSIDE the stage (safe for all builders)
ARG FRONTEND_DIR=web            # change via --build-arg if needed
ARG FRONTEND_BUILD_DIR=dist     # Vite=dist, CRA=build

WORKDIR /app

# Copy only manifests for better caching (tolerate missing optional files)
COPY ${FRONTEND_DIR}/package.json ./web/package.json
COPY ${FRONTEND_DIR}/package-lock.json* ./web/  # optional
COPY ${FRONTEND_DIR}/pnpm-lock.yaml* ./web/     # optional
COPY ${FRONTEND_DIR}/yarn.lock* ./web/          # optional
COPY ${FRONTEND_DIR}/.npmrc* ./web/             # optional

RUN cd web && npm ci

# Copy the rest of the frontend source and build
COPY ${FRONTEND_DIR} ./web
WORKDIR /app/web
RUN npm run build  # produces /app/web/${FRONTEND_BUILD_DIR}

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /srv

# Install server deps
COPY ${SERVER_DIR}/package.json ./server/package.json
COPY ${SERVER_DIR}/package-lock.json* ./server/  # optional
RUN cd server && npm ci --omit=dev

# Copy server source
COPY ${SERVER_DIR}/src ./server/src

# Copy built frontend into server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
