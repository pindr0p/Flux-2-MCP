FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

RUN npm ci

COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    FLUX_HTTP_HOST=0.0.0.0 \
    FLUX_HTTP_PORT=3000 \
    FLUX_HTTP_MCP_PATH=/mcp \
  FLUX_CONTAINER_STORAGE_ROOT=/app/data/flux

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p "$FLUX_CONTAINER_STORAGE_ROOT" \
  && chown -R node:node /app

USER node

EXPOSE ${FLUX_HTTP_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.FLUX_HTTP_PORT ?? '3000'; fetch('http://127.0.0.1:' + port + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "export FLUX_OUTPUT_DIR=\"${FLUX_OUTPUT_DIR:-${FLUX_CONTAINER_STORAGE_ROOT:-/app/data/flux}/images}\"; export FLUX_METADATA_FILE=\"${FLUX_METADATA_FILE:-${FLUX_CONTAINER_STORAGE_ROOT:-/app/data/flux}/metadata.json}\"; exec node dist/src/http.js"]