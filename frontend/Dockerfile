# ============================================================
# Intimate Commerce 前端 — 生产镜像（Vite 构建 + Nginx 托管）
#
# 构建：
#   docker build -t intimate-commerce-web ./frontend
#
# 关键：VITE_* 是构建期变量，必须在 build 阶段通过 --build-arg 传入。
#      默认留空 VITE_API_BASE_URL，让前端走相对路径 /api，
#      由本镜像内置的 Nginx 反代到 api 容器。
# ============================================================

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 留空则使用相对路径 /api（同域部署推荐）
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# npm run build = vue-tsc -b && vite build
RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
