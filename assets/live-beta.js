(() => {
  const MODEL_NAME = 'Luma Ray 2';
  const MODEL_ID = 'ray-2';
  const API_ROOT = '/api/live/generations';
  const lumaIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.9"/><path d="M7.3 14.9c2.6-5.5 6.3-8 10.8-7.4-1.9 5.7-5.5 8.7-10.8 9.1" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round"/><circle cx="14.8" cy="9.1" r="1.35" fill="currentColor"/></svg>';

  const style = document.createElement('style');
  style.textContent = `
    .live-model-card{border-color:rgba(95,245,181,.62)!important;box-shadow:0 0 0 1px rgba(95,245,181,.16),0 0 28px rgba(95,245,181,.08)}
    .live-model-card.selected{border-color:var(--good)!important;box-shadow:0 0 0 1px var(--good),0 0 22px rgba(95,245,181,.4),0 18px 48px rgba(0,0,0,.45)!important}
    .live-pill{font-size:9px!important;color:#03130d!important;background:var(--good)!important;border-color:var(--good)!important;font-weight:900!important;box-shadow:0 0 14px rgba(95,245,181,.38)}
    .luma-art{background:radial-gradient(circle at 66% 30%,rgba(255,255,255,.75) 0 2%,transparent 4%),radial-gradient(circle at 50% 46%,#8bfff2 0 8%,#23b6b2 25%,#153969 48%,#0b1028 72%)}
    .luma-art .luma-moon{position:absolute;width:88px;height:88px;border-radius:50%;left:50%;top:48%;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 34px rgba(89,255,239,.52),inset -18px -15px 28px rgba(4,9,34,.72)}
    .luma-art .luma-arc{position:absolute;width:124px;height:46px;border:7px solid #5ff5b5;border-top-color:transparent;border-left-color:transparent;border-radius:50%;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-18deg);filter:drop-shadow(0 0 12px rgba(95,245,181,.8))}
    .beta-access{margin:15px 0 0;padding:13px;border:1px solid rgba(95,245,181,.22);border-radius:11px;background:rgba(95,245,181,.055)}
    .beta-access label{display:block;color:#b9c8c5;font-size:11px;margin-bottom:7px}
    .beta-access input{width:100%;height:41px;border:1px solid var(--line2);border-radius:9px;background:#0d1112;color:#fff;padding:0 12px;outline:none}
    .beta-access input:focus{border-color:var(--good);box-shadow:0 0 0 3px rgba(95,245,181,.09)}
    .beta-hint{margin-top:7px;color:#7f908d;font-size:10px;line-height:1.45}
    .live-output{display:none;margin-top:16px;border:1px solid rgba(8,240,227,.25);border-radius:12px;overflow:hidden;background:#050707}
    .live-output.show{display:block}
    .live-output video{display:block;width:100%;max-height:430px;background:#000}
    .live-output-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px}
    .live-output-actions span{font-size:11px;color:var(--good);font-weight:800}
    .live-output-actions a{color:#041310;background:var(--cyan);border-radius:8px;padding:8px 12px;text-decoration:none;font-size:11px;font-weight:900}
    .live-beta-note{margin:10px 0 0;color:#93a6a2;font-size:10px;line-height:1.5}
    .live-beta-note b{color:var(--good)}
    .mini-logo.luma-mini{background:linear-gradient(145deg,#b6fff6,#5ff5b5);color:#04130f}
    .logo-lockup.luma-lockup svg{width:19px;height:19px;color:#f3fffd}
    .logo-lockup.luma-lockup .wm{font-size:14px;font-weight:850;letter-spacing:-.035em}
    @media(max-width:620px){.beta-access{margin-top:12px}.live-output video{max-height:54vh}}
  `;
  document.head.appendChild(style);

  const cardsContainer = document.querySelector('.cards');
  if (!cardsContainer) return;

  let card = [...document.querySelectorAll('.model-card')].find(c => c.dataset.name === MODEL_NAME);
  if (!card) {
    card = document.createElement('article');
    card.className = 'model-card live-model-card';
    card.dataset.name = MODEL_NAME;
    card.dataset.tags = 'video fast live';
    card.innerHTML = `
      <div class="art luma-art"><div class="gridlines"></div><div class="luma-moon"></div><div class="luma-arc"></div><span class="art-label">REAL API</span><button class="fav" aria-label="Favourite">♡</button></div>
      <div class="card-body"><div class="card-title"><div class="logo-lockup luma-lockup">${lumaIcon}<span class="wm">${MODEL_NAME}</span></div><small class="live-pill" id="lumaLivePill">CHECKING</small></div><div class="company">Luma Dream Machine API</div><div class="tags"><span>Text to video</span><span>5 sec beta</span><span>Real output</span></div><div class="card-foot"><span>First live engine</span><span class="credits-pill">metered API</span></div></div>`;
    const sora = [...document.querySelectorAll('.model-card')].find(c => c.dataset.name === 'Sora');
    if (sora?.nextSibling) cardsContainer.insertBefore(card, sora.nextSibling);
    else cardsContainer.prepend(card);
  }

  const featured = document.querySelector('.featured');
  if (featured && ![...featured.children].some(el => el.textContent.includes(MODEL_NAME))) {
    const row = document.createElement('div');
    row.className = 'featured-row';
    row.innerHTML = '<span class="mini-logo luma-mini">LU</span>Luma Ray 2 <b style="margin-left:auto;color:var(--good);font-size:9px">LIVE</b>';
    featured.prepend(row);
  }

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

  if (!drawer || !generateBtn || !promptInput) return;

  const betaAccess = document.createElement('div');
  betaAccess.className = 'beta-access';
  betaAccess.innerHTML = '<label for="betaAccessCode">Private beta access code</label><input id="betaAccessCode" type="password" autocomplete="off" placeholder="Enter launch code"><div class="beta-hint">The code stays in this browser. Provider keys remain encrypted on the server.</div>';
  const generateRow = document.querySelector('.generate-row');
  generateRow?.before(betaAccess);
  const betaInput = betaAccess.querySelector('input');
  betaInput.value = localStorage.getItem('aiStudioBetaCode') || '';
  betaInput.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', betaInput.value.trim()));

  const betaNote = document.createElement('p');
  betaNote.className = 'live-beta-note';
  betaNote.innerHTML = '<b>Live beta:</b> Ray 2 creates a real five-second clip. Longer durations stay locked until cost controls are proven.';
  generateRow?.after(betaNote);

  const output = document.createElement('div');
  output.className = 'live-output';
  output.innerHTML = '<video controls playsinline></video><div class="live-output-actions"><span>REAL RENDER COMPLETE</span><a target="_blank" rel="noopener">Open video</a></div>';
  document.querySelector('.progressbox')?.after(output);
  const outputVideo = output.querySelector('video');
  const outputLink = output.querySelector('a');

  function setProgress(message, percent) {
    progressBox?.classList.add('show');
    if (progressText) progressText.textContent = message;
    if (progressPct) progressPct.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  function setError(message) {
    setProgress(message, 0);
    if (progressText) progressText.style.color = '#ff8e9a';
  }

  function resetProgressColour() {
    if (progressText) progressText.style.color = '';
  }

  function isLumaSelected() {
    return drawerModel?.textContent.trim() === MODEL_NAME;
  }

  function syncDrawerMode() {
    const live = isLumaSelected();
    betaAccess.style.display = live ? '' : 'none';
    betaNote.style.display = live ? '' : 'none';
    output.classList.remove('show');
    if (durationSelect) {
      durationSelect.disabled = live;
      if (live) durationSelect.selectedIndex = 0;
    }
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = live ? 'Generate real Luma video' : 'Model coming next';
    }
  }

  function openLuma() {
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    if (drawerModel) drawerModel.textContent = MODEL_NAME;
    if (bannerModel) bannerModel.innerHTML = `<span class="logo-lockup luma-lockup">${lumaIcon}<span class="wm">${MODEL_NAME}</span></span>`;
    if (bannerCopy) bannerCopy.textContent = 'Live text-to-video generation through the Luma API';
    if (costText) costText.textContent = 'live metered render';
    drawer.classList.add('show');
    backdrop?.classList.add('show');
    syncDrawerMode();
  }

  card.addEventListener('click', event => {
    if (event.target.closest('.fav')) return;
    openLuma();
  });
  card.querySelector('.fav')?.addEventListener('click', event => {
    event.stopPropagation();
    const fav = event.currentTarget;
    fav.classList.toggle('on');
    fav.textContent = fav.classList.contains('on') ? '♥' : '♡';
  });

  document.addEventListener('click', event => {
    if (event.target.closest('.model-card') && !event.target.closest('.live-model-card')) {
      setTimeout(syncDrawerMode, 0);
    }
  });

  async function readError(response) {
    const payload = await response.json().catch(() => ({}));
    return payload.message || payload.error || `Request failed (${response.status})`;
  }

  async function pollGeneration(id, code) {
    for (let attempt = 1; attempt <= 180; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}`, {
        headers: { 'x-beta-code': code },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation || {};
      if (generation.status === 'completed' && generation.videoUrl) return generation;
      if (generation.status === 'failed') throw new Error(generation.failureReason || 'The provider could not complete this render.');
      const percent = Math.min(92, 14 + attempt * 2);
      setProgress(`Luma is rendering · ${generation.providerState || 'dreaming'}`, percent);
    }
    throw new Error('Render is still processing. Keep this page open and try status again shortly.');
  }

  generateBtn.onclick = async () => {
    if (!isLumaSelected()) {
      setProgress('This model is next in the integration queue. Select Luma Ray 2 for a real render.', 0);
      return;
    }

    const code = betaInput.value.trim();
    const prompt = promptInput.value.trim();
    if (prompt.length < 3) {
      setError('Write a prompt before generating.');
      return;
    }

    resetProgressColour();
    output.classList.remove('show');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Submitting securely…';
    setProgress('Sending prompt to the live Luma API…', 7);

    try {
      const response = await fetch(API_ROOT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-beta-code': code,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          prompt,
          aspectRatio: ratioSelect?.value || '16:9',
          duration: '5s',
          resolution: qualitySelect?.value || '720p',
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation;
      if (!generation?.id) throw new Error('Provider did not return a generation ID.');

      setProgress('Render accepted. Luma is dreaming…', 14);
      const completed = generation.videoUrl ? generation : await pollGeneration(generation.id, code);
      outputVideo.src = completed.videoUrl;
      outputLink.href = completed.videoUrl;
      output.classList.add('show');
      setProgress('Real render complete.', 100);
      output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Generation failed.');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate real Luma video';
    }
  };

  fetch('/api/models', { cache: 'no-store' })
    .then(response => response.json())
    .then(({ models = [] }) => {
      const luma = models.find(model => model.provider === 'luma');
      const pill = card.querySelector('#lumaLivePill');
      if (!pill) return;
      pill.textContent = luma?.status === 'live' ? 'LIVE' : 'KEY NEEDED';
      if (luma?.status !== 'live') pill.style.background = '#ffdc86';
    })
    .catch(() => {});

  syncDrawerMode();
})();
