FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/brandme.sqlite"

COPY package.json ./

RUN npm install --omit=dev \
  && npm cache clean --force

COPY . .

RUN npx prisma generate

ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["sh", "-c", "npx prisma migrate deploy && exec npm run docker-start"]
