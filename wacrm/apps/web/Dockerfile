FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY apps/worker ./apps/worker

RUN npm install

# Placeholders so `next build` can evaluate NEXT_PUBLIC_* at compile time.
# Runtime values come from Compose/env — rebuild if you change public URL/keys.
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
COPY --from=builder /app ./
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3100/api/health || exit 1
CMD ["npm", "run", "start", "--workspace=@wacrm/web"]
