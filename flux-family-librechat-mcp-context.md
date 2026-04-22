# FLUX Family MCP for LibreChat — FLUX.2-pro-first Implementation Context

## Working decision
Build a **new MCP server project** for **LibreChat** that exposes **Azure AI Foundry FLUX models** with **FLUX.2-pro as the first-class implementation**.

### New repo name
`librechat-flux-mcp`

### Why this is the right scope
Do **not** build a FLUX.2-pro-only dead end.

Instead, build a **standalone FLUX-family MCP** with:
- **FLUX.2-pro-first** implementation
- **model capability profiles**
- a **BFL provider API adapter**
- an **Image API adapter** for models that support it later

This preserves the best starting point for your current Azure Foundry + LibreChat + FLUX.2-pro use case while avoiding a future rewrite when you want to support FLUX.2-flex, FLUX.1-Kontext-pro, or FLUX-1.1-pro.

---

## Why a standalone MCP is justified
A generic Azure OpenAI-style image MCP is not the right abstraction for FLUX.

### Reasons
1. **FLUX.2-pro and FLUX.2-flex are documented on the BFL provider-specific endpoint first**.
2. **FLUX.2-pro accepts text + image input**, supports **up to 8 reference images**, and exposes a richer control surface than a basic image generations wrapper.
3. **Not all FLUX models expose the same endpoint families**.
4. A generic Azure OpenAI image MCP would either:
   - hide FLUX-native controls,
   - special-case FLUX everywhere,
   - or accidentally target the wrong endpoint family.

### Practical consequence
Use **one standalone FLUX MCP** with a stable tool surface for the agent and **model-specific capability routing** underneath.

---

## Critical clarification: generation with reference images
Yes — the plan should **explicitly cover generation with reference images**.

The earlier draft covered:
- text-only generation
- single-reference edit
- multi-reference edit

That was **too narrow**.

### Correct interpretation for FLUX.2-pro
Treat **text + optional reference images** as the core primitive.

The MCP should not assume there are only two separate conceptual modes:
- generate from text only
- edit an existing image

Instead, for FLUX.2-pro, the safest model is:
- **compose from text only**
- **compose from text + 1..N reference images**

That means the implementation should have one internal core operation:

```ts
compose({ prompt, references?, params })
```

Then expose agent-friendly wrappers on top of it.

### Why this is the right design
Azure’s FLUX documentation says **FLUX.2-pro accepts text and image input** and supports **multi-reference image editing with up to 8 images**. The BFL API documentation for **FLUX.2 [PRO]** exposes one endpoint called **“Generate or edit an image”** and includes `input_image` through `input_image_8` in the same request family. That means the safest MCP design is to treat **reference-guided generation and edit-like refinement as the same upstream composition primitive**, with different tool wrappers for clarity. ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux), [Black Forest Labs](https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bpro%5D-recommended-for-editing))

### Required outcome
The MCP **must** include a first-class tool for **reference-guided generation**.

Recommended tool:
- `flux_generate_with_references`

This is distinct from:
- `flux_edit`
- `flux_edit_multi_reference`

Even if all three map to the same upstream `compose()` path internally.

---

## Source of truth
Use these as the authoritative sources during implementation:

1. **Microsoft Learn — Deploy and use FLUX models in Microsoft Foundry**
2. **BFL API docs — Generate or edit an image with FLUX.2 [PRO]**
3. **Model Context Protocol TypeScript SDK**

### Design facts to preserve
- FLUX.2-pro supports **text-to-image generation**.
- FLUX.2-pro accepts **text and image input**.
- FLUX.2-pro supports **multi-reference image editing with up to 8 images**.
- FLUX.2-pro maximum output resolution is **4 MP**.
- The BFL provider API exposes the full parameter surface for FLUX.2-pro.
- Multiple reference images are available through the **API**, not the Foundry playground.
- The BFL docs describe one **generate-or-edit** endpoint for FLUX.2-pro.

---

## Model capability matrix
Design the server around capability profiles.

