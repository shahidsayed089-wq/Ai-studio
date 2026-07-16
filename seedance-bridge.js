(() => {
  const nativeFetch = window.fetch.bind(window);
  const STORE = 'yagnaSeedanceJobsV1';
  const SEEDANCE_MODELS = [
    { id: 'seedance-2-0', name: 'Seedance 2.0 Standard', kind: 'video', toolName: 'seedance-direct', source: 'cloudflare-direct', autoModel: false },
    { id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast', kind: 'video', toolName: 'seedance-direct', source: 'cloudflare-direct', autoModel: false },
    { id: 'seedance-2-0-mini', name: 'Seedance 2.0 Mini', kind: 'video', toolName: 'seedance-direct', source: 'cloudflare-direct', autoModel: false },
  ];

  function responseJson(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
    });
  }

  function requestUrl(input) {
    if (typeof input === 'string') return new URL(input, location.origin);
    if (input instanceof URL) return new URL(input.toString(), location.origin);
    return new URL(input.url, location.origin);
  }

  function readJobs() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeJobs(jobs) {
    try { localStorage.setItem(STORE, JSON.stringify(jobs.slice(0, 50))); } catch {}
  }

  function upsertJob(job) {
    const jobs = [job, ...readJobs().filter(item => item.id !== job.id)];
    writeJobs(jobs);
    return job;
  }

  function seedanceJob(generation, prompt = '') {
    return {
      id: generation.id,
      kind: 'video',
      provider: 'seedance2.ai',
      model: generation.model || 'seedance-2-0',
      prompt,
      status: generation.status === 'queued' ? 'submitted' : generation.status || 'submitted',
      outputUrl: generation.videoUrl || null,
      errorMessage: generation.failureReason || null,
      createdAt: generation.createdAt || new Date().toISOString(),
      credits: generation.credits ?? null,
    };
  }

  function betaCode() {
    return document.getElementById('seedanceBetaCode')?.value.trim()
      || localStorage.getItem('aiStudioBetaCode')
      || '';
  }

  async function seedanceReady() {
    try {
      const response = await nativeFetch('/api/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      return Boolean(data.checks?.seedance2Api);
    } catch {
      return false;
    }
  }

  async function catalogResponse(input, init) {
    let real = null;
    try {
      const response = await nativeFetch(input, init);
      const data = await response.clone().json().catch(() => null);
      if (response.ok && data) real = data;
    } catch {}

    const ready = await seedanceReady();
    if (!ready && real) return responseJson(real);
    if (!ready) return responseJson({ error: 'provider_not_configured', message: 'No live generation provider is configured.' }, 503);

    const realModels = Array.isArray(real?.models) ? real.models : [];
    const seen = new Set();
    const models = [...SEEDANCE_MODELS, ...realModels].filter(model => {
      const key = `${model.kind}:${model.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return responseJson({
      ok: true,
      connected: true,
      protocolVersion: real?.protocolVersion || 'seedance-direct-v1',
      serverInfo: real?.serverInfo || { name: 'Cloudflare Seedance Bridge' },
      totalMcpTools: Number(real?.totalMcpTools || 0),
      generationToolCount: Number(real?.generationToolCount || 0) + 1,
      videoAvailable: true,
      imageAvailable: Boolean(real?.imageAvailable),
      models,
      apps: Array.isArray(real?.apps) ? real.apps : [],
      tools: Array.isArray(real?.tools) ? real.tools : [],
      directProviders: ['seedance2.ai'],
    });
  }

  async function generationResponse(input, init = {}) {
    let body = {};
    try { body = JSON.parse(init.body || '{}'); } catch {}
    if (!String(body.model || '').startsWith('seedance-2-0')) return nativeFetch(input, init);

    let resolution = String(body.resolution || '720p').toLowerCase();
    if (resolution === '2k') resolution = '1080p';
    if (body.model !== 'seedance-2-0' && !['480p', '720p'].includes(resolution)) resolution = '720p';

    const headers = { 'content-type': 'application/json' };
    const code = betaCode();
    if (code) headers['x-beta-code'] = code;

    const response = await nativeFetch('/api/seedance/generations', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        model: body.model,
        prompt: body.prompt,
        aspectRatio: body.aspectRatio || '9:16',
        duration: Number(body.duration || 5),
        resolution,
        generateAudio: body.generateAudio !== false,
        seed: Number.isInteger(body.seed) ? body.seed : undefined,
        imageUrls: Array.isArray(body.referenceUrls) ? body.referenceUrls : [],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return responseJson(data, response.status);
    const job = upsertJob(seedanceJob(data.generation, body.prompt));
    return responseJson({ ok: true, job, wallet: data.wallet || null, note: 'Real Seedance render submitted through Cloudflare.' }, 202);
  }

  async function historyResponse(input, init) {
    let realJobs = [];
    try {
      const response = await nativeFetch(input, init);
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.jobs)) realJobs = data.jobs;
    } catch {}
    const localJobs = readJobs();
    const jobs = [...localJobs, ...realJobs.filter(real => !localJobs.some(local => local.id === real.id))];
    return responseJson({ ok: true, jobs });
  }

  async function jobResponse(url, input, init) {
    const id = decodeURIComponent(url.pathname.split('/').pop() || '');
    const existing = readJobs().find(job => job.id === id);
    if (!existing || existing.provider !== 'seedance2.ai') return nativeFetch(input, init);

    const headers = {};
    const code = betaCode();
    if (code) headers['x-beta-code'] = code;
    const response = await nativeFetch(`/api/seedance/tasks/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return responseJson(data, response.status);
    const job = upsertJob(seedanceJob(data.generation, existing.prompt));
    return responseJson({ ok: true, job, wallet: data.wallet || null });
  }

  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    if (url.origin !== location.origin) return nativeFetch(input, init);
    if (url.pathname === '/api/higgsfield/catalog') return catalogResponse(input, init);
    if (url.pathname === '/api/higgsfield/generate' && String(init.method || 'GET').toUpperCase() === 'POST') return generationResponse(input, init);
    if (url.pathname === '/api/higgsfield/history') return historyResponse(input, init);
    if (url.pathname.startsWith('/api/higgsfield/job/')) return jobResponse(url, input, init);
    return nativeFetch(input, init);
  };

  window.addEventListener('DOMContentLoaded', () => {
    const account = document.querySelector('.account');
    if (account && !document.getElementById('walletChip')) {
      const wallet = document.createElement('a');
      wallet.id = 'walletChip';
      wallet.href = '/owner.html';
      wallet.textContent = 'Credits…';
      wallet.style.cssText = 'display:inline-flex;align-items:center;height:34px;padding:0 10px;border:1px solid rgba(242,198,109,.28);border-radius:999px;color:#f2c66d;text-decoration:none;font-size:11px;font-weight:800;background:rgba(242,198,109,.06)';
      account.prepend(wallet);
      nativeFetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store' })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          wallet.textContent = ok ? `${Number(data.wallet?.balance || 0).toLocaleString()} credits` : 'Wallet';
          wallet.title = ok ? 'Open owner wallet' : (data.message || 'Wallet unavailable');
        })
        .catch(() => { wallet.textContent = 'Wallet'; });
    }

    const reference = document.querySelector('.reference-card');
    if (reference && !document.getElementById('seedanceBetaCode')) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:10px';
      wrap.innerHTML = '<label for="seedanceBetaCode" style="display:block;font-size:10px;color:#8f8276;margin-bottom:6px">Private launch code, only when enabled</label><input id="seedanceBetaCode" type="password" autocomplete="off" placeholder="Optional" style="width:100%;height:38px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#0c0a08;color:#fff;padding:0 10px">';
      reference.appendChild(wrap);
      const field = wrap.querySelector('input');
      field.value = localStorage.getItem('aiStudioBetaCode') || '';
      field.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', field.value.trim()));
    }
  });
})();