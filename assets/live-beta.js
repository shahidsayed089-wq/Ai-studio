(() => {
  const LIVE_NAME = 'Luma Ray 3.2 API';
  const LATEST_NAME = 'Luma Ray 3.14';
  const API_ROOT = '/api/live/generations';
  const lumaIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.9"/><path d="M7.3 14.9c2.6-5.5 6.3-8 10.8-7.4-1.9 5.7-5.5 8.7-10.8 9.1" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round"/><circle cx="14.8" cy="9.1" r="1.35" fill="currentColor"/></svg>';

  const style = document.createElement('style');
  style.textContent = `
    .live-model-card{border-color:rgba(95,245,181,.62)!important;box-shadow:0 0 0 1px rgba(95,245,181,.16),0 0 28px rgba(95,245,181,.08)}
    .live-model-card.selected{border-color:var(--good)!important;box-shadow:0 0 0 1px var(--good),0 0 22px rgba(95,245,181,.4),0 18px 48px rgba(0,0,0,.45)!important}
    .latest-luma-card{border-color:rgba(255,220,134,.42)!important}
    .live-pill,.pending-pill{font-size:9px!important;font-weight:900!important}
    .live-pill{color:#03130d!important;background:var(--good)!important;border-color:var(--good)!important;box-shadow:0 0 14px rgba(95,245,181,.38)}
    .pending-pill{color:#1b1100!important;background:var(--gold)!important;border-color:var(--gold)!important}
    .luma-art{background:radial-gradient(circle at 66% 30%,rgba(255,255,255,.75) 0 2%,transparent 4%),radial-gradient(circle at 50% 46%,#8bfff2 0 8%,#23b6b2 25%,#153969 48%,#0b1028 72%)}
    .luma314-art{background:radial-gradient(circle at 68% 28%,rgba(255,255,255,.74) 0 2%,transparent 4%),linear-gradient(135deg,#120b2a,#63266c 48%,#ff9348)}
    .luma-moon{position:absolute;width:88px;height:88px;border-radius:50%;left:50%;top:48%;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 34px rgba(89,255,239,.52),inset -18px -15px 28px rgba(4,9,34,.72)}
    .luma314-art .luma-moon{box-shadow:0 0 36px rgba(255,188,108,.55),inset -18px -15px 28px rgba(31,4,38,.65)}
    .luma-arc{position:absolute;width:124px;height:46px;border:7px solid #5ff5b5;border-top-color:transparent;border-left-color:transparent;border-radius:50%;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-18deg);filter:drop-shadow(0 0 12px rgba(95,245,181,.8))}
    .luma314-art .luma-arc{border-color:#ffdc86;border-top-color:transparent;border-left-color:transparent;filter:drop-shadow(0 0 12px rgba(255,220,134,.75))}
    .beta-access{margin:15px 0 0;padding:13px;border:1px solid rgba(95,245,181,.22);border-radius:11px;background:rgba(95,245,181,.055)}
    .beta-access label{display:block;color:#b9c8c5;font-size:11px;margin-bottom:7px}.beta-access input{width:100%;height:41px;border:1px solid var(--line2);border-radius:9px;background:#0d1112;color:#fff;padding:0 12px;outline:none}.beta-access input:focus{border-color:var(--good);box-shadow:0 0 0 3px rgba(95,245,181,.09)}.beta-hint{margin-top:7px;color:#7f908d;font-size:10px;line-height:1.45}
    .live-output{display:none;margin-top:16px;border:1px solid rgba(8,240,227,.25);border-radius:12px;overflow:hidden;background:#050707}.live-output.show{display:block}.live-output video{display:block;width:100%;max-height:430px;background:#000}.live-output-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px}.live-output-actions span{font-size:11px;color:var(--good);font-weight:800}.live-output-actions a{color:#041310;background:var(--cyan);border-radius:8px;padding:8px 12px;text-decoration:none;font-size:11px;font-weight:900}
    .live-beta-note{margin:10px 0 0;color:#93a6a2;font-size:10px;line-height:1.5}.live-beta-note b{color:var(--good)}.mini-logo.luma-mini{background:linear-gradient(145deg,#b6fff6,#5ff5b5);color:#04130f}.mini-logo.luma314-mini{background:linear-gradient(145deg,#ffe6a7,#ff9352);color:#1f0d00}.logo-lockup.luma-lockup svg{width:19px;height:19px;color:#f3fffd}.logo-lockup.luma-lockup .wm{font-size:14px;font-weight:850;letter-spacing:-.035em}
    @media(max-width:620px){.beta-access{margin-top:12px}.live-output video{max-height:54vh}}
  `;
  document.head.appendChild(style);

  const cardsContainer = document.querySelector('.cards');
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');
  const drawerModel = document.getElementById('drawerModel');
  const bannerModel = document.getElementById('bannerModel');
  const bannerCopy = document.getElementById('bannerCopy');
  const costText = document.getElementById('costText');
  const generateBtn = document.getElementById('generateBtn');
  const promptInput = document.getElementById('prompt');
  const progressBox = document.getElementById('progressBox');
  const progressText = document.getElementById('progressText');
  const progressPct = document.getElementById('progressPct');
  const progressBar = document.getElementById('progressBar');
  const controls = [...document.querySelectorAll('.controls select')];
  const ratioSelect = controls[0];
  const durationSelect = controls[1];
  const qualitySelect = controls[2];
  if (!cardsContainer || !drawer || !generateBtn || !promptInput) return;

  function makeCard(name, type) {
    const live = type === 'live';
    const card = document.createElement('article');
    card.className = `model-card ${live ? 'live-model-card' : 'latest-luma-card'}`;
    card.dataset.name = name;
    card.dataset.tags = 'video luma';
    card.innerHTML = `<div class="art ${live ? 'luma-art' : 'luma314-art'}"><div class="gridlines"></div><div class="luma-moon"></div><div class="luma-arc"></div><span class="art-label">${live ? 'REAL API' : 'LATEST MODEL'}</span><button class="fav" aria-label="Favourite">♡</button></div><div class="card-body"><div class="card-title"><div class="logo-lockup luma-lockup">${lumaIcon}<span class="wm">${name}</span></div><small class="${live ? 'live-pill' : 'pending-pill'}">${live ? 'CHECKING' : 'API WAIT'}</small></div><div class="company">${live ? 'Luma Agents API' : 'Dream Machine latest model'}</div><div class="tags"><span>${live ? 'Real output' : 'Native 1080p'}</span><span>5 sec</span><span>${live ? 'Private beta' : '3× cheaper'}</span></div><div class="card-foot"><span>${live ? 'Live generation engine' : '4× faster than Ray3'}</span><span class="credits-pill">${live ? 'metered API' : 'app available'}</span></div></div>`;
    return card;
  }

  const liveCard = makeCard(LIVE_NAME, 'live');
  const latestCard = makeCard(LATEST_NAME, 'latest');
  const sora = [...document.querySelectorAll('.model-card')].find(card => card.dataset.name === 'Sora');
  cardsContainer.insertBefore(latestCard, sora?.nextSibling || cardsContainer.firstChild);
  cardsContainer.insertBefore(liveCard, latestCard);

  const featured = document.querySelector('.featured');
  if (featured) {
    featured.insertAdjacentHTML('afterbegin', '<div class="featured-row"><span class="mini-logo luma-mini">LU</span>Luma Ray 3.2 API <b style="margin-left:auto;color:var(--good);font-size:9px">LIVE</b></div><div class="featured-row"><span class="mini-logo luma314-mini">Lπ</span>Luma Ray 3.14 <b style="margin-left:auto;color:var(--gold);font-size:9px">LATEST</b></div>');
  }

  const betaAccess = document.createElement('div');
  betaAccess.className = 'beta-access';
  betaAccess.innerHTML = '<label for="betaAccessCode">Private beta access code</label><input id="betaAccessCode" type="password" autocomplete="off" placeholder="Enter launch code"><div class="beta-hint">Your provider key never enters the browser. This code only protects beta spending.</div>';
  const generateRow = document.querySelector('.generate-row');
  generateRow?.before(betaAccess);
  const betaInput = betaAccess.querySelector('input');
  betaInput.value = localStorage.getItem('aiStudioBetaCode') || '';
  betaInput.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', betaInput.value.trim()));

  const betaNote = document.createElement('p');
  betaNote.className = 'live-beta-note';
  betaNote.innerHTML = '<b>Truthful model routing:</b> Ray3.14 is the latest Dream Machine model. The current public developer API documents Ray3.2, so real beta renders use Ray3.2 until 3.14 receives an official API identifier.';
  generateRow?.after(betaNote);

  const output = document.createElement('div');
  output.className = 'live-output';
  output.innerHTML = '<video controls playsinline></video><div class="live-output-actions"><span>REAL RENDER COMPLETE</span><a target="_blank" rel="noopener">Open video</a></div>';
  document.querySelector('.progressbox')?.after(output);
  const outputVideo = output.querySelector('video');
  const outputLink = output.querySelector('a');

  function setProgress(message, percent, isError = false) {
    progressBox?.classList.add('show');
    if (progressText) {
      progressText.textContent = message;
      progressText.style.color = isError ? '#ff8e9a' : '';
    }
    if (progressPct) progressPct.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  function selectedName() {
    return drawerModel?.textContent.trim() || '';
  }

  function syncMode() {
    const live = selectedName() === LIVE_NAME;
    const latest = selectedName() === LATEST_NAME;
    betaAccess.style.display = live ? '' : 'none';
    betaNote.style.display = live || latest ? '' : 'none';
    output.classList.remove('show');
    if (durationSelect) {
      durationSelect.disabled = live;
      if (live) durationSelect.selectedIndex = 0;
    }
    generateBtn.disabled = false;
    generateBtn.textContent = live ? 'Generate real Ray 3.2 video' : latest ? 'Ray 3.14 API coming' : 'Model coming next';
  }

  function openCard(card, latest) {
    document.querySelectorAll('.model-card').forEach(item => item.classList.remove('selected'));
    card.classList.add('selected');
    const name = latest ? LATEST_NAME : LIVE_NAME;
    if (drawerModel) drawerModel.textContent = name;
    if (bannerModel) bannerModel.innerHTML = `<span class="logo-lockup luma-lockup">${lumaIcon}<span class="wm">${name}</span></span>`;
    if (bannerCopy) bannerCopy.textContent = latest ? 'Latest Dream Machine model, official API identifier not published yet' : 'Real text-to-video generation through the Luma Agents API';
    if (costText) costText.textContent = latest ? 'API pending' : 'live metered render';
    drawer.classList.add('show');
    backdrop?.classList.add('show');
    syncMode();
  }

  [[liveCard, false], [latestCard, true]].forEach(([card, latest]) => {
    card.addEventListener('click', event => {
      if (!event.target.closest('.fav')) openCard(card, latest);
    });
    card.querySelector('.fav')?.addEventListener('click', event => {
      event.stopPropagation();
      const fav = event.currentTarget;
      fav.classList.toggle('on');
      fav.textContent = fav.classList.contains('on') ? '♥' : '♡';
    });
  });

  document.addEventListener('click', event => {
    if (event.target.closest('.model-card') && !event.target.closest('.live-model-card') && !event.target.closest('.latest-luma-card')) setTimeout(syncMode, 0);
  });

  async function readError(response) {
    const payload = await response.json().catch(() => ({}));
    return payload.message || payload.error || `Request failed (${response.status})`;
  }

  async function pollGeneration(id, code) {
    await new Promise(resolve => setTimeout(resolve, 30000));
    for (let attempt = 1; attempt <= 114; attempt += 1) {
      const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}`, { headers: { 'x-beta-code': code }, cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response));
      const generation = (await response.json()).generation || {};
      if (generation.status === 'completed' && generation.videoUrl) return generation;
      if (generation.status === 'failed') throw new Error(generation.failureReason || 'Luma could not complete this render.');
      setProgress(`Ray 3.2 is rendering · ${generation.providerState || 'processing'}`, Math.min(94, 18 + attempt * 2));
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error('Render is still processing after the beta timeout.');
  }

  generateBtn.onclick = async () => {
    if (selectedName() !== LIVE_NAME) {
      setProgress(selectedName() === LATEST_NAME ? 'Ray3.14 is latest in Dream Machine, but its public API identifier is not available yet. Use Ray 3.2 API for a real render.' : 'Select Luma Ray 3.2 API for the current real render.', 0);
      return;
    }

    const prompt = promptInput.value.trim();
    if (prompt.length < 3) return setProgress('Write a prompt before generating.', 0, true);
    const code = betaInput.value.trim();
    output.classList.remove('show');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Submitting securely…';
    setProgress('Sending prompt to Luma Agents API…', 7);

    try {
      const response = await fetch(API_ROOT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-beta-code': code },
        body: JSON.stringify({ prompt, aspectRatio: ratioSelect?.value || '16:9', duration: '5s', resolution: qualitySelect?.value || '720p' }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const generation = (await response.json()).generation;
      if (!generation?.id) throw new Error('Luma did not return a generation ID.');
      setProgress('Render accepted. Ray 3.2 is building the shot…', 14);
      const completed = generation.videoUrl ? generation : await pollGeneration(generation.id, code);
      outputVideo.src = completed.videoUrl;
      outputLink.href = completed.videoUrl;
      output.classList.add('show');
      setProgress('Real Ray 3.2 render complete.', 100);
      output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setProgress(error instanceof Error ? error.message : 'Generation failed.', 0, true);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate real Ray 3.2 video';
    }
  };

  fetch('/api/models', { cache: 'no-store' }).then(response => response.json()).then(({ models = [] }) => {
    const luma = models.find(model => model.provider === 'luma');
    const pill = liveCard.querySelector('.live-pill');
    if (!pill) return;
    pill.textContent = luma?.status === 'live' ? 'LIVE' : 'KEY NEEDED';
    if (luma?.status !== 'live') pill.style.background = '#ffdc86';
  }).catch(() => {});

  syncMode();
})();
