FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/brandme.sqlite"

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["sh", "-c", "npx prisma migrate deploy && exec npm run docker-start"]