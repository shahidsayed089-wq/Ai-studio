(() => {
  let pricing = null;
  let checkoutScriptPromise = null;

  const style = document.createElement('style');
  style.textContent = `
    .ai-buy-credits{display:block;width:calc(100% - 28px);margin:0 14px 14px;height:44px;border:1px solid rgba(87,247,237,.34);border-radius:10px;background:linear-gradient(135deg,#123333,#0d2425);color:#eafffb;font:900 11px/1 system-ui;letter-spacing:.06em}
    .ai-pricing-backdrop{position:fixed;inset:0;z-index:160;display:none;background:rgba(0,0,0,.75);backdrop-filter:blur(4px)}.ai-pricing-backdrop.show{display:block}
    .ai-pricing-modal{position:fixed;z-index:161;inset:5vh max(12px,calc((100vw - 880px)/2));max-height:90vh;overflow:auto;display:none;border:1px solid rgba(87,247,237,.26);border-radius:18px;background:#080c0d;color:#effcf9;box-shadow:0 30px 100px rgba(0,0,0,.72);font-family:system-ui}.ai-pricing-modal.show{display:block}
    .ai-pricing-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;padding:18px;background:rgba(8,12,13,.96);border-bottom:1px solid rgba(255,255,255,.08)}.ai-pricing-head h2{margin:0;font-size:20px}.ai-pricing-head p{margin:5px 0 0;color:#81938f;font-size:10px}.ai-pricing-close{width:34px;height:34px;border:0;border-radius:50%;background:#151b1c;color:#fff;font-size:20px}
    .ai-pricing-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:16px}.ai-price-card{position:relative;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0d1213;padding:16px}.ai-price-card.popular{border-color:rgba(87,247,237,.65);box-shadow:0 0 25px rgba(87,247,237,.09)}.ai-price-popular{position:absolute;right:10px;top:10px;padding:4px 7px;border-radius:99px;background:#57f7ed;color:#041311;font-size:8px;font-weight:900}.ai-price-card h3{margin:0;font-size:15px}.ai-price-credits{margin-top:13px;font-size:25px;font-weight:950;color:#57f7ed}.ai-price-credits small{font-size:9px;color:#81938f}.ai-price-rupees{margin-top:4px;font-size:19px;font-weight:900}.ai-price-unit{margin-top:3px;color:#71817e;font-size:8px}.ai-price-desc{min-height:50px;margin:12px 0;color:#9baca8;font-size:9px;line-height:1.5}.ai-price-buy{width:100%;height:39px;border:0;border-radius:9px;background:#57f7ed;color:#031311;font-size:10px;font-weight:950}.ai-price-buy:disabled{background:#202829;color:#71817e}.ai-pricing-status{margin:0 16px 16px;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0c1112;color:#91a39f;font-size:10px;line-height:1.5}.ai-pricing-status.error{color:#ff9a9f;border-color:rgba(255,98,110,.25)}.ai-pricing-status.good{color:#72f4b4;border-color:rgba(114,244,180,.25)}
    @media(max-width:760px){.ai-pricing-modal{inset:12px}.ai-pricing-grid{grid-template-columns:1fr 1fr}.ai-price-desc{min-height:42px}}
    @media(max-width:440px){.ai-pricing-grid{grid-template-columns:1fr}.ai-price-desc{min-height:0}}
  `;
  document.head.appendChild(style);

  const walletModal = document.querySelector('.ai-wallet-modal');
  if (!walletModal) return;

  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'ai-buy-credits';
  buyButton.textContent = '＋ BUY CREDITS';
  const walletId = walletModal.querySelector('.ai-wallet-id');
  walletId?.insertAdjacentElement('afterend', buyButton);

  const backdrop = document.createElement('div');
  backdrop.className = 'ai-pricing-backdrop';
  const modal = document.createElement('section');
  modal.className = 'ai-pricing-modal';
  modal.innerHTML = `
    <div class="ai-pricing-head"><div><h2>Buy AI Studio Credits</h2><p>Exact credits, transparent INR pricing, verified payment webhook.</p></div><button class="ai-pricing-close" type="button">×</button></div>
    <div class="ai-pricing-grid" id="aiPricingGrid"></div>
    <div class="ai-pricing-status" id="aiPricingStatus">Loading secure checkout status…</div>
  `;
  document.body.append(backdrop, modal);

  const grid = modal.querySelector('#aiPricingGrid');
  const status = modal.querySelector('#aiPricingStatus');

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `ai-pricing-status ${kind}`.trim();
  }
  function open() {
    backdrop.classList.add('show');
    modal.classList.add('show');
    loadPricing();
  }
  function close() {
    backdrop.classList.remove('show');
    modal.classList.remove('show');
  }
  buyButton.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  modal.querySelector('.ai-pricing-close').addEventListener('click', close);

  function loadCheckoutScript() {
    if (window.Razorpay) return Promise.resolve();
    if (checkoutScriptPromise) return checkoutScriptPromise;
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
      document.head.appendChild(script);
    });
    return checkoutScriptPromise;
  }

  async function currentBalance() {
    const response = await fetch('/api/wallet', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    return Number(payload?.wallet?.balance || 0);
  }

  async function waitForWebhook(previousBalance) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const balance = await currentBalance().catch(() => previousBalance);
      window.AIStudioWallet?.refresh?.();
      if (balance > previousBalance) {
        setStatus(`Payment verified. Wallet credited to ${balance.toLocaleString()} credits.`, 'good');
        return;
      }
    }
    setStatus('Payment received. Webhook verification is still processing; the wallet will update automatically.', 'good');
  }

  async function buy(packageId, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'CREATING ORDER…';
    try {
      const previousBalance = await currentBalance();
      const response = await fetch('/api/payments/razorpay/order', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not create checkout order.');
      await loadCheckoutScript();

      const checkout = payload.checkout;
      const instance = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: 'AI Studio',
        description: `${checkout.package.credits} AI Studio credits`,
        order_id: checkout.orderId,
        theme: { color: '#08f0e3' },
        handler: () => {
          setStatus('Payment completed. Waiting for signed webhook verification…');
          waitForWebhook(previousBalance);
        },
        modal: {
          ondismiss: () => setStatus('Checkout closed. No wallet credits were changed.'),
        },
      });
      instance.on('payment.failed', responseData => {
        setStatus(responseData?.error?.description || 'Payment failed. No wallet credits were added.', 'error');
      });
      instance.open();
      setStatus('Secure Razorpay Checkout opened. Credits are added only after verified capture.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Checkout failed safely.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function render() {
    grid.innerHTML = '';
    for (const pack of pricing.packages || []) {
      const card = document.createElement('article');
      card.className = `ai-price-card ${pack.popular ? 'popular' : ''}`.trim();
      card.innerHTML = `
        ${pack.popular ? '<span class="ai-price-popular">POPULAR</span>' : ''}
        <h3>${pack.name}</h3>
        <div class="ai-price-credits">${Number(pack.credits).toLocaleString()} <small>CREDITS</small></div>
        <div class="ai-price-rupees">₹${Number(pack.priceRupees).toLocaleString('en-IN')}</div>
        <div class="ai-price-unit">₹${Number(pack.pricePerCredit).toFixed(2)} per credit</div>
        <p class="ai-price-desc">${pack.description}</p>
        <button class="ai-price-buy" type="button">BUY ₹${Number(pack.priceRupees).toLocaleString('en-IN')}</button>
      `;
      const button = card.querySelector('button');
      button.disabled = !pricing.checkout?.ready;
      button.addEventListener('click', () => buy(pack.id, button));
      grid.appendChild(card);
    }

    if (pricing.checkout?.ready) {
      setStatus(`${pricing.checkout.mode === 'test' ? 'TEST MODE' : 'LIVE MODE'} checkout ready. Taxes, if applicable, are shown at checkout.`, pricing.checkout.mode === 'test' ? '' : 'good');
    } else {
      setStatus('Pricing is live, but purchases remain disabled until Razorpay keys and webhook secret are configured.', 'error');
    }
  }

  async function loadPricing() {
    if (pricing) return render();
    try {
      const response = await fetch('/api/pricing', { cache: 'no-store' });
      pricing = await response.json();
      if (!response.ok) throw new Error(pricing.message || 'Pricing unavailable.');
      render();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Pricing unavailable.', 'error');
    }
  }
})();
