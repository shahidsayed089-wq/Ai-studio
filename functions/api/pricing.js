import { publicCreditPackages } from '../_lib/credit-packages.js';

export async function onRequestGet({ env }) {
  const checkoutReady = Boolean(
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_WEBHOOK_SECRET &&
    env.DB &&
    env.SESSION_SIGNING_KEY,
  );

  return Response.json({
    currency: 'INR',
    packages: publicCreditPackages(),
    checkout: {
      provider: 'razorpay',
      ready: checkoutReady,
      mode: String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'test' : checkoutReady ? 'live' : 'not-configured',
    },
    disclosure: 'Credit prices are AI Studio retail prices. Generation usage is charged in Seedance2.ai API credits on a 1:1 basis.',
    taxNote: 'Taxes, if applicable, are handled at checkout and on the issued invoice.',
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
