# SHAZAN AI Studio

Premium multi-model generative AI studio built with Next.js static export and Cloudflare Pages Advanced Mode.

The public product and UI remain SHAZAN AI. A server-side model gateway handles paid requests without exposing its API token or sending users to an external provider login.

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

- `KIE_API_KEY` — the private model-gateway token
- `STUDIO_ACCESS_CODE` — an owner-only beta code

Never commit API keys, paste them into client code, or expose them through `NEXT_PUBLIC_` variables.

## Connected video models

The bridge currently has verified request mappings for:

- Seedance 2.0 Standard — `bytedance/seedance-2`
- Seedance 2.0 Fast — `bytedance/seedance-2-fast`
- Seedance 2.0 Mini — `bytedance/seedance-2-mini`
- Kling 3.0 / Kling 3.0 Elements — `kling-3.0/video`
- HappyHorse 1.1 — text, image, or reference-to-video selected from the attached inputs

Other catalogue cards remain visible for product design, but the Worker returns an honest “not connected” response instead of pretending to submit an unsupported model.

## Public-launch safety

Paid generation is owner-only by default. Do not set `STUDIO_ALLOW_PUBLIC=true` until SHAZAN user authentication, a credit wallet, per-user quotas, rate limiting and abuse controls are connected.
