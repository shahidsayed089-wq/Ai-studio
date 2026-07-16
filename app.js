(() => {
  const state = {
    view: 'studio', kind: 'video', model: 'seedance-2.0', models: [], tools: [], jobs: [], filter: 'all', connected: false,
  };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const modelCopy = {
    'seedance-2.0': 'Identity and cinematic motion', 'seedance-2.0-mini': 'Faster creator preview',
    'kling-3.0': 'Multi-shot, audio and motion', 'kling-3.0-turbo': 'Fast single-shot animation',
    hailuo: 'Expressive cinematic movement', 'gpt-image-2': 'Precise image generation',
    'nano-banana': 'Fast visual ideation', seedream: 'Stylized image creation', 'soul-2.0': 'Character-focused images',
  };
  let toastTimer;
  let pollTimer;

  function toast(message, error = false) {
    const node = $('#toast');
    node.textContent = message;
    node.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 3600);
  }

  async function api(url, init = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `Request failed (${response.status})`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setView(view) {
    state.view = view;
    $$('.view').forEach(node => node.classList.toggle('active', node.id === `view-${view}`));
    $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'gallery') renderGallery();
    if (view === 'settings') loadHealth();
  }

  function setKind(kind) {
    state.kind = kind;
    $$('[data-kind]').forEach(node => node.classList.toggle('active', node.dataset.kind === kind));
    $('#durationField').hidden = kind === 'image';
    $('#audioField').hidden = kind === 'image';
    $('#generateKindLabel').textContent = kind;
    const available = state.models.filter(model => model.kind === kind);
    if (!available.some(model => model.id === state.model)) state.model = available[0]?.id || (kind === 'image' ? 'gpt-image-2' : 'seedance-2.0');
    renderModels();
  }

  function renderModels() {
    const grid = $('#modelGrid');
    const models = state.models.filter(model => model.kind === state.kind);
    grid.innerHTML = '';
    models.forEach(model => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `model-option${model.id === state.model ? ' active' : ''}`;
      button.innerHTML = `<b>${escapeHtml(model.name)}</b><small>${escapeHtml(modelCopy[model.id] || 'Available through Higgsfield')}</small>`;
      button.addEventListener('click', () => { state.model = model.id; renderModels(); });
      grid.appendChild(button);
    });
    if (!models.length) grid.innerHTML = '<div class="model-option"><b>No model detected</b><small>Reconnect Higgsfield or refresh Settings.</small></div>';
    $('#modelAvailability').textContent = `${models.length} ${state.kind} model${models.length === 1 ? '' : 's'} ready`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function timeAgo(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function statusLabel(status) {
    return ({ running: 'Starting', submitted: 'Generating', completed: 'Completed', failed: 'Failed' })[status] || status;
  }

  function renderPreview(job) {
    const stage = $('#previewStage');
    if (!job) return;
    const media = job.outputUrl
      ? (job.kind === 'image' ? `<img src="${escapeHtml(job.outputUrl)}" alt="Generated image">` : `<video src="${escapeHtml(job.outputUrl)}" controls autoplay muted loop playsinline></video>`)
      : `<div class="loader"></div>`;
    stage.innerHTML = `${media}<div class="job-overlay"><b>${escapeHtml(job.prompt)}</b><span>${escapeHtml(job.model)} · ${escapeHtml(statusLabel(job.status))}</span></div>`;
  }

  function renderRecent() {
    const node = $('#recentList');
    node.innerHTML = '';
    state.jobs.slice(0, 3).forEach(job => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `<div class="recent-thumb">${job.kind === 'image' ? '▧' : '▶'}</div><div><b>${escapeHtml(job.prompt)}</b><small>${escapeHtml(job.model)} · ${timeAgo(job.createdAt)}</small></div><span class="status-text ${escapeHtml(job.status)}">${escapeHtml(statusLabel(job.status))}</span>`;
      item.addEventListener('click', () => renderPreview(job));
      node.appendChild(item);
    });
  }

  function renderGallery() {
    const grid = $('#galleryGrid');
    const jobs = state.jobs.filter(job => {
      if (state.filter === 'all') return true;
      if (state.filter === 'active') return ['running', 'submitted'].includes(job.status);
      return job.kind === state.filter;
    });
    grid.innerHTML = '';
    if (!jobs.length) {
      grid.innerHTML = '<article class="gallery-card"><div class="gallery-media"><div class="preview-empty"><div class="preview-glyph">✦</div><strong>No creations here yet</strong><p>Start from the Create tab.</p></div></div></article>';
      return;
    }
    jobs.forEach(job => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      const media = job.outputUrl
        ? (job.kind === 'image' ? `<img src="${escapeHtml(job.outputUrl)}" alt="Generated image" loading="lazy">` : `<video src="${escapeHtml(job.outputUrl)}" muted loop playsinline preload="metadata"></video>`)
        : `<div class="${job.status === 'failed' ? 'preview-empty' : 'loader'}">${job.status === 'failed' ? `<strong>Generation failed</strong><p>${escapeHtml(job.errorMessage || 'Open Higgsfield and retry.')}</p>` : ''}</div>`;
      card.innerHTML = `<div class="gallery-media">${media}</div><div class="gallery-body"><p>${escapeHtml(job.prompt)}</p><div class="gallery-meta"><span>${escapeHtml(job.model)}</span><span class="status-text ${escapeHtml(job.status)}">${escapeHtml(statusLabel(job.status))}</span><span>${timeAgo(job.createdAt)}</span></div><div class="gallery-actions"><button type="button" data-reuse>Reuse prompt</button>${job.outputUrl ? `<a href="${escapeHtml(job.outputUrl)}" target="_blank" rel="noopener">Open output</a>` : `<button type="button" data-refresh>Refresh</button>`}</div></div>`;
      const video = card.querySelector('video');
      if (video) { card.addEventListener('mouseenter', () => video.play().catch(() => {})); card.addEventListener('mouseleave', () => video.pause()); }
      card.querySelector('[data-reuse]').addEventListener('click', () => {
        $('#prompt').value = job.prompt; updatePromptCount(); setKind(job.kind); state.model = job.model; renderModels(); setView('studio'); toast('Prompt loaded into Create.');
      });
      card.querySelector('[data-refresh]')?.addEventListener('click', () => refreshJob(job.id, true));
      grid.appendChild(card);
    });
  }

  function updateConnection(connected, message = '') {
    state.connected = connected;
    const pill = $('#connectionPill');
    pill.classList.toggle('connected', connected);
    pill.classList.toggle('error', !connected && Boolean(message));
    $('#connectionLabel').textContent = connected ? 'Higgsfield connected' : 'Connect Higgsfield';
    const settings = $('#settingsConnection');
    settings.textContent = connected ? 'Connected' : 'Not connected';
    settings.classList.toggle('connected', connected);
  }

  async function loadCatalog() {
    try {
      const payload = await api('/api/higgsfield/catalog');
      state.models = payload.models || [];
      state.tools = payload.tools || [];
      updateConnection(true);
      renderModels();
    } catch (error) {
      state.models = [
        { id: 'seedance-2.0', name: 'Seedance 2.0', kind: 'video' },
        { id: 'kling-3.0', name: 'Kling 3.0', kind: 'video' },
        { id: 'gpt-image-2', name: 'GPT Image 2', kind: 'image' },
      ];
      updateConnection(false, error.message);
      renderModels();
    }
  }

  async function loadHistory() {
    try {
      const payload = await api('/api/higgsfield/history?limit=50');
      state.jobs = payload.jobs || [];
      renderRecent();
      renderGallery();
      const current = state.jobs[0];
      if (current) renderPreview(current);
      schedulePolling();
    } catch (error) {
      console.warn('history_load_failed', error);
    }
  }

  async function refreshJob(id, notify = false) {
    try {
      const payload = await api(`/api/higgsfield/job/${encodeURIComponent(id)}`);
      const index = state.jobs.findIndex(job => job.id === id);
      if (index >= 0) state.jobs[index] = payload.job; else state.jobs.unshift(payload.job);
      renderRecent(); renderGallery();
      if (notify) toast(`Status: ${statusLabel(payload.job.status)}`);
      if (payload.job.outputUrl) renderPreview(payload.job);
    } catch (error) {
      if (notify) toast(error.message, true);
    }
  }

  function schedulePolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      state.jobs.filter(job => ['running', 'submitted'].includes(job.status)).slice(0, 4).forEach(job => refreshJob(job.id));
    }, 12000);
  }

  async function submitGeneration(event) {
    event.preventDefault();
    if (!state.connected) { setView('settings'); toast('Connect Higgsfield before generating.', true); return; }
    const prompt = $('#prompt').value.trim();
    if (prompt.length < 3) { setMessage('Write a proper scene prompt first.', true); return; }
    const button = $('#generateButton');
    button.disabled = true;
    button.querySelector('span').innerHTML = 'Submitting <b>render</b>';
    setMessage('Preparing the secure Higgsfield request…');
    const reference = $('#referenceUrl').value.trim();
    const seedValue = $('#seed').value.trim();
    const tool = state.tools.find(item => item.kind === state.kind);
    try {
      const payload = await api('/api/higgsfield/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: state.kind, prompt, model: state.model, toolName: tool?.name,
          aspectRatio: $('#aspectRatio').value, duration: Number($('#duration').value), resolution: $('#resolution').value,
          negativePrompt: $('#negativePrompt').value.trim(), generateAudio: $('#generateAudio').checked,
          seed: seedValue ? Number(seedValue) : undefined, referenceUrls: reference ? [reference] : [],
        }),
      });
      state.jobs.unshift(payload.job);
      renderRecent(); renderGallery(); renderPreview(payload.job); schedulePolling();
      setMessage(payload.job.status === 'completed' ? 'Render completed.' : 'Generation submitted. You can track it in Gallery.', false, true);
      toast(payload.job.status === 'completed' ? 'Your creation is ready.' : 'Generation submitted to Higgsfield.');
      localStorage.setItem('shazan-last-prompt', prompt);
      if (payload.job.status !== 'completed') setTimeout(() => refreshJob(payload.job.id), 6000);
    } catch (error) {
      setMessage(error.message, true);
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.querySelector('span').innerHTML = `Generate <b>${state.kind}</b>`;
    }
  }

  function setMessage(message, error = false, good = false) {
    const node = $('#formMessage');
    node.textContent = message;
    node.className = `form-message${error ? ' error' : good ? ' good' : ''}`;
  }

  function updatePromptCount() {
    $('#promptCount').textContent = $('#prompt').value.length;
  }

  function polishPrompt() {
    const node = $('#prompt');
    const value = node.value.trim();
    if (!value) { node.focus(); toast('Write the core idea first.', true); return; }
    const additions = ['cinematic composition', 'grounded physical realism', 'natural facial detail', 'intentional camera movement', 'high dynamic range lighting', 'no text, no watermark'];
    const missing = additions.filter(item => !value.toLowerCase().includes(item.split(' ')[0]));
    node.value = `${value.replace(/[.,\s]+$/, '')}. ${missing.join(', ')}.`.slice(0, 6000);
    updatePromptCount();
    toast('Cinematic direction added.');
  }

  async function loadHealth() {
    const grid = $('#healthGrid');
    try {
      const health = await api('/api/higgsfield/launch-health');
      const values = [
        ['Database', health.database ? 'Ready' : 'Missing'], ['OAuth', health.connected ? 'Connected' : 'Connect'],
        ['Video tools', health.video ? 'Available' : 'Not detected'], ['Image tools', health.image ? 'Available' : 'Not detected'],
      ];
      grid.innerHTML = values.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
      updateConnection(Boolean(health.connected), health.message || '');
    } catch (error) {
      grid.innerHTML = `<div><span>Health check</span><b>Needs attention</b></div><div><span>Message</span><b>${escapeHtml(error.message)}</b></div>`;
    }
  }

  function bind() {
    $$('[data-view]').forEach(node => node.addEventListener('click', event => { if (node.tagName === 'A') return; event.preventDefault(); setView(node.dataset.view); }));
    $$('[data-kind]').forEach(node => node.addEventListener('click', () => setKind(node.dataset.kind)));
    $$('[data-filter]').forEach(node => node.addEventListener('click', () => { state.filter = node.dataset.filter; $$('[data-filter]').forEach(item => item.classList.toggle('active', item === node)); renderGallery(); }));
    $('#generationForm').addEventListener('submit', submitGeneration);
    $('#prompt').addEventListener('input', updatePromptCount);
    $('#promptEnhance').addEventListener('click', polishPrompt);
    $('#refreshHealth').addEventListener('click', loadHealth);
  }

  async function init() {
    bind();
    const saved = localStorage.getItem('shazan-last-prompt');
    if (saved) $('#prompt').value = saved;
    updatePromptCount();
    setKind('video');
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === '1') { toast('Higgsfield connected successfully.'); history.replaceState({}, '', '/'); }
    if (params.get('error')) { toast(params.get('error'), true); history.replaceState({}, '', '/'); }
    await Promise.allSettled([loadCatalog(), loadHistory()]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
