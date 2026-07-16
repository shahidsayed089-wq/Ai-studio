# Cloudflare deployment

This repository is configured for Cloudflare Workers through Vinext.

## Connect the repository

1. Open Cloudflare Dashboard → Workers & Pages.
2. Choose **Create** and import `shahidsayed089-wq/Ai-studio`.
3. Select production branch `main`.
4. Set the build command to `npm ci`.
5. Set the deploy command to `npm run deploy`.
6. Use Node.js 22.

## Secrets

Add these under **Settings → Variables and Secrets**:

- `HIGGSFIELD_API_KEY` as an encrypted secret.
- `HIGGSFIELD_API_BASE_URL` as an optional text variable.

Never commit real API keys to GitHub and never prefix a secret with `NEXT_PUBLIC_`.
