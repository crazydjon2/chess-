# One container = game server + built client (server/index.js serves client/dist).
FROM node:24-slim AS build
WORKDIR /app
COPY client/package.json client/package-lock.json client/
COPY server/package.json server/package-lock.json server/
# client: `npm install`, not `ci` — npm mis-checks optional wasm deps in a
# lockfile written on Windows ("Missing: @emnapi/runtime"); versions still come from the lock.
RUN npm install --prefix client --no-audit --no-fund && npm ci --prefix server --omit=dev
COPY client client
RUN npm run build --prefix client

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    STATS_DB=/data/stats.db
# The server imports the shared rules straight from client/src (game/, i18n/);
# client/package.json is needed for "type": "module".
COPY --from=build /app/client/package.json client/package.json
COPY --from=build /app/client/src client/src
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/node_modules server/node_modules
COPY server server
# The bot (server/bot.js) reuses the balance lab's AI.
COPY tools/balance/lib tools/balance/lib
# Mount a persistent volume here, or the stats are lost on every deploy.
VOLUME /data
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
