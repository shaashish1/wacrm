FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY .npmrc ./
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
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
