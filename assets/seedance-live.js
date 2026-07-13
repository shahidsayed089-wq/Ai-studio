(() => {
  const MODEL_NAME = 'Seedance 2.0';
  const API_ROOT = '/api/seedance';
  const MODELS = {
    'seedance-2-0': {
      label: 'Seedance 2.0 Standard',
      resolutions: ['480p', '720p', '1080p', '4k'],
      rates: { '480p': 6, '720p': 12, '1080p': 30, '4k': 70 },
    },
    'seedance-2-0-fast': {
      label: 'Seedance 2.0 Fast',
      resolutions: ['480p', '720p'],
      rates: { '480p': 5, '720p': 10 },
    },
    'seedance-2-0-mini': {
      label: 'Seedance 2.0 Mini',
      resolutions: ['480p', '720p'],
      rates: { '480p': 3, '720p': 6 },
    },
  };

  const style = document.createElement('style');
  style.textContent = `
    .seedance-live-card{border-color:rgba(95,245,181,.68)!important;box-shadow:0 0 0 1px rgba(95,245,181,.16),0 0 28px rgba(95,245,181,.1)}
    .seedance-live-card.selected{border-color:var(--good)!important;box-shadow:0 0 0 1px var(--good),0 0 24px rgba(95,245,181,.42),0 18px 48px rgba(0,0,0,.46)!important}
    .seedance-live-pill{font-size:9px!important;color:#03130d!important;background:var(--good)!important;border-color:var(--good)!important;font-weight:900!important;box-shadow:0 0 14px rgba(95,245,181,.38)}
    .seedance-key-pill{font-size:9px!important;color:#1c1100!important;background:var(--gold)!important;border-color:var(--gold)!important;font-weight:900!important}
    .seedance-beta{display:none;margin:15px 0 0;padding:13px;border:1px solid rgba(95,245,181,.24);border-radius:11px;background:rgba(95,245,181,.055)}
    .seedance-beta.show{display:block}.seedance-beta label{display:block;color:#b9c8c5;font-size:11px;margin-bottom:7px}.seedance-beta input{width:100%;height:41px;border:1px solid var(--line2);border-radius:9px;background:#0d1112;color:#fff;padding:0 12px;outline:none}.seedance-beta input:focus{border-color:var(--good);box-shadow:0 0 0 3px rgba(95,245,181,.09)}
    .seedance-hint{margin-top:7px;color:#7f908d;font-size:10px;line-height:1.45}.seedance-note{display:none;margin:10px 0 0;color:#93a6a2;font-size:10px;line-height:1.5}.seedance-note.show{display:block}.seedance-note b{color:var(--good)}
    .controls.seedance-controls{grid-template-columns:repeat(2,minmax(0,1fr))}
    .seedance-upload{cursor:pointer;transition:.2s}.seedance-upload:hover{border-color:var(--cyan)!important;background:rgba(8,240,227,.04)!important}.seedance-upload.busy{pointer-events:none;opacity:.65}
    .seedance-upload strong{display:block;color:#ecfffc;font-size:14px}.seedance-upload small{display:block;margin-top:5px;color:#82928f}.seedance-upload input{display:none}
    .seedance-previews{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:11px}.seedance-preview{position:relative;border:1px solid var(--line2);border-radius:9px;overflow:hidden;background:#090c0d;min-height:88px}.seedance-preview img{display:block;width:100%;height:108px;object-fit:cover}.seedance-preview span{display:block;padding:7px 8px;color:#aab7b4;font-size:9px}.seedance-preview button{position:absolute;top:6px;right:6px;width:27px;height:27px;border:1px solid rgba(255,255,255,.3);border-radius:50%;background:rgba(0,0,0,.72);color:#fff}
    .seedance-output{display:none;margin-top:16px;border:1px solid rgba(8,240,227,.28);border-radius:12px;overflow:hidden;background:#050707}.seedance-output.show{display:block}.seedance-output video{display:block;width:100%;max-height:430px;background:#000}.seedance-output-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px}.seedance-output-actions span{font-size:11px;color:var(--good);font-weight:800}.seedance-output-actions a{color:#041310;background:var(--cyan);border-radius:8px;padding:8px 12px;text-decoration:none;font-size:11px;font-weight:900}.seedance-expiry{padding:0 12px 11px;color:#80908d;font-size:10px}
    @media(max-width:620px){.controls.seedance-controls{grid-template-columns:1fr 1fr}.seedance-beta{margin-top:12px}.seedance-output video{max-height:54vh}.seedance-preview img{height:92px}}
  `;
  document.head.appendChild(style);

  const card = [...document.querySelectorAll('.model-card')].find(item => item.dataset.name === MODEL_NAME);
  if (!card) return;
  card.classList.add('seedance-live-card');
  card.dataset.tags = `${card.dataset.tags || ''} live`.trim();
  const badge = card.querySelector('.card-title small');
  if (badge) { badge.className = 'seedance-key-pill'; badge.textContent = 'CHECKING'; }
  const artLabel = card.querySelector('.art-label');
  if (artLabel) artLabel.textContent = 'REAL API';
  const company = card.querySelector('.company');
  if (company) company.textContent = 'Seedance2.ai API · Standard / Fast / Mini';
  const tags = card.querySelector('.tags');
  if (tags) tags.innerHTML = '<span>Text to video</span><span>Image to video</span><span>4–15 sec</span>';
  const foot = card.querySelector('.card-foot');
  if (foot) foot.innerHTML = '<span>Full live controls</span><span class="credits-pill">15–1050 credits</span>';

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
  const controls = document.querySelector('.controls');
  const selects = [...document.querySelectorAll('.controls select')];
  const ratioSelect = selects[0];
  const durationSelect = selects[1];
  const qualitySelect = selects[2];
  const upload = document.querySelector('.upload');
  if (!drawer || !generateBtn || !promptInput || !controls || !ratioSelect || !durationSelect || !qualitySelect || !upload) return;

  controls.classList.add('seedance-controls');
  const modelField = document.createElement('div');
  modelField.className = 'field seedance-model-field';
  modelField.innerHTML = '<label>Model</label><select id="seedanceModel"></select>';
  controls.prepend(modelField);
  const modelSelect = modelField.querySelector('select');
  Object.entries(MODELS).forEach(([value, meta]) => modelSelect.add(new Option(meta.label, value)));

  durationSelect.innerHTML = '';
  for (let seconds = 4; seconds <= 15; seconds += 1) durationSelect.add(new Option(`${seconds} sec`, String(seconds)));
  durationSelect.value = '5';
  durationSelect.disabled = false;

  const generateRow = document.querySelector('.generate-row');
  const beta = document.createElement('div');
  beta.className = 'seedance-beta';
  beta.innerHTML = '<label for="seedanceBetaCode">Private launch code · NOT your API key</label><input id="seedanceBetaCode" type="password" autocomplete="off" placeholder="Enter a short launch code"><div class="seedance-hint">The provider API key remains only in Cloudflare as <code>SEEDANCE2_API_KEY</code>.</div>';
  generateRow?.before(beta);
  const betaInput = beta.querySelector('input');
  betaInput.value = localStorage.getItem('aiStudioBetaCode') || '';
  betaInput.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', betaInput.value.trim()));

  const note = document.createElement('p');
  note.className = 'seedance-note';
  note.innerHTML = '<b>Live engine:</b> choose Standard, Fast, or Mini; generate 4–15 seconds; add one image for a first frame or two for first and last frames.';
  generateRow?.after(note);

  const output = document.createElement('div');
  output.className = 'seedance-output';
  output.innerHTML = '<video controls playsinline></video><div class="seedance-output-actions"><span>REAL SEEDANCE RENDER</span><a target="_blank" rel="noopener">Open video</a></div><div class="seedance-expiry"></div>';
  progressBox?.after(output);
  const video = output.querySelector('video');
  const link = output.querySelector('a');
  const expiry = output.querySelector('.seedance-expiry');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.multiple = true;
  upload.classList.add('seedance-upload');
  upload.innerHTML = '<strong>＋ Add first / last frame images</strong><small>JPG, PNG, WEBP or GIF · up to 2 images · 12 MB each</small><div class="seedance-previews"></div>';
  upload.appendChild(fileInput);
  const previews = upload.querySelector('.seedance-previews');
  const uploadedImages = [];

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

  function currentModel() {
    return MODELS[modelSelect.value] || MODELS['seedance-2-0'];
  }

  function syncResolutions() {
    const previous = qualitySelect.value.toLowerCase();
    qualitySelect.innerHTML = '';
    currentModel().resolutions.forEach(value => qualitySelect.add(new Option(value === '4k' ? '4K' : value, value)));
    qualitySelect.value = currentModel().resolutions.includes(previous) ? previous : (currentModel().resolutions.includes('720p') ? '720p' : currentModel().resolutions[0]);
    qualitySelect.disabled = false;
    updateEstimate();
  }

  function estimateCredits() {
    const model = currentModel();
    const duration = Number(durationSelect.value || 5);
    const resolution = qualitySelect.value.toLowerCase();
    return (model.rates[resolution] || 0) * duration;
  }

  function updateEstimate() {
    if (!isSelected()) return;
    const mode = uploadedImages.length ? 'image-to-video' : 'text-to-video';
    if (costText) costText.textContent = `${estimateCredits()} provider credits · ${durationSelect.value}s · ${qualitySelect.value} · ${mode}`;
  }

  function renderPreviews() {
    previews.innerHTML = '';
    uploadedImages.forEach((asset, index) => {
      const item = document.createElement('div');
      item.className = 'seedance-preview';
      item.innerHTML = `<img src="${asset.url}" alt="${index === 0 ? 'First frame' : 'Last frame'}"><button type="button" aria-label="Remove image">×</button><span>${index === 0 ? 'FIRST FRAME' : 'LAST FRAME'} · ${asset.filename}</span>`;
      item.querySelector('button').onclick = event => {
        event.stopPropagation();
        uploadedImages.splice(index, 1);
        renderPreviews();
        updateEstimate();
      };
      previews.appendChild(item);
    });
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append('image', file);
    const response = await fetch('/api/uploads/image', {
      method: 'POST',
      headers: { 'x-beta-code': betaInput.value.trim() },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `Upload failed (${response.status})`);
    return payload.asset;
  }

  upload.addEventListener('click', event => {
    if (!isSelected() || event.target.closest('button')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const room = 2 - uploadedImages.length;
    const files = [...fileInput.files].slice(0, room);
    fileInput.value = '';
    if (!files.length) return;
    upload.classList.add('busy');
    setProgress(`Uploading ${files.length} reference image${files.length > 1 ? 's' : ''}…`, 3);
    try {
      for (const file of files) {
        const asset = await uploadImage(file);
        uploadedImages.push(asset);
        renderPreviews();
      }
      setProgress('Reference image ready for Seedance.', 5);
      updateEstimate();
    } catch (error) {
      setProgress(error instanceof Error ? error.message : 'Image upload failed.', 0, true);
    } finally {
      upload.classList.remove('busy');
    }
  });

  function syncMode() {
    const live = isSelected();
    beta.classList.toggle('show', live);
    note.classList.toggle('show', live);
    modelField.style.display = live ? '' : 'none';
    upload.style.display = live ? '' : '';
    if (!live) output.classList.remove('show');
    durationSelect.disabled = false;
    qualitySelect.disabled = false;
    if (live) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate real Seedance video';
      updateEstimate();
    }
  }

  card.addEventListener('click', event => {
    if (event.target.closest('.fav')) return;
    setTimeout(() => {
      if (drawerModel) drawerModel.textContent = MODEL_NAME;
      if (bannerModel) bannerModel.textContent = MODEL_NAME;
      if (bannerCopy) bannerCopy.textContent = 'Real text-to-video and image-to-video through Seedance2.ai API';
      syncMode();
    }, 0);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('.model-card')) setTimeout(syncMode, 1);
  });
  modelSelect.addEventListener('change', syncResolutions);
  durationSelect.addEventListener('change', updateEstimate);
  qualitySelect.addEventListener('change', updateEstimate);
  ratioSelect.addEventListener('change', updateEstimate);
  syncResolutions();

  async function readError(response) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload.requiredCredits != null && payload.availableCredits != null
      ? ` Required ${payload.requiredCredits}, available ${payload.availableCredits}.`
      : '';
    return `${payload.message || payload.error?.message || payload.error || `Request failed (${response.status})`}${detail}`;
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
        headers: { 'content-type': 'application/json', 'x-beta-code': code },
        body: JSON.stringify({
          model: modelSelect.value,
          prompt,
          aspectRatio: ratioSelect.value || '16:9',
          duration: Number(durationSelect.value || 5),
          resolution: qualitySelect.value || '720p',
          generateAudio: true,
          imageUrls: uploadedImages.map(asset => asset.url),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation;
      if (!generation?.id) throw new Error('Seedance did not return a task ID.');

      setProgress(`Task accepted · ${generation.credits ?? estimateCredits()} credits reserved`, 14);
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
    .catch(() => { if (badge) badge.textContent = 'CHECK'; });
})();