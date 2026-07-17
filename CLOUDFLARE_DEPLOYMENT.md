# Cloudflare deployment

The project deploys to the existing `ai-studio-1n1` Cloudflare Pages project as a Next.js static export with a secure Higgsfield bridge.

## Build settings

1. Production branch: `main`
2. Build command: `npm run build`
3. Build output directory: `out`
4. Node.js: 22

The server bridge is located at `public/_worker.js`. Next copies it to `out/_worker.js`, which Cloudflare Pages deploys in Advanced Mode. The Worker handles only `/api/higgsfield/*`; every other request is forwarded to the static site through `env.ASSETS`.

## Required encrypted secrets

Add these in **Workers & Pages → ai-studio-1n1 → Settings → Variables and Secrets** for both Production and Preview:

- `HIGGSFIELD_API_ID`: Higgsfield `KEY_ID` / API ID.
- `HIGGSFIELD_API_KEY`: Higgsfield `KEY_SECRET` / API secret.
- `STUDIO_ACCESS_CODE`: a long private code entered in the generator before a paid render.

The bridge also accepts Higgsfield's official `HF_API_KEY` + `HF_API_SECRET` or combined `HF_CREDENTIALS=KEY_ID:KEY_SECRET` naming.

## Model IDs

Higgsfield's key/secret REST API submits to `https://platform.higgsfield.ai/{model_id}`. Configure only the exact model IDs enabled in your Higgsfield API dashboard:

- `HIGGSFIELD_SEEDANCE_2_STANDARD_ENDPOINT`
- `HIGGSFIELD_SEEDANCE_2_FAST_ENDPOINT`
- `HIGGSFIELD_SEEDANCE_2_MINI_ENDPOINT`
- `HIGGSFIELD_KLING_3_OMNI_ENDPOINT`
- `HIGGSFIELD_KLING_3_ENDPOINT`
- `HIGGSFIELD_RUNWAY_GEN_4_5_ENDPOINT`

Alternatively, use one text variable:

```text
HIGGSFIELD_MODEL_ENDPOINTS={"seedance_2_0_standard":"provider/model/path","kling_3_0":"provider/model/path"}
```

Do not guess model IDs. Higgsfield's modern Cloud/CLI catalog and its public key/secret REST catalog are separate surfaces and do not always expose the same models.

## Optional variables

- `HIGGSFIELD_API_BASE_URL`: defaults to `https://platform.higgsfield.ai`.
- `HIGGSFIELD_ALLOW_PUBLIC=true`: removes the owner-code check. Do not enable this until user authentication, billing, and rate limits exist.

Never commit real credentials and never prefix secrets with `NEXT_PUBLIC_`.
