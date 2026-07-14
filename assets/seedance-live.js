(() => {
  const MODEL_NAME = 'Seedance 2.0';
  const API_ROOT = '/api/seedance';
  const MAX = { image: 9, video: 3, audio: 3, total: 12, videoSeconds: 15, audioSeconds: 15 };
  const MODELS = {
    'seedance-2-0': {
      label: 'Seedance 2.0 Standard',
      resolutions: ['480p', '720p', '1080p', '4k'],
      rates: {
        '480p': { plain: 6, video: 4 },
        '720p': { plain: 12, video: 8 },
        '1080p': { plain: 30, video: 20 },
        '4k': { plain: 70, video: 40 },
      },
    },
    'seedance-2-0-fast': {
      label: 'Seedance 2.0 Fast',
      resolutions: ['480p', '720p'],
      rates: {
        '480p': { plain: 5, video: 3 },
        '720p': { plain: 10, video: 6 },
      },
    },
    'seedance-2-0-mini': {
      label: 'Seedance 2.0 Mini',
      resolutions: ['480p', '720p'],
      rates: {
        '480p': { plain: 3, video: 2 },
        '720p': { plain: 6, video: 4 },
      },
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
    .seedance-media{cursor:default!important;padding:14px!important;text-align:left!important}
    .seedance-media-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.seedance-media-head strong{font-size:14px;color:#effffc}.seedance-media-head small{color:#7f918d;font-size:9px;text-align:right;line-height:1.45}
    .seedance-adds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.seedance-add{height:42px;border:1px solid var(--line2);border-radius:9px;background:#0b1011;color:#dffefa;font-size:11px;font-weight:800}.seedance-add:hover{border-color:var(--cyan);background:rgba(8,240,227,.05)}.seedance-add:disabled{opacity:.45;cursor:not-allowed}
    .seedance-counters{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.seedance-counter{padding:5px 8px;border:1px solid var(--line2);border-radius:99px;color:#91a39f;font-size:9px}.seedance-counter b{color:#e7faf7}
    .seedance-previews{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:11px}.seedance-preview{position:relative;border:1px solid var(--line2);border-radius:9px;overflow:hidden;background:#090c0d;min-height:96px}.seedance-preview img{display:block;width:100%;height:108px;object-fit:cover}.seedance-preview .media-placeholder{height:78px;display:flex;align-items:center;justify-content:center;font-size:28px;background:linear-gradient(135deg,#0c1516,#112328)}.seedance-preview span{display:block;padding:7px 8px;color:#aab7b4;font-size:9px;line-height:1.35}.seedance-preview button{position:absolute;top:6px;right:6px;width:27px;height:27px;border:1px solid rgba(255,255,255,.3);border-radius:50%;background:rgba(0,0,0,.72);color:#fff}.seedance-preview code{color:var(--cyan);font-size:9px}
    .seedance-output{display:none;margin-top:16px;border:1px solid rgba(8,240,227,.28);border-radius:12px;overflow:hidden;background:#050707}.seedance-output.show{display:block}.seedance-output video{display:block;width:100%;max-height:430px;background:#000}.seedance-output-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px}.seedance-output-actions span{font-size:11px;color:var(--good);font-weight:800}.seedance-output-actions a{color:#041310;background:var(--cyan);border-radius:8px;padding:8px 12px;text-decoration:none;font-size:11px;font-weight:900}.seedance-expiry{padding:0 12px 11px;color:#80908d;font-size:10px}
    @media(max-width:620px){.controls.seedance-controls{grid-template-columns:1fr 1fr}.seedance-adds{grid-template-columns:1fr}.seedance-previews{grid-template-columns:1fr 1fr}.seedance-preview img{height:92px}}
  `;
  document.head.appendChild(style);

  const card = [...document.querySelectorAll('.model-card')].find(item => item.dataset.name === MODEL_NAME);
  if (!card) return;
  card.classList.add('seedance-live-card');
  card.dataset.tags = `${card.dataset.tags || ''} live multimodal`.trim();
  const badge = card.querySelector('.card-title small');
  if (badge) { badge.className = 'seedance-key-pill'; badge.textContent = 'CHECKING'; }
  const artLabel = card.querySelector('.art-label');
  if (artLabel) artLabel.textContent = 'MULTIMODAL API';
  const company = card.querySelector('.company');
  if (company) company.textContent = 'Seedance2.ai API · Image / Video / Audio';
  const tags = card.querySelector('.tags');
  if (tags) tags.innerHTML = '<span>9 images</span><span>3 videos</span><span>3 audios</span>';
  const foot = card.querySelector('.card-foot');
  if (foot) foot.innerHTML = '<span>12 materials total</span><span class="credits-pill">4–15 sec</span>';

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
  const existingModelField = document.getElementById('seedanceModel')?.closest('.field');
  existingModelField?.remove();
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
  document.querySelectorAll('.seedance-beta,.seedance-note,.seedance-output').forEach(node => node.remove());
  const beta = document.createElement('div');
  beta.className = 'seedance-beta';
  beta.innerHTML = '<label for="seedanceBetaCode">Private launch code · NOT your API key</label><input id="seedanceBetaCode" type="password" autocomplete="off" placeholder="Enter a short launch code"><div class="seedance-hint">The provider API key remains only in Cloudflare as <code>SEEDANCE2_API_KEY</code>.</div>';
  generateRow?.before(beta);
  const betaInput = beta.querySelector('input');
  betaInput.value = localStorage.getItem('aiStudioBetaCode') || '';
  betaInput.addEventListener('input', () => localStorage.setItem('aiStudioBetaCode', betaInput.value.trim()));

  const note = document.createElement('p');
  note.className = 'seedance-note';
  note.innerHTML = '<b>Reference mode:</b> up to 9 images, 3 MP4 videos (15s combined), and 3 MP3 audios (15s combined), maximum 12 files. Use tags such as @image1, @video1 and @audio1 in your prompt.';
  generateRow?.after(note);

  const output = document.createElement('div');
  output.className = 'seedance-output';
  output.innerHTML = '<video controls playsinline></video><div class="seedance-output-actions"><span>REAL SEEDANCE RENDER</span><a target="_blank" rel="noopener">Open video</a></div><div class="seedance-expiry"></div>';
  progressBox?.after(output);
  const outputVideo = output.querySelector('video');
  const outputLink = output.querySelector('a');
  const expiry = output.querySelector('.seedance-expiry');

  upload.className = `${upload.className} seedance-media`;
  upload.innerHTML = `
    <div class="seedance-media-head"><strong>Multimodal references</strong><small>MP4 video · MP3 audio<br>R2 secured uploads</small></div>
    <div class="seedance-adds">
      <button type="button" class="seedance-add" data-kind="image">＋ Add Image</button>
      <button type="button" class="seedance-add" data-kind="video">＋ Add Video</button>
      <button type="button" class="seedance-add" data-kind="audio">＋ Add Audio</button>
    </div>
    <div class="seedance-counters"></div>
    <div class="seedance-previews"></div>
  `;
  const counters = upload.querySelector('.seedance-counters');
  const previews = upload.querySelector('.seedance-previews');
  const inputs = {
    image: Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true }),
    video: Object.assign(document.createElement('input'), { type: 'file', accept: 'video/mp4', multiple: true }),
    audio: Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/mpeg,.mp3', multiple: true }),
  };
  Object.values(inputs).forEach(input => { input.hidden = true; upload.appendChild(input); });

  const assets = [];
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

  function byKind(kind) {
    return assets.filter(asset => asset.kind === kind);
  }

  function durationTotal(kind) {
    return byKind(kind).reduce((sum, asset) => sum + Number(asset.duration || 0), 0);
  }

  function currentModel() {
    return MODELS[modelSelect.value] || MODELS['seedance-2-0'];
  }

  function modeName() {
    const images = byKind('image').length;
    const videos = byKind('video').length;
    const audios = byKind('audio').length;
    if (!assets.length) return 'text-to-video';
    if (!videos && !audios && images <= 2) return 'image-to-video';
    return 'reference-to-video';
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
    const resolution = qualitySelect.value.toLowerCase();
    const outputSeconds = Number(durationSelect.value || 5);
    const videoSeconds = durationTotal('video');
    const rate = model.rates[resolution] || { plain: 0, video: 0 };
    return Math.ceil((videoSeconds ? rate.video : rate.plain) * (outputSeconds + videoSeconds));
  }

  function updateEstimate() {
    if (!isSelected()) return;
    const videoSeconds = durationTotal('video');
    const audioSeconds = durationTotal('audio');
    if (costText) costText.textContent = `${estimateCredits()} est. credits · ${durationSelect.value}s · ${qualitySelect.value} · ${modeName()}${videoSeconds ? ` · ${videoSeconds.toFixed(1)}s video refs` : ''}${audioSeconds ? ` · ${audioSeconds.toFixed(1)}s audio refs` : ''}`;
  }

  function renderCounters() {
    counters.innerHTML = `
      <span class="seedance-counter"><b>${byKind('image').length}</b>/9 images</span>
      <span class="seedance-counter"><b>${byKind('video').length}</b>/3 videos · ${durationTotal('video').toFixed(1)}/15s</span>
      <span class="seedance-counter"><b>${byKind('audio').length}</b>/3 audios · ${durationTotal('audio').toFixed(1)}/15s</span>
      <span class="seedance-counter"><b>${assets.length}</b>/12 total</span>
    `;
    upload.querySelector('[data-kind="image"]').disabled = byKind('image').length >= MAX.image || assets.length >= MAX.total;
    upload.querySelector('[data-kind="video"]').disabled = byKind('video').length >= MAX.video || assets.length >= MAX.total || durationTotal('video') >= MAX.videoSeconds;
    upload.querySelector('[data-kind="audio"]').disabled = byKind('audio').length >= MAX.audio || assets.length >= MAX.total || durationTotal('audio') >= MAX.audioSeconds;
  }

  function tagFor(asset) {
    return `@${asset.kind}${byKind(asset.kind).indexOf(asset) + 1}`;
  }

  function renderPreviews() {
    previews.innerHTML = '';
    assets.forEach(asset => {
      const item = document.createElement('div');
      item.className = 'seedance-preview';
      const visual = asset.kind === 'image'
        ? `<img src="${asset.url}" alt="Reference image">`
        : `<div class="media-placeholder">${asset.kind === 'video' ? '🎞️' : '🎵'}</div>`;
      item.innerHTML = `${visual}<button type="button" aria-label="Remove reference">×</button><span><code>${tagFor(asset)}</code> · ${asset.filename}${asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ''}</span>`;
      item.querySelector('button').onclick = () => {
        const index = assets.indexOf(asset);
        if (index >= 0) assets.splice(index, 1);
        renderPreviews();
        renderCounters();
        updateEstimate();
      };
      previews.appendChild(item);
    });
    renderCounters();
  }

  function readDuration(file) {
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
      const url = URL.createObjectURL(file);
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        const duration = Number(media.duration || 0);
        URL.revokeObjectURL(url);
        Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error(`Could not read duration for ${file.name}.`));
      };
      media.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Could not read ${file.name}. Use MP4 video or MP3 audio.`));
      };
      media.src = url;
    });
  }

  async function uploadFile(file, kind, duration) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/uploads/media', {
      method: 'POST',
      headers: { 'x-beta-code': betaInput.value.trim() },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `Upload failed (${response.status})`);
    return { ...payload.asset, kind, duration };
  }

  async function handleFiles(kind, fileList) {
    const availableCount = Math.min(MAX[kind] - byKind(kind).length, MAX.total - assets.length);
    const files = [...fileList].slice(0, availableCount);
    if (!files.length) return;
    setProgress(`Preparing ${files.length} ${kind} reference${files.length > 1 ? 's' : ''}…`, 2);
    try {
      for (const file of files) {
        const duration = await readDuration(file);
        if (kind === 'video' && durationTotal('video') + duration > MAX.videoSeconds) throw new Error('Reference videos can total at most 15 seconds.');
        if (kind === 'audio' && durationTotal('audio') + duration > MAX.audioSeconds) throw new Error('Reference audios can total at most 15 seconds.');
        setProgress(`Uploading ${file.name} securely to R2…`, 3);
        assets.push(await uploadFile(file, kind, duration));
        renderPreviews();
      }
      setProgress(`${kind[0].toUpperCase() + kind.slice(1)} references ready.`, 5);
      updateEstimate();
    } catch (error) {
      setProgress(error instanceof Error ? error.message : 'Reference upload failed.', 0, true);
    }
  }

  upload.querySelectorAll('.seedance-add').forEach(button => {
    const kind = button.dataset.kind;
    button.addEventListener('click', event => {
      event.stopPropagation();
      inputs[kind].click();
    });
    inputs[kind].addEventListener('change', () => {
      handleFiles(kind, inputs[kind].files);
      inputs[kind].value = '';
    });
  });
  renderCounters();

  function syncMode() {
    const live = isSelected();
    beta.classList.toggle('show', live);
    note.classList.toggle('show', live);
    modelField.style.display = live ? '' : 'none';
    upload.style.display = '';
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
      if (bannerCopy) bannerCopy.textContent = 'Real multimodal generation with image, video and audio references';
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
    if (byKind('audio').length && !byKind('image').length && !byKind('video').length) {
      setProgress('Audio references need at least one image or video reference.', 0, true);
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
          imageUrls: byKind('image').map(asset => asset.url),
          videoUrls: byKind('video').map(asset => asset.url),
          audioUrls: byKind('audio').map(asset => asset.url),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const generation = payload.generation;
      if (!generation?.id) throw new Error('Seedance did not return a task ID.');

      setProgress(`Task accepted · ${generation.credits ?? estimateCredits()} credits reserved · ${generation.mode}`, 14);
      const completed = await poll(generation.id, code);
      outputVideo.src = completed.videoUrl;
      outputLink.href = completed.videoUrl;
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
