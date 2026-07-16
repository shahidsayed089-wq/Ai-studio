(() => {
  const nativeFetch = window.fetch.bind(window);
  const ownerMode = new URLSearchParams(window.location.search).get('owner') === '1';
  let walletState = null;
  let ledgerState = [];

  const style = document.createElement('style');
  style.textContent = `
    .ai-wallet-pill{position:fixed;right:16px;top:72px;z-index:85;display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid rgba(8,240,227,.3);border-radius:999px;background:rgba(7,11,12,.92);backdrop-filter:blur(16px);box-shadow:0 10px 32px rgba(0,0,0,.38);color:#eafffb;font:700 11px/1.2 system-ui;cursor:pointer}
    .ai-wallet-pill b{color:#57f7ed;font-size:13px}.ai-wallet-pill small{display:block;color:#81928f;font-size:8px;font-weight:600;margin-top:2px}.ai-wallet-dot{width:8px;height:8px;border-radius:50%;background:#57f7ed;box-shadow:0 0 12px rgba(87,247,237,.65)}
    .ai-wallet-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.68);display:none}.ai-wallet-backdrop.show{display:block}
    .ai-wallet-modal{position:fixed;z-index:121;right:18px;top:74px;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 92px);overflow:auto;display:none;border:1px solid rgba(8,240,227,.26);border-radius:16px;background:#090d0e;color:#eefbf9;box-shadow:0 24px 80px rgba(0,0,0,.62);font-family:system-ui}
    .ai-wallet-modal.show{display:block}.ai-wallet-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:17px;border-bottom:1px solid rgba(255,255,255,.08)}.ai-wallet-head h3{margin:0;font-size:17px}.ai-wallet-close{border:0;background:#151b1c;color:#fff;width:32px;height:32px;border-radius:50%;font-size:19px}
    .ai-wallet-balance{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px}.ai-wallet-stat{border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:13px;background:#0d1213}.ai-wallet-stat span{display:block;color:#81928f;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.ai-wallet-stat b{display:block;margin-top:5px;font-size:22px;color:#57f7ed}.ai-wallet-stat.reserved b{color:#ffdc86}
    .ai-wallet-truth{margin:0 14px 13px;padding:10px 11px;border:1px solid rgba(87,247,237,.16);border-radius:10px;background:rgba(87,247,237,.04);color:#a6bab6;font-size:10px;line-height:1.5}.ai-wallet-truth strong{color:#eafffb}
    .ai-wallet-id{display:flex;gap:8px;align-items:center;margin:0 14px 14px}.ai-wallet-id code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:9px;border-radius:8px;background:#050707;color:#839592;font-size:9px}.ai-wallet-id button{border:1px solid rgba(87,247,237,.24);border-radius:8px;background:#102021;color:#cffff8;padding:9px 11px;font-size:9px;font-weight:800}
    .ai-wallet-owner{display:none;margin:0 14px 14px;padding:13px;border:1px solid rgba(255,220,134,.25);border-radius:12px;background:rgba(255,220,134,.045)}.ai-wallet-owner.show{display:block}.ai-wallet-owner h4{margin:0 0 5px;font-size:12px;color:#ffdc86}.ai-wallet-owner p{margin:0 0 10px;color:#8e9d9a;font-size:9px;line-height:1.45}.ai-wallet-owner-grid{display:grid;grid-template-columns:1fr 110px;gap:8px}.ai-wallet-owner input{height:39px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#070a0b;color:#fff;padding:0 10px;font-size:11px;outline:none}.ai-wallet-owner button{grid-column:1/-1;height:40px;border:0;border-radius:8px;background:#ffdc86;color:#211600;font-size:10px;font-weight:950}.ai-wallet-owner button:disabled{opacity:.55}.ai-wallet-owner-status{margin-top:8px;color:#90a09d;font-size:9px;line-height:1.4}.ai-wallet-owner-status.good{color:#72f4b4}.ai-wallet-owner-status.error{color:#ff9a9f}
    .ai-wallet-ledger-title{padding:0 14px 9px;color:#dceae8;font-size:11px;font-weight:800}.ai-wallet-ledger{padding:0 14px 15px}.ai-wallet-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:11px 0;border-top:1px solid rgba(255,255,255,.07)}.ai-wallet-row:first-child{border-top:0}.ai-wallet-row b{font-size:11px}.ai-wallet-row small{display:block;color:#71817e;font-size:8px;margin-top:4px}.ai-wallet-amount{font-size:12px;font-weight:900}.ai-wallet-amount.positive{color:#72f4b4}.ai-wallet-amount.negative{color:#ff9a9f}.ai-wallet-empty{padding:18px 0;color:#71817e;font-size:10px;text-align:center}
    @media(max-width:620px){.ai-wallet-pill{top:auto;bottom:14px;right:12px}.ai-wallet-modal{top:auto;bottom:10px;right:12px;max-height:82vh}.ai-wallet-backdrop{backdrop-filter:blur(3px)}.ai-wallet-owner-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ai-wallet-pill';
  pill.innerHTML = '<span class="ai-wallet-dot"></span><span><b id="aiWalletBalance">…</b><small>AI STUDIO CREDITS</small></span>';

  const backdrop = document.createElement('div');
  backdrop.className = 'ai-wallet-backdrop';

  const modal = document.createElement('section');
  modal.className = 'ai-wallet-modal';
  modal.setAttribute('aria-label', 'AI Studio wallet');
  modal.innerHTML = `
    <div class="ai-wallet-head"><div><h3>AI Studio Wallet</h3><small style="color:#71817e">Real reserve, capture and refund ledger</small></div><button class="ai-wallet-close" type="button">×</button></div>
    <div class="ai-wallet-balance">
      <div class="ai-wallet-stat"><span>Available</span><b id="aiWalletAvailable">0</b></div>
      <div class="ai-wallet-stat reserved"><span>Reserved</span><b id="aiWalletReserved">0</b></div>
    </div>
    <p class="ai-wallet-truth"><strong>No conversion trick:</strong> 1 AI Studio credit equals 1 upstream provider credit. Credits reserve before a render, capture on success and return automatically on provider failure.</p>
    <div class="ai-wallet-id"><code id="aiWalletId">Loading wallet…</code><button id="aiWalletCopy" type="button">COPY ID</button></div>
    <div class="ai-wallet-owner" id="aiWalletOwner">
      <h4>OWNER TEST TOP-UP</h4>
      <p>For private testing only. Uses the encrypted ADMIN_WALLET_KEY configured in Cloudflare. The key is not stored in this browser.</p>
      <div class="ai-wallet-owner-grid">
        <input id="aiWalletAdminKey" type="password" autocomplete="off" placeholder="ADMIN_WALLET_KEY">
        <input id="aiWalletTopupAmount" type="number" inputmode="numeric" min="1" max="10000000" value="1000" aria-label="Credits">
        <button id="aiWalletTopup" type="button">ADD TEST CREDITS</button>
      </div>
      <div class="ai-wallet-owner-status" id="aiWalletOwnerStatus">Credits are added to this browser's wallet ID.</div>
    </div>
    <div class="ai-wallet-ledger-title">TRANSACTION LEDGER</div>
    <div class="ai-wallet-ledger" id="aiWalletLedger"><div class="ai-wallet-empty">Loading ledger…</div></div>
  `;

  document.body.append(pill, backdrop, modal);

  const balanceNode = pill.querySelector('#aiWalletBalance');
  const availableNode = modal.querySelector('#aiWalletAvailable');
  const reservedNode = modal.querySelector('#aiWalletReserved');
  const idNode = modal.querySelector('#aiWalletId');
  const ledgerNode = modal.querySelector('#aiWalletLedger');
  const ownerPanel = modal.querySelector('#aiWalletOwner');
  const ownerKey = modal.querySelector('#aiWalletAdminKey');
  const ownerAmount = modal.querySelector('#aiWalletTopupAmount');
  const ownerButton = modal.querySelector('#aiWalletTopup');
  const ownerStatus = modal.querySelector('#aiWalletOwnerStatus');

  function openWallet() {
    backdrop.classList.add('show');
    modal.classList.add('show');
    refreshWallet();
  }
  function closeWallet() {
    backdrop.classList.remove('show');
    modal.classList.remove('show');
  }
  pill.addEventListener('click', openWallet);
  backdrop.addEventListener('click', closeWallet);
  modal.querySelector('.ai-wallet-close').addEventListener('click', closeWallet);
  modal.querySelector('#aiWalletCopy').addEventListener('click', async () => {
    if (!walletState?.userId) return;
    await navigator.clipboard.writeText(walletState.userId).catch(() => {});
    modal.querySelector('#aiWalletCopy').textContent = 'COPIED';
    setTimeout(() => { modal.querySelector('#aiWalletCopy').textContent = 'COPY ID'; }, 1200);
  });

  function renderLedger() {
    ledgerNode.innerHTML = '';
    if (!ledgerState.length) {
      ledgerNode.innerHTML = '<div class="ai-wallet-empty">No transactions yet. Top-ups and generations will appear here.</div>';
      return;
    }
    ledgerState.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ai-wallet-row';
      const amount = Number(item.amount || 0);
      const label = {
        topup: 'Wallet top-up',
        reserve: 'Generation reserved',
        capture: 'Generation completed',
        refund: 'Generation refunded',
        adjustment: 'Provider cost adjustment',
      }[item.type] || item.type;
      row.innerHTML = `<div><b>${label}</b><small>${item.note || ''} · ${new Date(item.created_at).toLocaleString()}</small></div><div class="ai-wallet-amount ${amount > 0 ? 'positive' : amount < 0 ? 'negative' : ''}">${amount > 0 ? '+' : ''}${amount}</div>`;
      ledgerNode.appendChild(row);
    });
  }

  function applyWallet(wallet, ledger) {
    if (!wallet) return;
    walletState = { ...walletState, ...wallet };
    if (Array.isArray(ledger)) ledgerState = ledger;
    const balance = Number(walletState.balance ?? walletState.available ?? 0);
    const reserved = Number(walletState.reserved || 0);
    balanceNode.textContent = balance.toLocaleString();
    availableNode.textContent = balance.toLocaleString();
    reservedNode.textContent = reserved.toLocaleString();
    if (walletState.userId) idNode.textContent = walletState.userId;
    renderLedger();
  }

  async function refreshWallet() {
    try {
      const response = await nativeFetch('/api/wallet', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Wallet unavailable');
      applyWallet(payload.wallet, payload.ledger);
    } catch (error) {
      balanceNode.textContent = 'SETUP';
      idNode.textContent = error instanceof Error ? error.message : 'Wallet unavailable';
      ledgerNode.innerHTML = '<div class="ai-wallet-empty">Wallet needs DB and SESSION_SIGNING_KEY configuration.</div>';
    }
  }

  if (ownerMode) {
    ownerPanel.classList.add('show');
    ownerButton.addEventListener('click', async () => {
      const key = ownerKey.value.trim();
      const amount = Math.round(Number(ownerAmount.value));
      if (!walletState?.userId) {
        ownerStatus.textContent = 'Wallet ID is still loading.';
        ownerStatus.className = 'ai-wallet-owner-status error';
        return;
      }
      if (key.length < 24) {
        ownerStatus.textContent = 'Enter the ADMIN_WALLET_KEY configured in Cloudflare.';
        ownerStatus.className = 'ai-wallet-owner-status error';
        return;
      }
      if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) {
        ownerStatus.textContent = 'Credits must be between 1 and 10,000,000.';
        ownerStatus.className = 'ai-wallet-owner-status error';
        return;
      }

      ownerButton.disabled = true;
      ownerButton.textContent = 'ADDING…';
      ownerStatus.textContent = 'Authorizing owner top-up…';
      ownerStatus.className = 'ai-wallet-owner-status';
      try {
        const response = await nativeFetch('/api/admin/wallet/topup', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-admin-wallet-key': key,
          },
          body: JSON.stringify({
            userId: walletState.userId,
            amount,
            note: 'Owner test credit grant',
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Top-up failed safely.');
        applyWallet(payload.wallet, payload.ledger);
        ownerKey.value = '';
        ownerStatus.textContent = `${amount.toLocaleString()} test credits added. New balance: ${Number(payload.wallet?.balance || 0).toLocaleString()}.`;
        ownerStatus.className = 'ai-wallet-owner-status good';
      } catch (error) {
        ownerStatus.textContent = error instanceof Error ? error.message : 'Top-up failed safely.';
        ownerStatus.className = 'ai-wallet-owner-status error';
      } finally {
        ownerButton.disabled = false;
        ownerButton.textContent = 'ADD TEST CREDITS';
      }
    });
    setTimeout(openWallet, 350);
  }

  function readVideoReferenceSeconds() {
    const text = document.querySelector('.seedance-counters')?.textContent || '';
    const match = text.match(/video[^\d]*(?:\d+\s*\/\s*3)?[^\d]*([\d.]+)\s*s\s*\/\s*15\s*s/i);
    return match ? Math.min(15, Math.max(0, Number(match[1]) || 0)) : 0;
  }

  window.fetch = async function walletAwareFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    let nextInit = init;

    if (url.includes('/api/seedance/generations') && String(init.method || 'GET').toUpperCase() === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        body.videoReferenceSeconds = readVideoReferenceSeconds();
        nextInit = { ...init, body: JSON.stringify(body), credentials: 'same-origin' };
      } catch {
        nextInit = { ...init, credentials: 'same-origin' };
      }
    } else if (url.startsWith('/api/')) {
      nextInit = { ...init, credentials: 'same-origin' };
    }

    const response = await nativeFetch(input, nextInit);
    if (url.includes('/api/seedance/generations') || url.includes('/api/seedance/tasks/')) {
      response.clone().json().then(payload => {
        if (payload.wallet) applyWallet(payload.wallet);
        if (payload.error === 'insufficient_wallet_credits') openWallet();
      }).catch(() => {});
    }
    return response;
  };

  refreshWallet();
  window.AIStudioWallet = Object.freeze({ refresh: refreshWallet, open: openWallet });
})();