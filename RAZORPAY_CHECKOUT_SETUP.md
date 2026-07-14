# AI Studio Credit Pricing and Razorpay Checkout

## Launch credit packs

| Package | Credits | Price |
|---|---:|---:|
| Starter | 200 | ₹349 |
| Creator | 600 | ₹899 |
| Pro | 2,000 | ₹2,599 |
| Studio | 6,000 | ₹6,999 |

The customer receives exactly the displayed number of credits.

> 1 AI Studio credit = 1 Seedance2.ai API credit.

Package pricing is controlled server-side in `functions/_lib/credit-packages.js`. The browser cannot change package amounts or credit quantities.

## Required Cloudflare Production secrets

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

The wallet also requires:

```text
SESSION_SIGNING_KEY
ADMIN_WALLET_KEY
SEEDANCE2_API_KEY
```

Required bindings:

```text
DB    -> ai-studio-wallet D1 database
MEDIA -> ai-studio-media R2 bucket
```

## Razorpay webhook

Configure this public endpoint in the Razorpay Dashboard:

```text
https://YOUR-DOMAIN/api/payments/razorpay/webhook
```

Subscribe to:

```text
payment.captured
```

Use the same webhook secret in the Razorpay Dashboard and the Cloudflare encrypted secret named `RAZORPAY_WEBHOOK_SECRET`.

The wallet is credited only after the webhook signature passes HMAC-SHA256 validation and the paid amount, currency and Razorpay order match the server-side purchase record.

## Testing

1. Use Razorpay Test Mode keys first.
2. Open the wallet and select **Buy Credits**.
3. Complete a test payment.
4. Confirm the wallet ledger shows a single `topup` transaction.
5. Retry the same webhook and confirm the wallet is not credited twice.
6. Replace Test Mode keys with Live Mode keys only after verification.

## Important launch note

The displayed INR amounts are the exact checkout order amounts. Configure merchant GST, invoicing, refund terms, privacy policy and terms of sale before accepting live public payments.
