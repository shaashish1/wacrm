FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

RUN npm run build --workspace=@wacrm/shared
RUN npm run build --workspace=@wacrm/worker

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Run as root so the Compose sessions volume is writable (Baileys auth state).
COPY --from=builder /app/package.json /app/package-lock.json /app/.npmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker ./apps/worker
WORKDIR /app/apps/worker
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