| Model | API mode | Input | Max refs | Best use | Notes |
|---|---|---:|---:|---|---|
| `FLUX.2-pro` | `bflProvider` | text + image | 8 | production-quality generation, reference-guided composition, multi-reference refinement | first implementation |
| `FLUX.2-flex` | `bflProvider` | text + image | 10 | text-heavy layouts, more graceful throughput | next model to add |
| `FLUX.1-Kontext-pro` | `bflProvider` + `imageApi` | text + image | 1 | in-context generation/editing, character consistency | later add via adapter |
| `FLUX-1.1-pro` | `bflProvider` + `imageApi` | text | 0 | fast generation | later add via adapter |

### V1 scope
Implement **FLUX.2-pro only** first.

### V1.1 scope
Add:
- `FLUX.2-flex`
- `flux_get_model_capabilities`

### Later scope
Add:
- `FLUX.1-Kontext-pro`
- `FLUX-1.1-pro`

---

## Final project choice
### Build a new repo
`librechat-flux-mcp`

### Do not fork an existing repo
Existing repos are useful references, but not the right base:
- Some Azure MCP image repos are centered on **OpenAI-compatible image routes**.
- Some are **generation-first** and do not expose a full FLUX-native tool surface.
- They are useful for:
  - MCP response patterns
  - LibreChat wiring examples
  - packaging ideas
- They are **not** the cleanest foundation for a FLUX-family server with model profiles and adapter routing.

---

## Existing repos to reference (not fork)
1. **satomic/Azure-AI-Image-Editor-MCP**
   - Good for MCP image response patterns.
   - Not the ideal base because it is oriented around Azure image editing patterns that are narrower than a FLUX-family design.

2. **malikmalikayesha/Azure-Image-Generation-MCP**
   - Good for LibreChat MCP wiring examples.
   - Not a full FLUX-family editing and reference-guided composition foundation.

3. **Model Context Protocol TypeScript SDK**
   - Use this as the implementation foundation.

---

## Tech stack
- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **MCP SDK:** official TypeScript MCP SDK
- **Transport (phase 1):** `stdio`
- **Transport (phase 2):** `streamable-http`
- **Validation:** `zod`
- **Logging:** `pino` or equivalent structured logger
- **Storage (v1):** local filesystem + JSON metadata index
- **HTTP client:** native `fetch`

---

## High-level architecture

### 1. Stable MCP tool surface
The agent should see a **stable FLUX tool contract** regardless of which FLUX model is active.

### 2. Model profile layer
At runtime, resolve the selected model into a capability profile.

Example:
```ts
export type FluxModelId =
  | "FLUX.2-pro"
  | "FLUX.2-flex"
  | "FLUX.1-Kontext-pro"
  | "FLUX-1.1-pro";

export interface FluxModelProfile {
  id: FluxModelId;
  apiMode: "bflProvider" | "imageApi" | "both";
  maxReferenceImages: number;
  supportsTextOnlyGeneration: boolean;
  supportsReferenceGuidedComposition: boolean;
  supportsSingleReferenceEdit: boolean;
  supportsMultiReferenceEdit: boolean;
  supportsGuidance: boolean;
  supportsSteps: boolean;
  supportsAspectRatio: boolean;
  supportsWidthHeight: boolean;
  maxOutputMegapixels: number;
}
```

### 3. Adapter layer
Implement two adapters:
- `BflProviderAdapter`
- `ImageApiAdapter`

### 4. One internal composition primitive
The core image operation should be:

```ts
compose(request: ComposeRequest): Promise<ComposeResult>
```

This is the key architecture decision.

Everything else becomes a wrapper:
- text-only generation = compose with `references=[]`
- generation with references = compose with `references=[...]`
- single-image refinement = compose with one stored parent reference
- multi-reference refinement = compose with many stored parent references
- variants = repeated compose with different seeds

### 5. Image store and metadata store
All output images must be server-managed so the agent can chain operations using `image_id`s.

---

