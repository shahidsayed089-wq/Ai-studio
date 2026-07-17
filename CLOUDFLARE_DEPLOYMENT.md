# Cloudflare deployment

The project deploys to the existing `ai-studio-1n1` Cloudflare Pages project as a Next.js static export with a private SHAZAN generation bridge.

## Build settings

1. Production branch: `main`
2. Build command: `npm run build`
3. Build output directory: `out`
4. Node.js: `22`

`public/_worker.js` is copied to `out/_worker.js` and runs through Cloudflare Pages Advanced Mode. It handles only `/api/studio/*`; every other request is forwarded to static assets through `env.ASSETS`.

## Required encrypted secrets

Open **Workers & Pages → ai-studio-1n1 → Settings → Variables and Secrets** and add these to both Production and Preview:

- `KIE_API_KEY`: one private API token from the model gateway.
- `STUDIO_ACCESS_CODE`: a long private beta code entered in the generator before a paid render.

Set `KIE_API_KEY` to **Secret**, not plain text. Never add the token to GitHub, browser code, screenshots or chat.

## Routes

- `POST /api/studio/upload` — temporarily uploads a reference asset.
- `POST /api/studio/generate` — validates the SHAZAN model key and creates an asynchronous task.
- `GET /api/studio/status/:requestId` — normalizes task progress and result URLs.

The external token is added only by the Worker. Public responses use SHAZAN-facing names and generic errors.

## Connected model IDs

- `seedance_2_0_standard` → `bytedance/seedance-2`
- `seedance_2_0_fast` → `bytedance/seedance-2-fast`
- `seedance_2_0_mini` → `bytedance/seedance-2-mini`
- `kling_3_0_elements` → `kling-3.0/video` with a prompt-addressable video element
- `kling_3_0` → `kling-3.0/video` with optional first and last frames
- `happy_horse_1_1` → the appropriate HappyHorse 1.1 text/image/reference workflow

No per-model endpoint environment variables are required.

## Optional variables

- `KIE_API_BASE_URL`: defaults to `https://api.kie.ai`.
- `KIE_UPLOAD_BASE_URL`: defaults to `https://kieai.redpandaai.co`.
- `STUDIO_ALLOW_PUBLIC=true`: removes the owner-code check. Do not enable until authentication, billing, quotas and rate limits exist.

Generated media is temporary upstream. Copy completed customer assets to durable SHAZAN storage before a full public launch.
