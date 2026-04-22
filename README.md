# librechat-flux-mcp

TypeScript MCP server for LibreChat that targets FLUX models through either Azure Foundry's Black Forest Labs provider-specific route or the direct Black Forest Labs API.

## Current status

This repository now includes:

- stdio MCP server scaffold
- Streamable HTTP MCP entrypoint scaffold for containerized deployment
- generic provider config with Azure and direct BFL env aliases
- FLUX model profile layer
- BFL-compatible submit, status refresh, and result fetch adapter for Azure BFL-backed and direct BFL routing
- local metadata and image persistence
- async MCP tools for submit/status/result flows
- probe scripts for direct text-only and reference-guided validation

The initial tool surface currently includes:

- `flux_get_model_capabilities`
- `flux_submit_generate`
- `flux_submit_generate_with_references`
- `flux_submit_edit`
- `flux_submit_edit_multi_reference`
- `flux_submit_variants`
- `flux_get_job_status`
- `flux_get_job_result`

The exact submit-tool subset and accepted input fields are derived from `FLUX_DEFAULT_MODEL` at startup. Models that do not support references, edits, `aspect_ratio`, `guidance`, or `steps` will not expose those tool paths or input fields.

## Environment

Copy values from `.env.example` into your local environment or `.env` file.

Generic provider variables are preferred:

- `FLUX_PROVIDER_KIND` (`azure-bfl` or `direct-bfl`)
- `FLUX_PROVIDER_BASE_URL`
- `FLUX_PROVIDER_AUTH_STRATEGY`
- `FLUX_PROVIDER_API_KEY` or `FLUX_PROVIDER_BEARER_TOKEN`
- `FLUX_PROVIDER_RELEASE_CHANNEL`

Optional Streamable HTTP resumability variables:

- `FLUX_REDIS_URL` enables replayable SSE events with Redis Streams. If unset, the server still starts and serves non-resumable Streamable HTTP sessions.
- `FLUX_HTTP_SSE_RETRY_INTERVAL_MS` controls the SSE retry hint sent to reconnecting clients.
- `FLUX_HTTP_EVENT_TTL_SECONDS`, `FLUX_HTTP_EVENT_MAX_STREAM_LENGTH`, and `FLUX_HTTP_EVENT_KEY_PREFIX` bound Redis event retention.
- `FLUX_HTTP_SESSION_IDLE_TIMEOUT_MS` and `FLUX_HTTP_SESSION_SWEEP_INTERVAL_MS` control idle MCP HTTP session cleanup.

Runtime concurrency variable:

- `FLUX_MAX_PARALLEL_REQUESTS` now caps concurrent upstream provider API requests across submit and polling flows.

Model selection variable:

- `FLUX_DEFAULT_MODEL` selects the active upstream model for the server. Model selection is env-driven rather than per request.

Azure aliases are also supported:

- `AZURE_ENDPOINT`
- `AZURE_API_KEY`

Direct BFL aliases are also supported:

- `BFL_API_BASE_URL`
- `BFL_API_KEY`

Provider notes:

- `azure-bfl` uses bearer authorization and submits to `/providers/blackforestlabs/v1/<model-path>?api-version=<version>`.
- `direct-bfl` uses `x-key` authorization and submits to `/v1/<endpoint>`.
- `direct-bfl` can select a pinned or preview endpoint with `FLUX_PROVIDER_RELEASE_CHANNEL=stable|preview`.

## Scripts

- `npm run build`
- `npm run dev`
- `npm run dev:http`
- `npm run start`
- `npm run start:http`
- `npm run probe:generate -- "your prompt"`
- `npm run probe:compose -- /path/to/reference-1.jpg [/path/to/reference-2.jpg]`

The probe scripts now print provider kind, release channel, upstream request ID, and polling URL so Azure and direct BFL behavior can be compared side by side.

## Container deployment

- Create `.env` at the repo root from `.env.example`; `.env` is ignored by git.
- Edit `.env` with your provider credentials before deploying.
- Set `FLUX_REDIS_URL` only if you want resumable Streamable HTTP replay through an existing Redis instance.
- Build and run with `docker compose up --build`.
- Wait until `docker compose ps` reports the service as `healthy` before testing the MCP endpoint.
- The HTTP MCP endpoint is exposed at `http://localhost:3001/mcp` by default.
- Container health is exposed at `http://localhost:3001/healthz` by default.
- The Compose service uses Docker's default `bridge` network mode instead of creating a project-specific Compose network.
- Persistent image and metadata storage now uses a named Docker volume instead of a host bind mount, which avoids host permission issues during startup.

## Examples

- `examples/librechat.stdio.yaml` keeps the local child-process setup.
- `examples/librechat.http.yaml` shows LibreChat `streamable-http` wiring for the containerized MCP server.

## Notes

- The runtime MCP contract is async: submit a job, poll status, then fetch the rendered result.
- `flux_get_model_capabilities` reports the active model profile derived from `FLUX_DEFAULT_MODEL`.
- Streamable HTTP now attaches background job tracking for submitted HTTP sessions and emits session-scoped completion messages when jobs reach a terminal state.
- When `FLUX_REDIS_URL` is configured and reachable, Streamable HTTP stores SSE events in Redis Streams and replays missed notifications after reconnects via `Last-Event-ID`.
- Redis is optional. If `FLUX_REDIS_URL` is unset, the server still runs without resumable Streamable HTTP replay.
- Idle Streamable HTTP sessions are swept and closed after `FLUX_HTTP_SESSION_IDLE_TIMEOUT_MS` without activity.
- Polling with `flux_get_job_status` and `flux_get_job_result` remains the authoritative fallback for stdio clients, reconnects, and any client that does not surface streamed notifications well.
- The v1 upstream path is BFL-compatible. It can target Azure's BFL-backed route or the direct BFL API without changing tool schemas.
- Submit tools return job handles. Use `flux_get_job_status` and `flux_get_job_result` to complete the flow.
- Stored images are addressed by `image_id` so later edits can reuse prior outputs.