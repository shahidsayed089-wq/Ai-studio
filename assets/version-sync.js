(() => {
  const latest = {
    'ChatGPT': ['Creative direction, storyboards and prompt intelligence', '4 credits'],
    'Veo 3.1': ['Google cinematic generation with native audio workflows', '24 credits'],
    'Sora': ['OpenAI story motion and cinematic world generation', '20 credits'],
    'Seedance 2.0': ['ByteDance multimodal video creation with rich references', '16 credits'],
    'Kling 3.0': ['Kuaishou cinematic consistency and character motion', '14 credits'],
    'Wan 2.7': ['Alibaba next-generation video with stronger motion and control', '12 credits'],
    'Hailuo 2.3': ['MiniMax latest high-motion video generation', '13 credits'],
    'HappyHorse 1.1': ['Alibaba premium cinematic video and character motion', '18 credits'],
    'Grok Imagine 1.5': ['xAI concept exploration for images and motion', '9 credits']
  };

  const style = document.createElement('style');
  style.textContent = `.a-happy{background:linear-gradient(135deg,#160d25,#8f255d 46%,#ffb23f)}.a-happy .portrait{color:#ffd36a;background:linear-gradient(180deg,#ffe8a6,#ff6a70 46%,#24112f)}.a-happy .visor{color:#69fff1}.a-happy .ring{color:#ffd56a}.sync-badge{color:var(--cyan);font-weight:700}`;
  document.head.appendChild(style);

  const featured = document.querySelector('.featured');
  if (featured) featured.innerHTML = [
    ['GP','ChatGPT'],['VO','Veo 3.1'],['SO','Sora'],['SD','Seedance 2.0'],['KL','Kling 3.0'],
    ['WA','Wan 2.7'],['HA','Hailuo 2.3'],['HH','HappyHorse 1.1'],['GR','Grok Imagine 1.5']
  ].map(([code,name]) => `<div class="featured-row"><span class="mini-logo">${code}</span>${name}</div>`).join('');

  const wan = [...document.querySelectorAll('.model-card')].find(c => /Wan 2\.2|Wan 2\.7/.test(c.dataset.name || ''));
  if (wan) {
    wan.dataset.name = 'Wan 2.7';
    wan.querySelector('.card-title b').textContent = 'Wan 2.7';
    wan.querySelector('.company').textContent = 'Alibaba next-gen video model';
    wan.querySelector('.tags').innerHTML = '<span>Video</span><span>Motion</span><span>Flexible</span>';
    wan.querySelector('.card-foot').innerHTML = '<span>Next-gen creation</span><span class="credits-pill">12 credits</span>';
  }

  const hailuo = [...document.querySelectorAll('.model-card')].find(c => /Hailuo 02|Hailuo 2\.3/.test(c.dataset.name || ''));
  if (hailuo) {
    hailuo.dataset.name = 'Hailuo 2.3';
    hailuo.querySelector('.card-title b').textContent = 'Hailuo 2.3';
    hailuo.querySelector('.card-title small').textContent = 'LATEST';
    hailuo.querySelector('.company').textContent = 'MiniMax latest video engine';
    hailuo.querySelector('.card-foot').innerHTML = '<span>High-motion realism</span><span class="credits-pill">13 credits</span>';
  }

  if (![...document.querySelectorAll('.model-card')].some(c => c.dataset.name === 'HappyHorse 1.1')) {
    const card = document.createElement('article');
    card.className = 'model-card';
    card.dataset.name = 'HappyHorse 1.1';
    card.dataset.tags = 'video audio character';
    card.innerHTML = `<div class="art a-happy"><div class="gridlines"></div><div class="portrait"></div><div class="visor"></div><div class="ring"></div><span class="art-label">TOP RANKED</span><button class="fav">♡</button></div><div class="card-body"><div class="card-title"><b>HappyHorse 1.1</b><small>NEWEST</small></div><div class="company">Alibaba cinematic intelligence</div><div class="tags"><span>Video</span><span>Audio</span><span>Character</span></div><div class="card-foot"><span>Premium motion quality</span><span class="credits-pill">18 credits</span></div></div>`;
    const grok = [...document.querySelectorAll('.model-card')].find(c => c.dataset.name === 'Grok Imagine 1.5');
    (grok?.parentNode || document.querySelector('.cards'))?.insertBefore(card, grok || null);
  }

  const sortline = document.querySelector('.sortline');
  if (sortline && !sortline.textContent.includes('Version sync')) sortline.innerHTML = `Version sync: <b>July 2026</b><span>|</span>${sortline.innerHTML}`;

  document.querySelectorAll('.model-card').forEach(old => old.replaceWith(old.cloneNode(true)));
  const cards = [...document.querySelectorAll('.model-card')];
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');
  const close = () => { drawer?.classList.remove('show'); backdrop?.classList.remove('show'); };
  const open = card => {
    cards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const name = card.dataset.name;
    const info = latest[name] || ['Latest creative model', '12 credits'];
    document.getElementById('drawerModel').textContent = name;
    document.getElementById('bannerModel').textContent = name;
    document.getElementById('bannerCopy').textContent = info[0];
    document.getElementById('costText').textContent = info[1];
    drawer?.classList.add('show'); backdrop?.classList.add('show');
  };
  cards.forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('.fav')) open(card); });
    const fav = card.querySelector('.fav');
    fav?.addEventListener('click', e => { e.stopPropagation(); fav.classList.toggle('on'); fav.textContent = fav.classList.contains('on') ? '♥' : '♡'; });
  });
  const closeBtn = document.getElementById('closeDrawer'); if (closeBtn) closeBtn.onclick = close;
  if (backdrop) backdrop.onclick = close;

  const chips = [...document.querySelectorAll('.chip')];
  chips.forEach(ch => ch.onclick = () => {
    chips.forEach(x => x.classList.remove('active')); ch.classList.add('active');
    const f = ch.dataset.filter;
    cards.forEach(c => c.style.display = (f === 'all' || (c.dataset.tags || '').includes(f)) ? '' : 'none');
  });
  const search = document.getElementById('searchInput');
  search?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    cards.forEach(c => c.style.display = (c.dataset.name || '').toLowerCase().includes(q) ? '' : 'none');
  });

  const more = document.getElementById('viewMore');
  if (more) {
    more.textContent = 'Latest Models Loaded';
    more.onclick = () => {
      more.textContent = 'Lineup synced ✓'; more.disabled = true;
      setTimeout(() => { more.textContent = 'More models coming'; more.disabled = false; }, 1600);
    };
  }
})();
