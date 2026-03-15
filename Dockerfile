# ─── Stage 1: Build Frontend ───
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ─── Stage 2: Build Backend ───
FROM node:20-slim AS backend-build
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install
COPY backend/ .
RUN npx tsc

# ─── Stage 3: Production Image ───
FROM node:20-slim AS production
WORKDIR /app

# Copy backend compiled output + dependencies
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/package.json ./backend/

# Copy frontend build output
COPY --from=frontend-build /app/dist ./dist

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
