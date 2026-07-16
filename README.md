# Shazan AI Studio

A mobile-first AI video and image creation console deployed on Cloudflare Pages.

## Launch architecture

- Static creator dashboard served from `index.html`
- Cloudflare Pages Functions under `functions/api`
- Secure Higgsfield OAuth with encrypted server-side token storage
- Higgsfield MCP model discovery and generation tool invocation
- Cloudflare D1 generation history
- Bring-your-own Higgsfield credits during public beta

## Required Cloudflare bindings

- D1 database binding named `DB`
- Secret `SESSION_SIGNING_KEY` with at least 24 random characters

The connected Higgsfield OAuth client is dynamically registered. Do not commit secrets or access tokens.

## Beta launch checks

1. Open `/api/higgsfield/launch-health`
2. Confirm `database`, `connected`, `video`, and `image`
3. Submit one low-cost image test
4. Submit one 5-second 720p video test
5. Confirm the result appears in Gallery

## Safety

The beta uses each creator's own Higgsfield account and provider balance. Payments and shared platform credits should remain disabled until billing reconciliation, authentication and abuse controls are fully tested.
