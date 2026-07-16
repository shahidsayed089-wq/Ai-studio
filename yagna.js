(() => {
  navigator.serviceWorker?.getRegistrations?.().then(items => items.forEach(item => item.unregister())).catch(() => {});

  const state = {
    kind: 'video',
    view: 'models',
    catalog: null,
    models: [],
    selected: null,
    jobs: [],
    poll: null,
    appCategory: 'All',
  };

  const $ = id => document.getElementById(id);
  const qsa = selector => [...document.querySelectorAll(selector)];
  const palettes = [
    ['#ff6a1a', 'rgba(255,106,26,.34)'],
    ['#f2c66d', 'rgba(242,198,109,.32)'],
    ['#ff9c35', 'rgba(255,156,53,.34)'],
    ['#e3572b', 'rgba(227,87,43,.32)'],
    ['#ffd68a', 'rgba(255,214,138,.3)'],
    ['#dc7b2e', 'rgba(220,123,46,.32)'],
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function setMessage(text, type = '') {
    $('message').textContent = text || '';
    $('message').className = `message ${type}`.trim();
  }

  function currentModels() {
    return state.models.filter(model => model.kind === state.kind);
  }

  function selectedModel() {
    return state.models.find(model => model.id === state.selected && model.kind === state.kind) || null;
  }

  function setKind(kind) {
    state.kind = kind;
    qsa('[data-kind]').forEach(button => button.classList.toggle('active', button.dataset.kind === kind));
    qsa('[data-nav-kind]').forEach(button => button.classList.toggle('active', button.dataset.navKind === kind));
    $('durationControl').style.display = kind === 'video' ? 'block' : 'none';
    $('audioToggle').style.display = kind === 'video' ? 'flex' : 'none';
    $('generate').textContent = `Ignite ${kind}`;
    const list = currentModels();
    if (!list.some(item => item.id === state.selected)) state.selected = list[0]?.id || null;
    renderModelSelect();
    renderModels();
    updateStageIdentity();
  }

  function updateStageIdentity() {
    const model = selectedModel();
    $('activeModelName').textContent = model?.name || 'Awaiting model';
    $('stageKind').textContent = state.kind === 'video' ? 'Motion forge' : 'Image forge';
  }

  function renderModelSelect() {
    const select = $('modelSelect');
    select.innerHTML = '';
    const list = currentModels();
    if (!list.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `No ${state.kind} model exposed`;
      select.appendChild(option);
      state.selected = null;
      $('generate').disabled = true;
      return;
    }
    list.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name || model.id;
      select.appendChild(option);
    });
    if (!list.some(item => item.id === state.selected)) state.selected = list[0].id;
    select.value = state.selected;
    $('generate').disabled = false;
  }

  function renderModels() {
    const grid = $('modelGrid');
    grid.innerHTML = '';
    const list = currentModels();
    $('modelHeading').textContent = `${state.kind === 'video' ? 'Motion' : 'Image'} engines`;
    $('modelSubheading').textContent = `${list.length} genuine schema model${list.length === 1 ? '' : 's'} in this account`;
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><b>No engine exposed</b>Reconnect Higgsfield and refresh the Yagna catalog.</div>';
      return;
    }
    list.forEach((model, index) => {
      const [accent, soft] = palettes[index % palettes.length];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `model-card${model.id === state.selected ? ' selected' : ''}`;
      button.style.setProperty('--accent', accent);
      button.style.setProperty('--accent-soft', soft);
      button.innerHTML = `
        <div class="model-art"><i></i><span class="type-chip">${esc(model.kind)} engine</span></div>
        <div class="model-body">
          <b>${esc(model.name || model.id)}</b>
          <small>${model.autoModel ? 'Yagna automatic routing' : 'Live MCP schema'}</small>
          <div class="model-foot"><span>${model.kind === 'video' ? 'Motion synthesis' : 'Visual synthesis'}</span><strong>Ready</strong></div>
        </div>`;
      button.addEventListener('click', () => {
        state.selected = model.id;
        $('modelSelect').value = model.id;
        renderModels();
        updateStageIdentity();
        document.querySelector('.forge')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(button);
    });
  }

  function appIcon(category) {
    return ({ Generation: '✦', Creative: '◫', Marketing: '↗', 'Web & Apps': '⌘', '3D': '◇', Audio: '◉', Media: '▣', Analysis: '⌕', Utility: '⚙' })[category] || '•';
  }

  function renderCategoryFilters() {
    const container = $('categoryFilters');
    const apps = Array.isArray(state.catalog?.apps) ? state.catalog.apps : [];
    const categories = ['All', ...new Set(apps.map(app => app.category).filter(Boolean))];
    container.innerHTML = '';
    categories.forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = category;
      button.className = category === state.appCategory ? 'active' : '';
      button.addEventListener('click', () => {
        state.appCategory = category;
        renderCategoryFilters();
        renderApps();
      });
      container.appendChild(button);
    });
  }

  function renderApps() {
    const query = $('appsSearch').value.trim().toLowerCase();
    const apps = Array.isArray(state.catalog?.apps) ? state.catalog.apps : [];
    const filtered = apps.filter(app => {
      const categoryMatch = state.appCategory === 'All' || app.category === state.appCategory;
      const searchMatch = !query || `${app.title} ${app.name} ${app.category} ${app.description}`.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
    $('appsCount').textContent = `${filtered.length} of ${apps.length} tools`;
    const grid = $('appsGrid');
    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><b>No Forge tool found</b>Change the category or search phrase.</div>';
      return;
    }
    filtered.forEach(app => {
      const card = document.createElement('article');
      card.className = 'app-card';
      card.innerHTML = `<header><span class="app-icon">${appIcon(app.category)}</span><div><b>${esc(app.title || app.name)}</b><small>${esc(app.category)}</small></div></header><p>${esc(app.description || 'Connected MCP capability.')}</p>`;
      grid.appendChild(card);
    });
  }

  function renderJobs() {
    const list = $('jobsList');
    list.innerHTML = '';
    if (!state.jobs.length) {
      list.innerHTML = '<div class="empty-state"><b>No embers in the vault</b>Your active and completed generations will appear here.</div>';
      return;
    }
    state.jobs.forEach(job => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'job';
      button.innerHTML = `<span class="job-thumb">${job.kind === 'image' ? '▧' : '▶'}</span><span><b>${esc(job.prompt || job.model)}</b><small>${esc(job.model || 'Auto')} · ${esc(job.createdAt || '')}</small></span><em>${esc(job.status || 'unknown')}</em>`;
      button.addEventListener('click', () => {
        previewJob(job);
        if (['running', 'submitted'].includes(job.status)) poll(job.id);
      });
      list.appendChild(button);
    });
  }

  function setView(view) {
    state.view = view;
    qsa('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    qsa('.panel-view').forEach(panel => panel.classList.toggle('active', panel.id === `view-${view}`));
    qsa('[data-dock]').forEach(button => button.classList.toggle('active', button.dataset.dock === view));
    if (view === 'apps') {
      renderCategoryFilters();
      renderApps();
    }
    if (view === 'jobs') renderJobs();
  }

  function previewJob(job) {
    const visual = $('outputVisual');
    const title = $('outputTitle');
    const copy = $('outputCopy');
    const status = $('outputStatus');
    visual.innerHTML = '';
    if (!job) {
      visual.innerHTML = '<div class="empty-flame">♨</div>';
      title.textContent = 'The forge is ready';
      copy.textContent = 'Choose an engine, write the direction and ignite a render.';
      status.textContent = 'Yagna idle';
      return;
    }
    if (job.outputUrl) {
      const media = document.createElement(job.kind === 'image' ? 'img' : 'video');
      media.src = job.outputUrl;
      if (job.kind === 'video') {
        media.controls = true;
        media.playsInline = true;
      }
      visual.appendChild(media);
    } else {
      visual.innerHTML = `<div class="empty-flame">${job.kind === 'image' ? '▧' : '▶'}</div>`;
    }
    title.textContent = `${job.kind === 'image' ? 'Image' : 'Video'} ${job.status || 'submitted'}`;
    copy.textContent = job.errorMessage || job.prompt || 'Yagna is carrying the request through Higgsfield.';
    status.textContent = job.status || 'submitted';
  }

  async function loadCatalog() {
    $('engineText').textContent = 'Yagna checking';
    try {
      const response = await fetch('/api/higgsfield/catalog', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Higgsfield catalog unavailable');
      state.catalog = data;
      state.models = Array.isArray(data.models) ? data.models : [];
      $('engineText').textContent = 'Yagna online';
      $('metricTools').innerHTML = `<b>${Number(data.totalMcpTools || 0)}</b> MCP tools`;
      $('metricEngines').innerHTML = `<b>${Number(data.generationToolCount || 0)}</b> forge routes`;
      $('metricModels').innerHTML = `<b>${state.models.length}</b> true models`;
      $('forgeCount').textContent = `${Number(data.totalMcpTools || 0)} connected capabilities`;
      const list = currentModels();
      if (!list.some(item => item.id === state.selected)) state.selected = list[0]?.id || null;
      renderModelSelect();
      renderModels();
      renderCategoryFilters();
      renderApps();
      updateStageIdentity();
    } catch (error) {
      $('engineText').textContent = 'Reconnect required';
      state.catalog = null;
      state.models = [];
      renderModelSelect();
      renderModels();
      setMessage(error.message || 'Higgsfield connection failed.', 'bad');
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch('/api/higgsfield/history?limit=30', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      state.jobs = Array.isArray(data.jobs) ? data.jobs : [];
      renderJobs();
      previewJob(state.jobs[0] || null);
    } catch {}
  }

  async function refreshJob(id) {
    const response = await fetch(`/api/higgsfield/job/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Status refresh failed');
    const job = data.job;
    state.jobs = [job, ...state.jobs.filter(item => item.id !== job.id)];
    renderJobs();
    previewJob(job);
    return job;
  }

  function poll(id) {
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const job = await refreshJob(id);
        if (['completed', 'failed'].includes(job.status)) {
          clearInterval(state.poll);
          setMessage(job.status === 'completed' ? 'Render completed. The ember became cinema.' : `Render failed: ${job.errorMessage || 'Provider error'}`, job.status === 'completed' ? 'good' : 'bad');
        }
      } catch {}
    }, 7000);
  }

  qsa('[data-kind]').forEach(button => button.addEventListener('click', () => setKind(button.dataset.kind)));
  qsa('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  qsa('[data-nav-kind]').forEach(button => button.addEventListener('click', () => {
    setKind(button.dataset.navKind);
    document.querySelector('.forge')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  qsa('[data-nav-view]').forEach(button => button.addEventListener('click', () => {
    setView(button.dataset.navView);
    document.querySelector('.studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  qsa('[data-dock]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.dock;
    if (target === 'create') {
      document.querySelector('.forge')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setView(target);
    document.querySelector('.studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  $('modelSelect').addEventListener('change', event => {
    state.selected = event.target.value || null;
    renderModels();
    updateStageIdentity();
  });
  $('prompt').addEventListener('input', event => $('promptCount').textContent = event.target.value.length);
  $('enhance').addEventListener('click', () => {
    const prompt = $('prompt');
    const value = prompt.value.trim();
    if (!value) return;
    const suffix = 'cinematic blocking, physically grounded motion, expressive natural faces, volumetric lighting, premium production design, controlled camera movement, clean frame, no text, no watermark';
    if (!/premium production design/i.test(value)) prompt.value = `${value}, ${suffix}`;
    $('promptCount').textContent = prompt.value.length;
  });
  $('appsSearch').addEventListener('input', renderApps);
  $('refreshCatalog').addEventListener('click', async () => { await loadCatalog(); await loadHistory(); });

  $('generationForm').addEventListener('submit', async event => {
    event.preventDefault();
    const model = selectedModel();
    if (!model) {
      setMessage('Choose a genuine connected engine first.', 'bad');
      return;
    }
    const prompt = $('prompt').value.trim();
    if (prompt.length < 3) {
      setMessage('Give Yagna a proper direction first.', 'bad');
      return;
    }
    const button = $('generate');
    button.disabled = true;
    button.textContent = 'Igniting Yagna...';
    setMessage('Passing the direction securely into the connected Higgsfield forge.');
    const reference = $('referenceUrl').value.trim();
    const seedRaw = $('seed').value.trim();
    const payload = {
      kind: state.kind,
      prompt,
      model: model.id,
      toolName: model.toolName,
      aspectRatio: $('aspect').value,
      resolution: $('resolution').value,
      duration: Number($('duration').value),
      negativePrompt: $('negative').value.trim(),
      referenceUrls: reference ? [reference] : [],
      generateAudio: $('audio').checked,
    };
    if (seedRaw) payload.seed = Number(seedRaw);
    try {
      const response = await fetch('/api/higgsfield/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Generation request failed');
      const job = data.job;
      state.jobs = [job, ...state.jobs.filter(item => item.id !== job.id)];
      previewJob(job);
      renderJobs();
      setMessage(data.note || 'Yagna accepted the render.', 'good');
      if (['running', 'submitted'].includes(job.status)) poll(job.id);
    } catch (error) {
      setMessage(error.message || 'Yagna could not submit the render.', 'bad');
    } finally {
      button.disabled = !selectedModel();
      button.textContent = `Ignite ${state.kind}`;
    }
  });

  setKind('video');
  setView('models');
  Promise.all([loadCatalog(), loadHistory()]);
})();
