# SHAZAN AI Studio

Premium multi-model generative AI studio built with Next.js, Vinext and Cloudflare Workers.

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

## Deploy to Cloudflare Workers

The production build generates a Worker configuration at `dist/server/wrangler.json`.

```bash
npm run deploy
```

For Cloudflare Workers Builds connected to this repository:

- Production branch: `main`
- Build command: `npm ci`
- Deploy command: `npm run deploy`
- Node version: `22`

Add these under **Workers & Pages → Settings → Variables and Secrets**:

- `HIGGSFIELD_API_KEY` — encrypted secret
- `HIGGSFIELD_API_BASE_URL` — optional text variable

Never commit API keys to GitHub or expose them through `NEXT_PUBLIC_` variables.

## Current status

The cinematic UI, model catalogue, multimodal limits and credit calculator are implemented. Provider generation endpoints will be connected server-side after the Higgsfield API key and exact model catalogue are available.
