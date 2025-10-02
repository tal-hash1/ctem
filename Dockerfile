# ---------- 1) Build the frontend (web/) ----------
FROM node:20-bookworm AS webbuild

ARG FRONTEND_DIR=web
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /app

# Copy only the frontend manifest first for better caching
COPY ${FRONTEND_DIR}/package.json ./web/package.json
RUN cd web && npm ci

# Copy the rest of the frontend source and build
COPY ${FRONTEND_DIR}/ ./web/
WORKDIR /app/web
RUN npm run build

# ---------- 2) Runtime: Node/Express serving API + static ----------
FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /srv

# Install server deps
COPY ${SERVER_DIR}/package.json ./server/package.json
RUN cd server && npm ci --omit=dev

# Copy server source
COPY ${SERVER_DIR}/src ./server/src

# Copy built frontend into server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
