# Cloudflare deployment

The project deploys to the existing `ai-studio-1n1` Cloudflare Pages project as a Next.js static export with a private SHAZAN generation bridge.

## Build settings

1. Production branch: `main`
2. Build command: `npm run build`
3. Build output directory: `out`
4. Node.js: `22`

`public/_worker.js` is copied to `out/_worker.js` and runs through Cloudflare Pages Advanced Mode. It handles `/api/studio/*` and `/api/auth/*`; every other request is forwarded to static assets through `env.ASSETS`.

## D1 account database

Production bindings are committed in `wrangler.jsonc`, which is the source of truth for this Pages project:

- `DB` → D1 database `ai-studio-wallet`
- `MEDIA` → R2 bucket `ai-studio-media`

Cloudflare therefore shows these production binding controls as read-only in the dashboard. Change the repository config rather than creating a duplicate dashboard binding, then redeploy the latest `main` branch.

The Worker runs idempotent `CREATE TABLE IF NOT EXISTS` statements on first use. The same schema is committed at `migrations/0001_auth.sql` for controlled migrations and backups.

## Required encrypted secrets

Open **Workers & Pages → ai-studio-1n1 → Settings → Variables and Secrets** and add these to both Production and Preview:

- `FAL_KEY`: primary private fal.ai API token.
- `OPENAI_API_KEY`: private OpenAI token used by GPT Voice.
- `STUDIO_ACCESS_CODE`: a long temporary owner-only generation code.
- `KIE_API_KEY`: optional Kie fallback token for Seedance Mini and Kling Elements.
- `AUTH_PEPPER`: a stable random secret of at least 32 characters for password hashing.

Set every token and access code to **Secret**, not plain text. Never add tokens to GitHub, browser code, screenshots or chat.

## Routes

- `POST /api/auth/register` — creates a D1 user and secure session.
- `POST /api/auth/login` — verifies credentials with rate limiting.
- `GET /api/auth/session` — restores a valid session.
- `POST /api/auth/logout` — revokes the session.

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
- `lyria_3` → `fal-ai/lyria3`
- `audioflow_elevenlabs` → `fal-ai/elevenlabs/music`
- `score_composer_cassetteai` → `CassetteAI/music-generator`
- `elevenlabs_voice` → `fal-ai/elevenlabs/tts/eleven-v3`
- `voice_forge` → `fal-ai/elevenlabs/text-to-voice/design/eleven-v3`
- `multilingual_pro` → `fal-ai/elevenlabs/tts/multilingual-v2`
- `heygen_avatar_iv` → `fal-ai/heygen/avatar4/image-to-video`
- `avatar_one` → `fal-ai/kling-video/ai-avatar/v2/standard`
- `digital_twin` → `fal-ai/bytedance/omnihuman`
- `performance_capture` → `fal-ai/wan-motion`

OpenAI voice route:

- `gpt_voice` → OpenAI `/v1/audio/speech` with `gpt-4o-mini-tts`; the MP3 is copied to private fal storage for preview.

Kie fallbacks:

- `seedance_2_0_mini` → `bytedance/seedance-2-mini`
- `kling_3_0_elements` → `kling-3.0/video` with one prompt-addressable video element
- `suno` → Kie Suno `/api/v1/generate` and `/api/v1/generate/record-info`

No per-model endpoint environment variables are required.

## Optional variables

- `KIE_API_BASE_URL`: defaults to `https://api.kie.ai`.
- `KIE_UPLOAD_BASE_URL`: defaults to `https://kieai.redpandaai.co`.
- `FAL_QUEUE_BASE_URL`: defaults to `https://queue.fal.run`.
- `FAL_STORAGE_BASE_URL`: defaults to `https://rest.fal.ai`.
- `OPENAI_API_BASE_URL`: defaults to `https://api.openai.com`.

Generation is owner-only by default and spends from the configured provider balance. Keep that gate enabled until a credit wallet, quotas, rate limits and abuse controls are in production. Generated media is temporary upstream; copy completed customer assets to durable SHAZAN storage.