## Core internal request model
```ts
export interface ComposeRequest {
  model: FluxModelId;
  prompt: string;
  referenceImageIds?: string[];
  // internal escape hatch for tests or future import flows
  referenceImagesBase64?: string[];
  width?: number;
  height?: number;
  aspectRatio?: string;
  outputFormat?: "png" | "jpeg";
  seed?: number;
  safetyTolerance?: number;
  guidance?: number;
  steps?: number;
}
```

### Important rule
The MCP tool layer should **prefer `referenceImageIds`**.

Do not build the public tool surface around raw file paths.

---

## Design principles
1. **FLUX-native first**
   - Model behaviors come from Azure Foundry and BFL docs, not from ComfyUI or Photoshop mental models.

2. **FLUX-family architecture**
   - Start with FLUX.2-pro.
   - Do not hard-code assumptions that block FLUX.2-flex or Kontext later.

3. **Reference-guided generation is first-class**
   - This is not an afterthought.
   - The tool surface must expose it explicitly.

4. **Server-managed image IDs**
   - Use `image_id` instead of file paths for chaining.

5. **Stable MCP contract**
   - Tool names and schemas should stay stable as more FLUX models are added.

6. **Transport-independent behavior**
   - `stdio` now, `streamable-http` later.
   - No schema drift between transports.

---

## Non-goals
- Do not add ComfyUI.
- Do not add Photoshop.
- Do not add Gemini or any second image backend.
- Do not pretend undocumented FLUX.2-pro features are guaranteed.
- Do not build the first version around LibreChat file-path handoff.

---

## Recommended repository structure
```text
librechat-flux-mcp/
  package.json
  tsconfig.json
  README.md
  .env.example
  src/
    stdio.ts
    http.ts
    server.ts
    config.ts
    profiles/
      fluxProfiles.ts
    adapters/
      bflProviderAdapter.ts
      imageApiAdapter.ts
    flux/
      compose.ts
      payloads.ts
      schemas.ts
    tools/
      fluxGetModelCapabilities.ts
      fluxGenerate.ts
      fluxGenerateWithReferences.ts
      fluxEdit.ts
      fluxEditMultiReference.ts
      fluxVariants.ts
    storage/
      imageStore.ts
      metadataStore.ts
    resources/
      imageResource.ts
      sessionResource.ts
    util/
      image.ts
      auth.ts
      errors.ts
      logging.ts
  scripts/
    probe-flux2pro-generate.ts
    probe-flux2pro-compose.ts
  tests/
    adapter.test.ts
    compose.test.ts
    toolSchemas.test.ts
    integration.test.ts
  examples/
    librechat.stdio.yaml
    librechat.http.yaml
```

---

## Environment variables
```env
FLUX_PROVIDER_KIND=azure-bfl
BASE_URL=
API_KEY=
MODEL=FLUX.2-pro
FLUX_PROVIDER_API_VERSION=preview
FLUX_OUTPUT_DIR=./data/flux
FLUX_METADATA_FILE=./data/flux/metadata.json
FLUX_REQUEST_TIMEOUT_MS=240000
FLUX_MAX_PARALLEL_REQUESTS=2
FLUX_VARIANTS_MAX_COUNT=4
FLUX_ENABLE_IMAGE_IMPORT=false
```

---

## Agent-facing MCP tool surface
Implement these tools.

### 1. `flux_get_model_capabilities`
Return the active model’s capability profile.

#### Purpose
- helps the agent reason about what is allowed
- useful once more FLUX models are added
- trivial to implement

#### V1
Optional, but recommended.

---

### 2. `flux_generate`
Create a new image from **text only**.

#### Inputs
- `prompt` (required)
- `aspect_ratio` (optional)
- `width` (optional)
- `height` (optional)
- `output_format` (`png` or `jpeg`)
- `guidance` (optional)
- `steps` (optional)
- `seed` (optional)
- `safety_tolerance` (optional)

#### Behavior
- calls `compose()` with no references
- saves output image
- saves metadata
- returns image content + `image_id`

---

### 3. `flux_generate_with_references`
Create a **new image guided by one or more reference images**.

This is the **missing capability that must be first-class in the plan**.

