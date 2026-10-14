# ============================================================
# Intimate Commerce API — 生产镜像（NestJS + Prisma + MySQL）
#
# 构建：
#   docker build -t intimate-commerce-api ./backend
#
# 多 target 说明：
#   runner  —— 精简运行镜像（默认 target）
#   migrate —— 含 prisma CLI，仅用于执行迁移：
#              docker compose -f deploy/docker-compose.prod.yml run --rm migrate
#
# 注意：DATABASE_URL 等变量必须运行时注入，
#      不要把 .env 打进镜像层（镜像层内容可被反查，且会泄漏密钥）。
# ============================================================

FROM node:20-alpine AS base
# Prisma 查询引擎依赖 OpenSSL；alpine 镜像默认不带，
# 缺失时会报 "Unable to require libquery_engine" 之类的引擎加载错误。
RUN apk add --no-cache openssl
WORKDIR /app

# ---------- 生产依赖 ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- 构建 ----------
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- 迁移专用（一次性任务，不常驻） ----------
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- 运行 ----------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# 生成的 Prisma Client 位于这些目录，必须从 builder 覆盖过来
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY package.json ./
COPY register-paths.cjs ./

EXPOSE 3000
# 本镜像不内置 .env，请通过 --env-file / compose env_file / 平台密钥管理注入
CMD ["node", "-r", "./register-paths.cjs", "dist/src/main.js"]
