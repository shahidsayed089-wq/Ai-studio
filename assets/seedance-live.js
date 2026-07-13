(() => {
  const MODEL_NAME = 'Seedance 2.0';
  const MODEL_ID = 'seedance-2-0';
  const API_ROOT = '/api/seedance';

  const style = document.createElement('style');
  style.textContent = `
    .seedance-live-card{border-color:rgba(95,245,181,.68)!important;box-shadow:0 0 0 1px rgba(95,245,181,.16),0 0 28px rgba(95,245,181,.1)}
    .seedance-live-card.selected{border-color:var(--good)!important;box-shadow:0 0 0 1px var(--good),0 0 24px rgba(95,245,181,.42),0 18px 48px rgba(0,0,0,.46)!important}
    .seedance-live-pill{font-size:9px!important;color:#03130d!important;background:var(--good)!important;border-color:var(--good)!important;font-weight:900!important;box-shadow:0 0 14px rgba(95,245,181,.38)}
    .seedance-key-pill{font-size:9px!important;color:#1c1100!important;background:var(--gold)!important;border-color:var(--gold)!important;font-weight:900!important}
    .seedance-beta{display:none;margin:15px 0 0;padding:13px;border:1px solid rgba(95,245,181,.24);border-radius:11px;background:rgba(95,245,181,.055)}
    .seedance-beta.show{display:block}.seedance-beta label{display:block;color:#b9c8c5;font-size:11px;margin-bottom:7px}.seedance-beta input{width:100%;height:41px;border:1px solid var(--line2);border-radius:9px;background:#0d1112;color:#fff;padding:0 12px;outline:none}.seedance-beta input:focus{border-color:var(--good);box-shadow:0 0 0 3px rgba(95,245,181,.09)}
    .seedance-hint{margin-top:7px;color:#7f908d;font-size:10px;line-height:1.45}.seedance-note{display:none;margin:10px 0 0;color:#93a6a2;font-size:10px;line-height:1.5}.seedance-note.show{display:block}.seedance-note b{color:var(--good)}
    .seedance-output{display:none;margin-top:16px;border:1px solid rgba(8,240,227,.28);border-radius:12px;overflow:hidden;background:#050707}.seedance-output.show{display:block}.seedance-output video{display:block;width:100%;max-height:430px;background:#000}.seedance-output-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px}.seedance-output-actions span{font-size:11px;color:var(--good);font-weight:800}.seedance-output-actions a{color:#041310;background:var(--cyan);border-radius:8px;padding:8px 12px;text-decoration:none;font-size:11px;font-weight:900}.seedance-expiry{padding:0 12px 11px;color:#80908d;font-size:10px}
    @media(max-width:620px){.seedance-beta{margin-top:12px}.seedance-output video{max-height:54vh}}
  `;
  document.head.appendChild(style);

  const original = [...document.querySelectorAll('.model-card')].find(card => card.dataset.name === MODEL_NAME);
  if (!original) return;
  original.classList.add('seedance-live-card');
  original.dataset.tags = `${original.dataset.tags || ''} live`.trim();
  const badge = original.querySelector('.card-title small');
  if (badge) {
    badge.className = 'seedance-key-pill';
    badge.textContent = 'CHECKING';
  }
  const artLabel = original.querySelector('.art-label');
  if (artLabel) artLabel.textContent = 'REAL API';
  const company = original.querySelector('.company');
  if (company) company.textContent = 'Seedance2.ai third-party API gateway';
  const tags = original.querySelector('.tags');
  if (tags) tags.innerHTML = '<span>Text to video</span><span>Audio</span><span>5 sec beta</span>';
  const foot = original.querySelector('.card-foot');
  if (foot) foot.innerHTML = '<span>First flagship engine</span><span class="credits-pill">60 provider credits</span>';

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

  const generateRow = document.querySelector('.generate-row');
  const beta = document.createElement('div');
  beta.className = 'seedance-beta';
  beta.innerHTML = '<label for="seedanceBetaCode">Private beta access code</label><input id="seedanceBetaCode" type="password" autocomplete="off" placeholder="Enter launch code"><div class="seedance-hint">Your Seedance API key never enters the browser. It remains a server-side secret.</div>';
  generateRow?.before(beta);
  const betaInput = beta.querySelector('input');
  betaInput.value = localStorage.getItem('aiStudioBetaCode') || '';
  betaInput.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', betaInput.value.trim()));

  const note = document.createElement('p');
  note.className = 'seedance-note';
  note.innerHTML = '<b>Live beta:</b> Real Seedance 2.0, five seconds, 720p, native audio enabled. The provider reserves credits on submit and refunds failed tasks.';
  generateRow?.after(note);

  const output = document.createElement('div');
  output.className = 'seedance-output';
  output.innerHTML = '<video controls playsinline></video><div class="seedance-output-actions"><span>REAL SEEDANCE RENDER</span><a target="_blank" rel="noopener">Open video</a></div><div class="seedance-expiry"></div>';
  progressBox?.after(output);
  const video = output.querySelector('video');
  const link = output.querySelector('a');
  const expiry = output.querySelector('.seedance-expiry');

  const previousGenerate = generateBtn.onclick;

  function isSelected() {
    return (drawerModel?.textContent || '').trim() === MODEL_NAME;
  }

  function setProgress(message, percent, isError = false) {
    progressBox?.classList.add('show');
    if (progressText) {
      progressText.textContent = message;
      progressText.style.color = isError ? '#ff8e9a' : '';
    }
    if (progressPct) progressPct.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  function syncMode() {
    const live = isSelected();
    beta.classList.toggle('show', live);
    note.classList.toggle('show', live);
    if (!live) output.classList.remove('show');
    if (durationSelect) {
      durationSelect.disabled = live;
      if (live) durationSelect.selectedIndex = 0;
    }
    if (qualitySelect && live) {
      qualitySelect.disabled = true;
      const option = [...qualitySelect.options].find(item => item.value === '720p' || item.textContent === 'Fast');
      if (option) qualitySelect.value = option.value;
    } else if (qualitySelect) {
      qualitySelect.disabled = false;
    }
    if (live) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate real Seedance video';
    }
  }

  original.addEventListener('click', event => {
    if (event.target.closest('.fav')) return;
    setTimeout(() => {
      if (drawerModel) drawerModel.textContent = MODEL_NAME;
      if (bannerModel) bannerModel.textContent = MODEL_NAME;
      if (bannerCopy) bannerCopy.textContent = 'Real audio-video generation through Seedance2.ai API';
      if (costText) costText.textContent = '60 provider credits · 5s · 720p';
      syncMode();
    }, 0);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('.model-card')) setTimeout(syncMode, 1);
  });

  async function readError(response) {
    const payload = await response.json().catch(() => ({}));
    return payload.message || payload.error?.message || payload.error || `Request failed (${response.status})`;
  }

  async function poll(id, code) {
    for (let attempt = 1; attempt <= 90; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const response = await fetch(`${API_ROOT}/tasks/${encodeURIComponent(id)}`, {
        headers: { 'x-beta-code': code },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation || {};
      if (generation.status === 'completed' && generation.videoUrl) return generation;
      if (generation.status === 'failed') throw new Error(generation.failureReason || 'Seedance could not complete this render. Provider credits should be refunded.');
      const percent = Math.min(93, 15 + attempt * 2);
      setProgress(`Seedance is ${generation.providerState || 'generating'} · ${generation.billingStatus || 'credits reserved'}`, percent);
    }
    throw new Error('Render is still processing. Keep the page open and check again shortly.');
  }

  generateBtn.onclick = async event => {
    if (!isSelected()) {
      if (typeof previousGenerate === 'function') return previousGenerate.call(generateBtn, event);
      return;
    }

    const prompt = promptInput.value.trim();
    if (prompt.length < 3) {
      setProgress('Write a prompt before generating.', 0, true);
      return;
    }

    const code = betaInput.value.trim();
    output.classList.remove('show');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Submitting securely…';
    setProgress('Reserving credits with Seedance…', 6);

    try {
      const response = await fetch(`${API_ROOT}/generations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-beta-code': code,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          prompt,
          aspectRatio: ratioSelect?.value || '16:9',
          resolution: '720p',
          generateAudio: true,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation;
      if (!generation?.id) throw new Error('Seedance did not return a task ID.');

      setProgress(`Task accepted · ${generation.credits ?? 60} credits reserved`, 14);
      const completed = await poll(generation.id, code);
      video.src = completed.videoUrl;
      link.href = completed.videoUrl;
      expiry.textContent = completed.videoExpiresAt
        ? `Provider link expires ${new Date(completed.videoExpiresAt).toLocaleString()}. Save the output before then.`
        : 'Save the completed output because provider links may expire.';
      output.classList.add('show');
      setProgress(`Real render complete${completed.processingTime ? ` in ${completed.processingTime}s` : ''}.`, 100);
      output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setProgress(error instanceof Error ? error.message : 'Seedance generation failed.', 0, true);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate real Seedance video';
    }
  };

  fetch('/api/health', { cache: 'no-store' })
    .then(response => response.json())
    .then(payload => {
      const ready = Boolean(payload.checks?.seedance2Api);
      if (badge) {
        badge.className = ready ? 'seedance-live-pill' : 'seedance-key-pill';
        badge.textContent = ready ? 'LIVE' : 'KEY NEEDED';
      }
    })
    .catch(() => {
      if (badge) badge.textContent = 'CHECK';
    });
})();