#### Inputs
- `prompt` (required)
- `reference_image_ids` (required, array length 1..8 for FLUX.2-pro)
- `aspect_ratio` or `width`/`height`
- `output_format`
- `guidance`
- `steps`
- `seed`
- `safety_tolerance`

#### Behavior
- resolves reference image IDs from server storage
- passes those references into the FLUX.2-pro compose request
- saves the new output as its own `image_id`
- records all parent reference image IDs in metadata

#### Semantic intent
Use this when the user wants:
- style transfer from multiple references
- composition influenced by prior outputs
- identity consistency across iterations
- new concept generation grounded in earlier images

#### Important note
This tool is **not** limited to “edit the same canvas.”
It is the MCP’s explicit wrapper for **reference-guided generation / composition**.

---

### 4. `flux_edit`
Edit or refine a previous stored image.

#### Inputs
- `image_id` (required)
- `prompt` (required)
- optional generation parameters

#### Behavior
- thin wrapper over `compose()` using one parent image reference
- saves result as a new image
- preserves lineage

#### Why keep this tool if `flux_generate_with_references` exists?
Because it is easier for the agent to plan against for simple one-image refinement requests.

---

### 5. `flux_edit_multi_reference`
Refine or synthesize from multiple prior stored images.

#### Inputs
- `image_ids` (required, 2..8 for FLUX.2-pro)
- `prompt` (required)
- optional generation parameters

#### Behavior
- thin wrapper over `compose()` using many parent references
- saves result as a new image
- persists all parent linkage

#### Why keep this tool if `flux_generate_with_references` exists?
Because it gives the agent a more obvious tool for iterative multi-image refinement while keeping the internal client architecture unified.

---

### 6. `flux_variants`
Create several alternative outputs by varying seed values.

#### Inputs
- one of:
  - `prompt`
  - `image_id`
  - `image_ids`
- `count` (required, cap at 4 in v1)
- optional shared generation parameters
- optional `base_seed`

#### Behavior
- fans out repeated `compose()` calls
- uses strict concurrency limits
- returns multiple output images, each with its own `image_id`

---

## Optional tool for later
### `flux_import_reference`
Do **not** block v1 on this.

#### Why it exists
If you want the agent to use user-provided reference images that were **not** created by the MCP itself, you eventually need a way to register them into the server’s image store.

#### Why it should not block v1
LibreChat handoff for user-uploaded images into arbitrary MCP tools is still the messiest part of the workflow.

#### Suggested later behavior
- accept base64 image bytes
- validate format and size
- persist image as a stored reference asset
- return `image_id`

---

## Output contract
Every successful image tool should return:
- short human-readable summary text
- MCP image content for rendering in LibreChat
- structured metadata summary
- a reusable `image_id`

### Minimum metadata to persist
- `image_id`
- `asset_type` (`generated` or `reference`)
- `created_at`
- `model`
- `prompt`
- `seed`
- `output_format`
- `width`
- `height`
- `parent_image_ids`
- `sha256`
- raw request parameters used

---

## Storage design
### Image storage
```text
/data/flux/images/{image_id}.png
```

### Metadata storage
Store a JSON index in v1:
```json
{
  "images": {
    "img_000001": {
      "image_id": "img_000001",
      "asset_type": "generated",
      "created_at": "2026-04-21T12:00:00Z",
      "model": "FLUX.2-pro",
      "prompt": "...",
      "seed": 42,
      "parent_image_ids": []
    }
  }
}
```

### ID strategy
Use monotonic IDs or ULIDs.

Preferred format:
- `img_000001`
- `img_000002`

---

## Validation rules
- Require `prompt` for all generation/composition tools.
- Enforce `reference_image_ids.length <= modelProfile.maxReferenceImages`.
- For FLUX.2-pro, cap references at **8**.
- Restrict `output_format` to `png` and `jpeg`.
- Cap `count` in `flux_variants`.
- Validate any `guidance` / `steps` usage against the active model profile.
- Reject missing or corrupted referenced images.
- Reject mutually invalid size parameters.

---

## Error handling requirements
Implement structured errors with stable codes.

