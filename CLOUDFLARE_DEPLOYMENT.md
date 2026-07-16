# Cloudflare deployment

This repository is configured for the existing `ai-studio-1n1` Cloudflare Pages project through Vinext static export.

## Connect the repository

1. Open Cloudflare Dashboard → Workers & Pages → `ai-studio-1n1`.
2. Open **Settings → Builds & deployments**.
3. Select production branch `main`.
4. Set the build command to `npm run build`.
5. Set the build output directory to `dist/client`.
6. Use Node.js 22 and save the configuration.
7. Retry the latest deployment.

## Secrets

Add these under **Settings → Variables and Secrets** after the server-side Pages Function is connected:

- `HIGGSFIELD_API_KEY` as an encrypted secret.
- `HIGGSFIELD_API_BASE_URL` as an optional text variable.

Never commit real API keys to GitHub and never prefix a secret with `NEXT_PUBLIC_`.
