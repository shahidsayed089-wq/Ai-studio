# SHAZAN AI Studio

Premium multi-model generative AI studio built with Next.js static export and Cloudflare Pages Advanced Mode.

The public product and UI remain SHAZAN AI. A server-side Cloudflare Worker routes paid requests without exposing provider tokens or sending users to an external provider login.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets. `.dev.vars` is ignored by Git.

## Quality checks

```bash
npm run lint
npm run build
```

## Deploy to Cloudflare Pages

The production build generates the static website in `out`. Next.js also copies `public/_worker.js` to `out/_worker.js`; Cloudflare Pages runs it in Advanced Mode for the private `/api/studio/*` bridge.

For the existing `ai-studio-1n1` project:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `out`
- Node version: `22`

Add encrypted secrets under **Workers & Pages → ai-studio-1n1 → Settings → Variables and Secrets** for Production and Preview:

- `FAL_KEY` — primary private token for fal.ai queue and file storage
- `STUDIO_ACCESS_CODE` — temporary owner gate until user wallets are ready
- `KIE_API_KEY` — optional fallback for models that are only connected through Kie

Never commit API keys, paste them into client code, or expose them through `NEXT_PUBLIC_` variables.

## Connected models

The bridge currently has verified fal.ai request mappings for:

- GPT Image 2, Nano Banana 2 / Pro, Grok Imagine Image and FLUX 2 Pro
- Seedance 2.0 Standard / Fast, with text, image and reference workflows selected from actual inputs
- Gemini Omni Flash — text-to-video or image-reference-to-video
- Grok Imagine Video 1.5 — exact image-to-video endpoint
- Kling 3.0 Pro and Kling 3.0 Omni 4K
- Veo 3.1 and HappyHorse 1.1

Kie remains an optional fallback for Seedance 2.0 Mini and Kling 3.0 Elements.

Unconnected music, voice and avatar modes show a pending message instead of pretending that a render completed.

## Public-launch safety

Paid generation is owner-gated by default. Do not set `STUDIO_ALLOW_PUBLIC=true` until SHAZAN authentication, a per-user credit wallet, quotas and abuse controls are live.