Examples:
- `CONFIG_MISSING`
- `IMAGE_NOT_FOUND`
- `INVALID_REFERENCE_COUNT`
- `MODEL_CAPABILITY_UNSUPPORTED`
- `INVALID_ARGUMENT`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_RATE_LIMITED`
- `UPSTREAM_BAD_RESPONSE`
- `IMAGE_DECODE_FAILED`

Tool errors should be short, explicit, and actionable.

---

## Logging requirements
For each request, log:
- request ID
- tool name
- model name
- adapter name
- latency
- upstream status code
- output image ID(s)
- parent image ID(s)
- retry count

Do not log raw API keys.

---

## Authentication
Support Azure API key first.
Keep auth abstraction clean so Entra ID token auth can be added later.

---

## LibreChat integration target
### Phase 1
Use `stdio`.

Example target config pattern:
```yaml
mcpServers:
  flux:
    type: stdio
    command: node
    args:
      - /absolute/path/to/dist/stdio.js
    timeout: 300000
    initTimeout: 30000
    chatMenu: true
    serverInstructions: |
      Use flux_generate for new text-only images.
      Use flux_generate_with_references when the user wants a new image grounded in one or more reference images.
      Use flux_edit for refinements to a single previous FLUX image.
      Use flux_edit_multi_reference when combining style or identity from multiple previous FLUX images.
      Reuse image_ids from previous tool outputs.
    env:
      FLUX_PROVIDER_KIND: "azure-bfl"
      BASE_URL: "${AZURE_FLUX_BFL_ENDPOINT}"
      API_KEY: "${AZURE_FLUX_API_KEY}"
      MODEL: "FLUX.2-pro"
      FLUX_PROVIDER_API_VERSION: "preview"
      FLUX_OUTPUT_DIR: "/app/data/flux"
