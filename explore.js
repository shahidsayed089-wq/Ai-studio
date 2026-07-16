(() => {
  navigator.serviceWorker?.getRegistrations?.().then(items => items.forEach(item => item.unregister())).catch(() => {});

  const $ = id => document.getElementById(id);
  const hero = [
    {
      scene: 'scene-city',
      eyebrow: 'YAGNA ORIGINAL · MOTION',
      title: 'Build worlds that feel filmed, not generated.',
      copy: 'Direct cinematic motion, atmosphere and performance through one connected creative system.',
      action: 'Create a video',
      kind: 'video',
    },
    {
      scene: 'scene-desert',
      eyebrow: 'DIRECTOR MODE · REFERENCE',
      title: 'A single frame can become an entire sequence.',
      copy: 'Start from a reference, preserve the visual language and shape the next shot with precise direction.',
      action: 'Direct a sequence',
      kind: 'video',
    },
    {
      scene: 'scene-portrait',
      eyebrow: 'YAGNA STILL · CHARACTER',
      title: 'Create images with identity, texture and intent.',
      copy: 'Move from campaign stills to cinematic character frames without leaving your production universe.',
      action: 'Create an image',
      kind: 'image',
    },
  ];

  let heroIndex = 0;
  function renderHero(index) {
    const item = hero[index % hero.length];
    const visual = $('heroScene');
    if (visual) visual.className = `scene ${item.scene}`;
    if ($('heroEyebrow')) $('heroEyebrow').innerHTML = `<i></i>${item.eyebrow}`;
    if ($('heroTitle')) $('heroTitle').textContent = item.title;
    if ($('heroCopy')) $('heroCopy').textContent = item.copy;
    const action = $('heroAction');
    if (action) {
      action.textContent = item.action;
      action.href = `/create.html?kind=${item.kind}`;
    }
  }

  function label(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  function polishedName(model) {
    const text = String(model?.name || model?.id || '').trim();
    if (/^(video auto|auto video|auto_video)$/i.test(text)) return 'Yagna Motion Auto';
    if (/^(image auto|auto image|auto_image)$/i.test(text)) return 'Yagna Image Auto';
    return text || 'Connected Engine';
  }

  function renderEngines(models) {
    const rail = $('engineRail');
    if (!rail || !models.length) return;
    rail.innerHTML = '';
    models.slice(0, 8).forEach((model, index) => {
      const card = document.createElement('a');
      card.className = 'engine-card';
      card.href = `/create.html?kind=${model.kind === 'image' ? 'image' : 'video'}&model=${encodeURIComponent(model.id || '')}`;
      card.innerHTML = `<div class="engine-art"></div><div class="engine-info"><b></b><p></p><div class="engine-meta"><span></span><strong>Open engine</strong></div></div>`;
      card.querySelector('b').textContent = polishedName(model);
      card.querySelector('p').textContent = model.kind === 'image' ? 'Cinematic stills, references and visual development.' : 'Motion synthesis for directed cinematic sequences.';
      card.querySelector('.engine-meta span').textContent = model.kind === 'image' ? 'Image engine' : 'Video engine';
      card.style.setProperty('--card-index', index);
      rail.appendChild(card);
    });
  }

  async function loadCatalog() {
    const status = $('connectionText');
    try {
      const response = await fetch('/api/higgsfield/catalog', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Catalog unavailable');
      const models = Array.isArray(data.models) ? data.models : [];
      if (status) status.textContent = 'Studio connected';
      renderEngines(models);
      const forgeCopy = $('forgeCopy');
      if (forgeCopy && Number(data.totalMcpTools || 0) > 0) {
        forgeCopy.textContent = `${Number(data.totalMcpTools)} connected creative capabilities, organized behind one original Yagna interface.`;
      }
    } catch {
      if (status) status.textContent = 'Explore mode';
    }
  }

  document.querySelectorAll('[data-create-kind]').forEach(element => {
    element.addEventListener('click', () => {
      location.href = `/create.html?kind=${element.dataset.createKind}`;
    });
  });

  document.querySelectorAll('[data-next-hero]').forEach(button => {
    button.addEventListener('click', () => {
      heroIndex = (heroIndex + 1) % hero.length;
      renderHero(heroIndex);
    });
  });

  renderHero(0);
  window.setInterval(() => {
    heroIndex = (heroIndex + 1) % hero.length;
    renderHero(heroIndex);
  }, 7500);
  loadCatalog();
})();