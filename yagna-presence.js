(() => {
  const $ = id => document.getElementById(id);
  const setText = (element, value) => {
    if (element && element.textContent !== value) element.textContent = value;
  };

  function renderLoadingEngines() {
    const grid = $('modelGrid');
    if (!grid || grid.querySelector('.model-card')) return;
    grid.classList.add('is-loading');
    grid.innerHTML = Array.from({ length: 4 }, () => '<div class="engine-skeleton" aria-hidden="true"><span></span><i></i></div>').join('');
  }

  function setMetricLoading(id, label) {
    const metric = $(id);
    if (!metric) return;
    metric.classList.add('is-loading');
    if (metric.textContent !== label) metric.textContent = label;
  }

  function setInitialPresence() {
    const engineState = document.querySelector('.engine-state');
    engineState?.classList.add('preparing');
    setText($('engineText'), 'Preparing studio');
    setMetricLoading('metricTools', 'Connected ecosystem');
    setMetricLoading('metricEngines', 'Creative routing');
    setMetricLoading('metricModels', 'Live engine catalog');
    setText($('stageKind'), 'Motion direction');
    setText($('activeModelName'), 'Curating engines');
    setText($('outputStatus'), 'Ready to create');
    $('outputStatus')?.classList.add('ready-state');
    setText($('outputTitle'), 'The stage is yours');
    setText($('outputCopy'), 'Choose a direction. Yagna will reveal the best connected engine for the shot.');
    setText($('modelSubheading'), 'Curating available engines');
    setText($('appsCount'), 'Connected collection');
    renderLoadingEngines();
  }

  function rewriteMetric(id, label) {
    const metric = $(id);
    if (!metric) return;
    const match = metric.textContent.trim().match(/^(\d+)/);
    if (!match) return;
    const next = `${match[1]} ${label}`;
    metric.classList.remove('is-loading');
    if (metric.textContent.trim() !== next) metric.innerHTML = `<b>${match[1]}</b> ${label}`;
  }

  function polishedEngineName(value) {
    const text = String(value || '').trim();
    if (/^(video auto|auto video|auto_video)$/i.test(text)) return 'Yagna Motion Auto';
    if (/^(image auto|auto image|auto_image)$/i.test(text)) return 'Yagna Image Auto';
    return text;
  }

  function polishEngineNames() {
    const select = $('modelSelect');
    if (select) {
      [...select.options].forEach(option => {
        const polished = polishedEngineName(option.textContent);
        if (polished && polished !== option.textContent) option.textContent = polished;
      });
    }
    document.querySelectorAll('.model-card .model-body b').forEach(label => {
      const polished = polishedEngineName(label.textContent);
      if (polished && polished !== label.textContent) label.textContent = polished;
    });
    const active = $('activeModelName');
    if (active) {
      const polished = polishedEngineName(active.textContent);
      if (polished && polished !== active.textContent) active.textContent = polished;
    }
  }

  function polishEmptyStates() {
    document.querySelectorAll('.empty-state').forEach(state => {
      const text = state.textContent || '';
      if (/No engine exposed|Reconnect Higgsfield/i.test(text)) {
        state.classList.add('polished-empty');
        state.innerHTML = '<b>Connect your creative account</b>Your available engines will appear here automatically.';
      } else if (/No embers in the vault/i.test(text)) {
        state.classList.add('polished-empty');
        state.innerHTML = '<b>Your first render starts here</b>Completed and active creations will collect in this vault.';
      }
    });
  }

  function polishSelect() {
    const select = $('modelSelect');
    if (!select || select.options.length !== 1) return;
    const option = select.options[0];
    if (/No .* model exposed/i.test(option.textContent || '')) option.textContent = 'Engines appear after connection';
  }

  function polishLiveCopy() {
    const engineState = document.querySelector('.engine-state');
    const engineText = $('engineText');
    const engineValue = engineText?.textContent.trim() || '';
    if (/Yagna checking|Checking/i.test(engineValue)) {
      engineState?.classList.add('preparing');
      setText(engineText, 'Preparing studio');
    } else if (/Yagna online/i.test(engineValue)) {
      engineState?.classList.remove('preparing');
      setText(engineText, 'Studio connected');
    } else if (/Reconnect required/i.test(engineValue)) {
      engineState?.classList.remove('preparing');
      setText(engineText, 'Connection required');
    }

    const output = $('outputStatus');
    const status = output?.textContent.trim().toLowerCase() || '';
    const statusMap = { 'yagna idle': 'Ready to create', submitted: 'Render queued', running: 'Creating', completed: 'Ready', failed: 'Needs attention' };
    if (statusMap[status]) setText(output, statusMap[status]);
    output?.classList.toggle('ready-state', ['ready to create', 'ready'].includes((output?.textContent || '').toLowerCase()));

    const activeModel = $('activeModelName');
    if (activeModel?.textContent.trim() === 'Awaiting model') setText(activeModel, 'Curating engines');

    rewriteMetric('metricTools', 'connected capabilities');
    rewriteMetric('metricEngines', 'creative routes');
    rewriteMetric('metricModels', 'available engines');

    const modelSubheading = $('modelSubheading');
    const modelText = modelSubheading?.textContent.trim() || '';
    const modelCount = modelText.match(/^(\d+)/);
    if (/Loading genuine connected models/i.test(modelText)) {
      setText(modelSubheading, 'Curating available engines');
    } else if (modelCount && /genuine schema model/i.test(modelText)) {
      const count = Number(modelCount[1]);
      setText(modelSubheading, `${count} creative engine${count === 1 ? '' : 's'} ready for this session`);
    }

    const grid = $('modelGrid');
    if (grid?.querySelector('.model-card')) grid.classList.remove('is-loading');
    polishSelect();
    polishEngineNames();
    polishEmptyStates();
  }

  function initialiseMobileDock() {
    const buttons = [...document.querySelectorAll('[data-dock]')];
    const create = buttons.find(button => button.dataset.dock === 'create');
    buttons.forEach(button => button.classList.toggle('active', button === create));
    buttons.forEach(button => button.addEventListener('click', () => {
      buttons.forEach(item => item.classList.toggle('active', item === button));
    }));
  }

  setInitialPresence();
  initialiseMobileDock();
  const observer = new MutationObserver(polishLiveCopy);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  polishLiveCopy();

  window.setTimeout(() => {
    const grid = $('modelGrid');
    if (grid && !grid.querySelector('.model-card') && !grid.querySelector('.empty-state')) {
      grid.classList.remove('is-loading');
      grid.innerHTML = '<div class="empty-state polished-empty"><b>Your engines are almost ready</b>Finish the connection once and Yagna will remember the studio.</div>';
    }
  }, 9000);
})();