```

### Phase 2
Add `streamable-http` without changing tool schemas.

---

## Implementation phases

### Phase 0 — direct API proof
Before building MCP, verify the raw FLUX.2-pro path.

#### Deliverables
- one standalone script for text-only generation
- one standalone script for **reference-guided generation with 1 reference**
- one standalone script for **reference-guided generation with 2 references**
- successful local image decode and save

#### Exit criteria
- confirmed Azure endpoint
- confirmed auth
- confirmed request/response normalization path
- confirmed that text + reference images works in your environment

---

### Phase 1 — server scaffold
Build the TypeScript MCP server skeleton.

#### Deliverables
- package scaffolding
- `stdio` entrypoint
- `server.ts`
- config loader
- model profile layer
- one real tool: `flux_generate`

#### Exit criteria
- LibreChat detects the server
- LibreChat can invoke `flux_generate`
- image renders correctly in chat

---

### Phase 2 — persistence and image IDs
Implement server-managed output state.

#### Deliverables
- image store
- metadata store
- image ID generation
- basic resource lookup helpers

#### Exit criteria
- output images survive across tool invocations
- previously generated images resolve by `image_id`

---

### Phase 3 — composition and edit tools
Implement the reference-aware core.

#### Deliverables
- internal `compose()` operation
- `flux_generate_with_references`
- `flux_edit`
- `flux_edit_multi_reference`
- parent image linkage
- validation and structured errors

#### Exit criteria
- 1-reference composition works
- 2-reference composition works
- 8-reference upper bound enforced for FLUX.2-pro
- `flux_edit` is a thin successful wrapper over `compose()`

---

### Phase 4 — variants and capability tooling
Implement multi-output ergonomics.

#### Deliverables
- `flux_variants`
- `flux_get_model_capabilities`
- clean result summaries
- improved agent instructions

#### Exit criteria
- agent can ask for 2–4 alternatives in one tool call
- reference-guided variant generation works

---

### Phase 5 — hardening
Add production-safe behavior.

#### Deliverables
- timeouts
- retries with backoff
- semaphore/concurrency guard
- cleanup policy / TTL
- improved logs
- integration tests

#### Exit criteria
- stable under repeated requests
- clear rate-limit behavior
- no runaway parallel fanout

---

### Phase 6 — optional external reference ingestion
Only after core iteration is working.

#### Deliverables
- `flux_import_reference` or equivalent
- asset type tracking for imported references
- validation for external reference assets

#### Exit criteria
- reference images not created by the MCP can be registered and reused

---

## Testing strategy
### Unit tests
- schema validation
- model capability profile resolution
- image ID generation
- metadata persistence
- parent linkage
- compose payload construction
- response normalization

### Integration tests
- direct generation call
- single-reference composition call
- two-reference composition call
- `flux_edit` wrapper call
- `flux_edit_multi_reference` wrapper call
- LibreChat-visible MCP image output format

### Manual tests
1. Generate one concept from text.
2. Generate a new concept using one earlier image as a reference.
3. Generate a new concept using two earlier images as references.
4. Refine one image with `flux_edit`.
5. Ask for three variants.
6. Restart the MCP server and confirm stored images still resolve.

---

## First sprint checklist
### Task 1
Initialize the TypeScript project and install:
- MCP TypeScript SDK
- zod
- dotenv
- pino
- a test runner

### Task 2
Write `scripts/probe-flux2pro-generate.ts` that:
- loads env vars
- calls Azure Foundry FLUX.2-pro directly
- writes the result to disk

### Task 3
Write `scripts/probe-flux2pro-compose.ts` that:
- loads env vars
- calls FLUX.2-pro with `input_image`
- calls FLUX.2-pro with `input_image` + `input_image_2`
- writes the result(s) to disk

### Task 4
Implement:
- `src/profiles/fluxProfiles.ts`
- `src/adapters/bflProviderAdapter.ts`
- `src/flux/compose.ts`

### Task 5
Implement:
- `src/storage/imageStore.ts`
- `src/storage/metadataStore.ts`

### Task 6
Implement the MCP server and these tools first:
- `flux_generate`
- `flux_generate_with_references`

### Task 7
Wire the server into LibreChat via `stdio` and verify inline rendering.

### Task 8
Add:
- `flux_edit`
- `flux_edit_multi_reference`
- `flux_variants`

---

## Suggested first commit order
1. repo scaffold
2. env/config loader
3. model profiles
4. direct FLUX.2-pro probe scripts
5. BFL provider adapter
6. normalized `compose()` core
7. persistent image store
8. `flux_generate`
9. LibreChat stdio integration
10. `flux_generate_with_references`
11. `flux_edit`
12. `flux_edit_multi_reference`
13. `flux_variants`
14. tests and hardening

---

## Acceptance criteria for v1
The project is successful when all of the following are true:
- LibreChat can call the MCP server over `stdio`.
- The server can generate a new image with FLUX.2-pro from text only.
- The server can generate a new image with FLUX.2-pro using **1 reference image**.
- The server can generate a new image with FLUX.2-pro using **2 reference images**.
- The server can enforce the **8-reference** upper bound for FLUX.2-pro.
- The server can refine a stored image by `image_id`.
- The server can synthesize from multiple stored images.
- The server can generate variants through repeated seeded calls.
- Images render correctly in LibreChat as MCP image content.
- Outputs are saved and reusable for later composition/refinement.
- The implementation is structured so FLUX.2-flex can be added by introducing a new profile, not rewriting the MCP contract.

---

## Practical recommendation for your coding agent
Tell the coding agent to implement the system in this exact order:
1. **prove direct FLUX.2-pro generation**
2. **prove direct FLUX.2-pro reference-guided composition**
3. **build one internal `compose()` abstraction**
4. **map MCP tools to that abstraction**
5. **only then add ergonomic wrappers like `flux_edit` and `flux_variants`**

This reduces the risk of baking the wrong abstraction into the repo.

---

## Key references
- Microsoft Learn: Deploy and use FLUX models in Microsoft Foundry  
  https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux

- Microsoft Learn: Models sold directly by Azure (BFL FLUX capability table)  
  https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure

- Black Forest Labs: Generate or edit an image with FLUX.2 [PRO]  
  https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bpro%5D-recommended-for-editing

- Model Context Protocol TypeScript SDK  
  https://github.com/modelcontextprotocol/typescript-sdk
