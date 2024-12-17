FROM node:22.12

RUN npm install -g bun

WORKDIR /app

COPY package.json bun.lockb ./

RUN bun install

COPY . .

RUN bun run build

CMD ["bun", "run", "dist/bot.mjs"]