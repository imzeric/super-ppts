FROM node:22.23.4-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
EXPOSE 3000
CMD ["pnpm", "start"]
