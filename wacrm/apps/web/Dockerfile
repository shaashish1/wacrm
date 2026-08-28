FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY apps/worker ./apps/worker

ARG NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3100
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
ENV META_APP_SECRET=build-placeholder

RUN npm run build --workspace=@wacrm/shared
RUN npm run build --workspace=@wacrm/web

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app ./
USER app
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "--workspace=@wacrm/web"]
