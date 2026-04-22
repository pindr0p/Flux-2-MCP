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
    FLUX_OUTPUT_DIR=/app/data/flux/images \
    FLUX_METADATA_FILE=/app/data/flux/metadata.json

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data/flux/images && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/src/http.js"]