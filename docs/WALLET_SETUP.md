# AI Studio Wallet Setup

The wallet uses transparent units:

> 1 AI Studio credit = 1 upstream provider credit.

There is no hidden credit conversion.

## Cloudflare bindings

Create a D1 database named `ai-studio-wallet` and bind it to the Pages project as:

```text
DB
```

Keep the existing R2 bucket binding for multimodal uploads:

```text
MEDIA -> ai-studio-media
```

The wallet schema and triggers are created automatically on the first wallet request. A manual migration is not required.

## Cloudflare secrets

Add these encrypted Production secrets:

```text
SESSION_SIGNING_KEY=<random secret, at least 24 characters>
ADMIN_WALLET_KEY=<different random secret, at least 24 characters>
SEEDANCE2_API_KEY=<provider key>
```

`SESSION_SIGNING_KEY` signs the HttpOnly wallet session cookie. `ADMIN_WALLET_KEY` protects the owner-only top-up API. Never place either value in GitHub or browser code.

## Verify readiness

Open:

```text
https://YOUR-DOMAIN/api/health
```

Expected checks:

```json
{
  "database": true,
  "walletSessionSigning": true,
  "walletAdminKey": true,
  "walletReady": true
}
```

Then open:

```text
https://YOUR-DOMAIN/api/wallet
```

The response creates a signed wallet session and returns its `userId`, available balance, reserved balance and ledger.

## Owner top-up

Copy the wallet `userId` from the wallet panel, then call:

```bash
curl -X POST "https://YOUR-DOMAIN/api/admin/wallet/topup" \
  -H "content-type: application/json" \
  -H "x-admin-wallet-key: YOUR_ADMIN_WALLET_KEY" \
  --data '{"userId":"anon:WALLET-ID","amount":1000,"note":"Private beta grant"}'
```

The admin key is sent only to the protected server endpoint and is never stored by the public wallet UI.

## Accounting lifecycle

1. The server calculates the authoritative Seedance quote.
2. The wallet reserves the full amount before contacting the provider.
3. A provider rejection or network submission failure refunds the reservation.
4. A successful job remains reserved while processing.
5. Completion captures the charge.
6. Provider failure refunds it automatically.
7. Every movement is written to `wallet_transactions`.

## Important business rule

Funding an AI Studio wallet does not fund the upstream Seedance account. The platform owner must maintain enough provider credits separately. The wallet controls what users may spend and provides an auditable customer ledger.

Paid checkout and payment webhooks are intentionally separate from this accounting core. Do not accept public payments until a verified payment integration credits wallets only after a signed webhook succeeds.
