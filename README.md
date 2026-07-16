# SHAZAN AI Studio

Premium multi-model generative AI studio built with Next.js static export and Cloudflare Pages.

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

The production build generates the static website, including `index.html`, in `out`.
The checked-in `wrangler.jsonc` pins that output directory to the `ai-studio-1n1` Pages project.

```bash
npm run deploy
```

For the `ai-studio-1n1` Cloudflare Pages project connected to this repository:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `out`
- Node version: `22`

Add these under **Workers & Pages → ai-studio-1n1 → Settings → Variables and Secrets** when the server-side Pages Function is connected:

- `HIGGSFIELD_API_KEY` — encrypted secret
- `HIGGSFIELD_API_BASE_URL` — optional text variable

Never commit API keys to GitHub or expose them through `NEXT_PUBLIC_` variables.

## Current status

The cinematic UI, model catalogue, multimodal limits and credit calculator are implemented. Provider generation endpoints will be connected through a server-side Pages Function after the Higgsfield API key and exact model catalogue are available.
