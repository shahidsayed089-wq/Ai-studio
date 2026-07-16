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
    modelFilter: 'all',
  };

  const $ = id => document.getElementById(id);
  const qsa = selector => [...document.querySelectorAll(selector)];
  const colors = ['#c9ff16', '#63f5d1', '#ff5fa2', '#8d7cff', '#ffb33d', '#62a9ff', '#e55cff', '#4bff7d'];

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
    $('durationControl').style.display = kind === 'video' ? 'block' : 'none';
    $('audioToggle').style.display = kind === 'video' ? 'flex' : 'none';
    $('generate').textContent = `Generate ${kind}`;
    const list = currentModels();
    if (!list.some(item => item.id === state.selected)) state.selected = list[0]?.id || null;
    renderModelSelect();
    renderModels();
  }

  function renderModelSelect() {
    const select = $('modelSelect');
    select.innerHTML = '';
    const list = currentModels();
    if (!list.length) {
      const option = document.createElement('option');
      option.textContent = `No ${state.kind} models detected`;
      option.value = '';
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
    $('modelHeading').textContent = `${state.kind === 'video' ? 'Video' : 'Image'} models`;
    $('modelSubheading').textContent = `${list.length} selectable from connected Higgsfield`;
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><b>No models exposed</b>Reconnect Higgsfield and refresh the MCP catalog.</div>';
      return;
    }
    list.forEach((model, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `model-card${model.id === state.selected ? ' selected' : ''}`;
      button.style.setProperty('--accent', colors[index % colors.length]);
      button.innerHTML = `
        <div class="model-art"><i></i><span class="type-chip">${esc(model.kind)} model</span></div>
        <div class="model-body">
          <b>${esc(model.name || model.id)}</b>
          <small>${esc(model.source === 'provider-catalog' ? 'Live provider catalog' : 'Automatic routing')}</small>
          <div class="model-foot"><span>${esc(model.kind === 'video' ? 'Motion engine' : 'Image engine')}</span><strong>Connected</strong></div>
        </div>`;
      button.addEventListener('click', () => {
        state.selected = model.id;
        $('modelSelect').value = model.id;
        renderModels();
        document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(button);
    });
  }

  function appIcon(category) {
    const icons = { Generation: '✦', Creative: '◫', Marketing: '↗', 'Web & Apps': '⌘', '3D': '◇', Audio: '◉', Media: '▣', Analysis: '⌕', Utility: '⚙' };
    return icons[category] || '•';
  }

  function renderApps() {
    const search = $('appsSearch').value.trim().toLowerCase();
    const apps = Array.isArray(state.catalog?.apps) ? state.catalog.apps : [];
    const filtered = apps.filter(app => !search || `${app.title} ${app.name} ${app.category} ${app.description}`.toLowerCase().includes(search));
    $('appsCount').textContent = `${filtered.length} of ${apps.length}`;
    const grid = $('appsGrid');
    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><b>No matching MCP tools</b>Try another search.</div>';
      return;
    }
    filtered.forEach(app => {
      const card = document.createElement('article');
      card.className = 'app-card';
      card.innerHTML = `<header><span class="app-icon">${appIcon(app.category)}</span><div><b>${esc(app.title || app.name)}</b><small>${esc(app.category)}</small></div></header><p>${esc(app.description || 'Connected Higgsfield MCP tool.')}</p>`;
      grid.appendChild(card);
    });
  }

  function renderJobs() {
    const list = $('jobsList');
    list.innerHTML = '';
    if (!state.jobs.length) {
      list.innerHTML = '<div class="empty-state"><b>No generations yet</b>Your completed and active jobs will appear here.</div>';
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
    if (view === 'apps') renderApps();
    if (view === 'jobs') renderJobs();
  }

  function previewJob(job) {
    const visual = $('outputVisual');
    const title = $('outputTitle');
    const copy = $('outputCopy');
    const status = $('outputStatus');
    visual.innerHTML = '';
    if (!job) {
      visual.innerHTML = '<span>✦</span>';
      title.textContent = 'Ready for your first render';
      copy.textContent = 'Choose a connected model, write the prompt and generate.';
      status.textContent = 'Idle';
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
      visual.innerHTML = `<span>${job.kind === 'image' ? '▧' : '▶'}</span>`;
    }
    title.textContent = `${job.kind === 'image' ? 'Image' : 'Video'} ${job.status || 'submitted'}`;
    copy.textContent = job.errorMessage || job.prompt || 'Higgsfield is processing this generation.';
    status.textContent = job.status || 'submitted';
  }

  async function loadCatalog() {
    $('engineText').textContent = 'Checking';
    try {
      const response = await fetch('/api/higgsfield/catalog', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Higgsfield catalog unavailable');
      state.catalog = data;
      state.models = Array.isArray(data.models) ? data.models : [];
      $('engineText').textContent = 'Higgsfield connected';
      $('metricTools').innerHTML = `<b>${Number(data.totalMcpTools || 0)}</b> MCP tools`;
      $('metricEngines').innerHTML = `<b>${Number(data.generationToolCount || 0)}</b> generation engines`;
      $('metricModels').innerHTML = `<b>${state.models.length}</b> selectable models`;
      const list = currentModels();
      if (!list.some(item => item.id === state.selected)) state.selected = list[0]?.id || null;
      renderModelSelect();
      renderModels();
      renderApps();
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
          setMessage(job.status === 'completed' ? 'Generation completed.' : `Generation failed: ${job.errorMessage || 'Provider error'}`, job.status === 'completed' ? 'good' : 'bad');
        }
      } catch {}
    }, 7000);
  }

  qsa('[data-kind]').forEach(button => button.addEventListener('click', () => setKind(button.dataset.kind)));
  qsa('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  qsa('[data-nav]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.nav;
    if (target === 'video' || target === 'image') {
      setKind(target);
      document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (target === 'apps') {
      setView('apps');
      document.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (target === 'gallery') {
      setView('jobs');
      document.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    qsa('[data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === target));
  }));

  $('modelSelect').addEventListener('change', event => {
    state.selected = event.target.value || null;
    renderModels();
  });
  $('prompt').addEventListener('input', event => $('promptCount').textContent = event.target.value.length);
  $('enhance').addEventListener('click', () => {
    const prompt = $('prompt');
    const value = prompt.value.trim();
    if (!value) return;
    if (!/cinematic/i.test(value)) prompt.value = `${value}, cinematic composition, natural motion, detailed lighting, consistent subject, professional color grade`;
    $('promptCount').textContent = prompt.value.length;
  });
  $('appsSearch').addEventListener('input', renderApps);
  $('refreshCatalog').addEventListener('click', async () => { await loadCatalog(); await loadHistory(); });

  $('generationForm').addEventListener('submit', async event => {
    event.preventDefault();
    const model = selectedModel();
    if (!model) {
      setMessage('Choose a connected model first.', 'bad');
      return;
    }
    const prompt = $('prompt').value.trim();
    if (prompt.length < 3) {
      setMessage('Write a proper prompt first.', 'bad');
      return;
    }
    const button = $('generate');
    button.disabled = true;
    button.textContent = 'Submitting to Higgsfield...';
    setMessage('Sending the generation through your connected Higgsfield account.');
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
      setView('jobs');
      setMessage(data.note || 'Generation submitted.', 'good');
      if (['running', 'submitted'].includes(job.status)) poll(job.id);
    } catch (error) {
      setMessage(error.message || 'Generation failed.', 'bad');
    } finally {
      button.disabled = !state.selected;
      button.textContent = `Generate ${state.kind}`;
    }
  });

  setKind('video');
  setView('models');
  Promise.all([loadCatalog(), loadHistory()]);
})();
