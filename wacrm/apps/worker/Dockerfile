FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker ./apps/worker

RUN npm install
RUN npm run build --workspace=@wacrm/shared
RUN npm run build --workspace=@wacrm/worker

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
WORKDIR /app/apps/worker
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
