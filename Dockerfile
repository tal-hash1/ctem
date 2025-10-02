ARG FRONTEND_DIR=web           # your frontend lives in ./web
ARG FRONTEND_BUILD_DIR=dist    # Vite => dist ; CRA => build
ARG SERVER_DIR=server

FROM node:20-bookworm AS webbuild
ARG FRONTEND_DIR
ARG FRONTEND_BUILD_DIR
WORKDIR /app

COPY ${FRONTEND_DIR}/package.json ${FRONTEND_DIR}/package-lock.json* ${FRONTEND_DIR}/pnpm-lock.yaml* ${FRONTEND_DIR}/yarn.lock* ${FRONTEND_DIR}/.npmrc* ./web/
RUN cd web && npm ci

COPY ${FRONTEND_DIR} ./web
WORKDIR /app/web
RUN npm run build   # produces /app/web/${FRONTEND_BUILD_DIR}

FROM node:20-bookworm AS runtime
ARG SERVER_DIR
ARG FRONTEND_BUILD_DIR
WORKDIR /srv

COPY ${SERVER_DIR}/package.json ${SERVER_DIR}/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

# Copy server source
COPY ${SERVER_DIR}/src ./server/src

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
