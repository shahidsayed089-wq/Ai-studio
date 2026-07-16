(() => {
  const $ = id => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[data-mode]')];
  let mode = 'video';

  function setMode(next) {
    mode = next;
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === next));
    const prompt = $('homePrompt');
    const generate = $('homeGenerate');
    const model = $('homeModel');
    const duration = $('homeDurationWrap');
    const placeholders = {
      video: 'Describe the scene, camera movement, lighting, performance and atmosphere…',
      image: 'Describe the image, character, composition, lighting and visual style…',
      character: 'Describe the character, face, wardrobe, personality and world…',
      audio: 'Describe the voice, music, mood, tempo or sound design…',
      director: 'Describe the story, scenes, pacing and final film you want to create…',
    };
    if (prompt) prompt.placeholder = placeholders[next] || placeholders.video;
    if (generate) generate.textContent = next === 'video' ? 'Generate video' : next === 'image' ? 'Generate image' : `Open ${next}`;
    if (duration) duration.hidden = next !== 'video';
    if (model) {
      model.innerHTML = '';
      const options = next === 'video'
        ? [['seedance-2-0','Seedance 2.0'],['seedance-2-0-fast','Seedance 2.0 Fast'],['seedance-2-0-mini','Seedance 2.0 Mini']]
        : next === 'image'
          ? [['image-auto','Image Studio'],['gpt-image-2','GPT Image 2'],['seedream','Seedream']]
          : [[`${next}-studio`,`${next[0].toUpperCase()}${next.slice(1)} Studio`]];
      options.forEach(([value,label]) => model.add(new Option(label,value)));
    }
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  const prompt = $('homePrompt');
  prompt?.addEventListener('input', () => {
    const counter = $('homePromptCount');
    if (counter) counter.textContent = `${prompt.value.length}/6000`;
  });

  $('homeComposer')?.addEventListener('submit', event => {
    event.preventDefault();
    const text = prompt?.value.trim() || '';
    if (text.length < 3) {
      prompt?.focus();
      return;
    }
    const draft = {
      mode,
      prompt: text,
      model: $('homeModel')?.value || '',
      aspectRatio: $('homeAspect')?.value || '9:16',
      duration: Number($('homeDuration')?.value || 5),
      savedAt: Date.now(),
    };
    localStorage.setItem('yagnaDraft', JSON.stringify(draft));
    location.href = `/create.html?kind=${mode === 'image' ? 'image' : 'video'}&draft=1`;
  });

  document.querySelectorAll('[data-open-mode]').forEach(card => {
    card.addEventListener('click', event => {
      event.preventDefault();
      const next = card.dataset.openMode || 'video';
      localStorage.setItem('yagnaDraft', JSON.stringify({ mode: next, prompt: '', savedAt: Date.now() }));
      location.href = `/create.html?kind=${next === 'image' ? 'image' : 'video'}&draft=1`;
    });
  });

  async function loadStatus() {
    const statusText = $('homeStatusText');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const ready = Boolean(data.checks?.seedance2Api);
      if (statusText) statusText.textContent = ready ? 'Seedance live' : 'Studio online';
      document.body.classList.toggle('provider-ready', ready);
    } catch {
      if (statusText) statusText.textContent = 'Studio online';
    }
  }

  async function loadWallet() {
    try {
      const response = await fetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.wallet) return;
      const balance = Number(data.wallet.balance || 0).toLocaleString();
      if ($('homeCredits')) $('homeCredits').textContent = `${balance} credits`;
      if ($('sideCredits')) $('sideCredits').textContent = balance;
    } catch {}
  }

  setMode('video');
  loadStatus();
  loadWallet();
})();