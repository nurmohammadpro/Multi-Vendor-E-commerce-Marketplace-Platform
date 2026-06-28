FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package*.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci

FROM deps AS builder
ARG NEXT_PUBLIC_API_URL=https://api.marketone.appbrainer.tech
ARG NEXT_PUBLIC_ADMIN_APP_URL=https://admin.marketone.appbrainer.tech
ARG NEXT_PUBLIC_STORE_APP_URL=https://app.marketone.appbrainer.tech

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ADMIN_APP_URL=${NEXT_PUBLIC_ADMIN_APP_URL}
ENV NEXT_PUBLIC_STORE_APP_URL=${NEXT_PUBLIC_STORE_APP_URL}

RUN npm run build --workspace @mvp/login-web

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/login-web/.next/standalone ./
COPY --from=builder /app/apps/login-web/.next/static ./apps/login-web/.next/static
COPY --from=builder /app/apps/login-web/public ./apps/login-web/public

EXPOSE 3000

CMD ["node", "apps/login-web/server.js"]
