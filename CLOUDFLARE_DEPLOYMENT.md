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

- `FAL_KEY`: primary private fal.ai API token.
- `STUDIO_ACCESS_CODE`: a long temporary owner-only generation code.
- `KIE_API_KEY`: optional Kie fallback token for Seedance Mini and Kling Elements.

Set all three to **Secret**, not plain text. Never add tokens to GitHub, browser code, screenshots or chat.

## Routes

- `POST /api/studio/upload` — temporarily uploads a reference asset.
- `POST /api/studio/generate` — validates the SHAZAN model key and creates an asynchronous task.
- `GET /api/studio/status/:requestId` — normalizes task progress and result URLs.

The external token is added only by the Worker. Public responses use SHAZAN-facing names and generic errors.

## Connected fal.ai model IDs

- `gemini_omni_flash` → `google/gemini-omni-flash` or `/reference-to-video`
- `grok_imagine_video_1_5` → `xai/grok-imagine-video/v1.5/image-to-video`
- `seedance_2_0_standard` / `seedance_2_0_fast` → matching fal text, image or reference endpoint
- `kling_3_0` → `fal-ai/kling-video/v3/pro/*`
- `kling_3_0_omni` → `fal-ai/kling-video/o3/4k/image-to-video`
- `veo_3_1` → matching Veo 3.1 text, image or reference endpoint
- `happy_horse_1_1` → matching HappyHorse 1.1 text or image endpoint
- Image models → GPT Image 2, Nano Banana 2 / Pro, Grok Imagine Image and FLUX 2 Pro

Kie fallbacks:

- `seedance_2_0_mini` → `bytedance/seedance-2-mini`
- `kling_3_0_elements` → `kling-3.0/video` with one prompt-addressable video element

No per-model endpoint environment variables are required.

## Optional variables

- `KIE_API_BASE_URL`: defaults to `https://api.kie.ai`.
- `KIE_UPLOAD_BASE_URL`: defaults to `https://kieai.redpandaai.co`.
- `FAL_QUEUE_BASE_URL`: defaults to `https://queue.fal.run`.
- `FAL_STORAGE_BASE_URL`: defaults to `https://rest.fal.ai`.

Generation is owner-only by default and spends from the configured provider balance. Keep that gate enabled until a credit wallet, quotas, rate limits and abuse controls are in production. Generated media is temporary upstream; copy completed customer assets to durable SHAZAN storage.
