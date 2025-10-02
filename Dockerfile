# ---------- 1) Build the React app ----------
FROM node:20-bookworm AS webbuild
WORKDIR /app

# Copy only manifests first for better caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* .npmrc* ./
# If you use pnpm or yarn, switch the install command accordingly
RUN npm ci

# Copy app source
COPY . .

# If your React app lives in a subfolder (e.g., ./client), change to:
# WORKDIR /app/client
# RUN npm ci && npm run build
# and later copy from /app/client/dist (or build) instead of /app/dist

# Build frontend (outputs to /app/dist if using Vite; /app/build for CRA)
# Change this to your actual build script
RUN npm run build

# ---------- 2) Runtime image (Node + Express serving API + static) ----------
FROM node:20-bookworm AS runtime
WORKDIR /srv

# Copy server code
# Make sure these files exist in your repo:
#   server/package.json
#   server/src/index.js  (Express app)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Copy frontend build artifacts into server's public dir
# Adjust the source path if your build output is at /app/build
COPY --from=webbuild /app/dist ./server/public

# Copy server source
COPY server/src ./server/src

# Env + port
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Start server
CMD ["node", "server/src/index.js"]

