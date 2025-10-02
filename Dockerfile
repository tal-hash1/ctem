FROM node:20-bookworm AS webbuild

ARG FRONTEND_DIR=web
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /app/web

COPY ${FRONTEND_DIR}/package.json ./
COPY ${FRONTEND_DIR}/package-lock.json ./ || true
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY ${FRONTEND_DIR}/ ./
RUN npm run build

FROM node:20-bookworm AS runtime

ARG SERVER_DIR=server
ARG FRONTEND_BUILD_DIR=dist

WORKDIR /srv/server

COPY ${SERVER_DIR}/package.json ./
COPY ${SERVER_DIR}/package-lock.json ./ || true
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY ${SERVER_DIR}/src ./src

WORKDIR /srv
RUN mkdir -p server/public
COPY --from=webbuild /app/web/${FRONTEND_BUILD_DIR} ./server/public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
