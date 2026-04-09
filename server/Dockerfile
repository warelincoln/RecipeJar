FROM node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN npm pkg delete scripts.postinstall && \
    npm ci --workspace=@orzo/shared --workspace=@orzo/server && \
    npm rebuild sharp --platform=linux --arch=x64

COPY shared/ shared/
COPY server/ server/

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "--import", "tsx", "server/src/app.ts"]
