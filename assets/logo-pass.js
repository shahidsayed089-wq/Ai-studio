(() => {
  const icons = {
    'ChatGPT':'<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.7a4.8 4.8 0 0 1 4.1 2.3 4.8 4.8 0 0 1 5.7 5.7 4.8 4.8 0 0 1 0 6.6 4.8 4.8 0 0 1-5.7 5.7 4.8 4.8 0 0 1-8.2 0 4.8 4.8 0 0 1-5.7-5.7 4.8 4.8 0 0 1 0-6.6A4.8 4.8 0 0 1 8 5 4.8 4.8 0 0 1 12 2.7Z" stroke="currentColor" stroke-width="1.65"/><path d="m8.5 7.1 7 4v7.6m0-1.8-7-4V5.3m0 1.8 7 4 4-2.3M8.5 12.9l-4 2.3m11-4.1-7 4-4-2.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    'Veo 3.1':'<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 5h4.3L12 15.2 16.2 5h4.3L14 20h-4L3.5 5Z" fill="currentColor"/><circle cx="19.2" cy="18.2" r="1.7" fill="var(--cyan)"/></svg>',
    'Sora':'<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="3.5" width="15" height="17" rx="6.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="2.15" fill="var(--cyan)"/></svg>',
    'Seedance 2.0':'<svg viewBox="0 0 24 24" fill="none"><path d="M5 17.4c0-3.5 2.7-5.7 6.2-5.7h2.1c2.1 0 3.4-1 3.4-2.7 0-1.8-1.5-2.8-3.7-2.8-2 0-3.8.8-5.6 2.4L5.1 6.2C7.4 4 10 2.9 13.2 2.9c4.7 0 7.8 2.4 7.8 6.2 0 3.7-2.8 5.9-6.8 5.9h-1.8c-2 0-3.1.9-3.1 2.5 0 .9.4 1.7 1 2.5l-3 1.2A5.2 5.2 0 0 1 5 17.4Z" fill="currentColor"/></svg>',
    'Kling 3.0':'<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 3.5v17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m18.8 3.8-9 8.2 9 8.2" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/><path d="m13.4 8.6 5.4-4.8" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round"/></svg>',
    'Wan 2.7':'<svg viewBox="0 0 24 24" fill="none"><path d="M3 5.2 7 19l5-9.1 5 9.1 4-13.8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9.9" r="1.45" fill="var(--cyan)"/></svg>',
    'Hailuo 2.3':'<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5v17M18 3.5v17M6 12h12" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"/><circle cx="12" cy="12" r="2.35" fill="var(--cyan)"/></svg>',
    'HappyHorse 1.1':'<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 20V9.4L9 5.8h5c2.9 0 5.2 2.2 5.2 5 0 2.7-2.1 4.8-4.8 5H11V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10c.4-1.7 1.7-3 3.5-3.6M15.9 8.7l2.2-2.1" stroke="var(--cyan)" stroke-width="1.75" stroke-linecap="round"/><circle cx="14.3" cy="10.1" r=".9" fill="currentColor"/></svg>',
    'Grok Imagine 1.5':'<svg viewBox="0 0 24 24" fill="none"><path d="M16 5.3A8.1 8.1 0 1 0 20.2 12h-7.4" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"/><path d="m13.4 9.2 6.4-6.3M13.5 14.8 19 20.2" stroke="var(--cyan)" stroke-width="2.05" stroke-linecap="round"/></svg>'
  };
  const order = Object.keys(icons);
  const mark = (name, compact=false) => `<span class="model-logo${compact?' compact':''}" data-logo="${name}">${icons[name]||icons.Sora}<span>${name}</span></span>`;
  const style = document.createElement('style');
  style.textContent = `.model-logo{display:inline-flex;align-items:center;gap:8px;min-width:0;color:#eefaf8;line-height:1}.model-logo svg{display:block;width:19px;height:19px;flex:none;filter:drop-shadow(0 0 8px rgba(8,240,227,.15))}.model-logo>span{font-size:14px;font-weight:820;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.model-logo.compact{width:27px;height:27px;display:inline-grid;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(8,240,227,.06));box-shadow:inset 0 0 14px rgba(8,240,227,.04)}.model-logo.compact svg{width:16px;height:16px}.model-logo.compact>span{display:none}.card-title{align-items:center}.card-title .model-logo{max-width:calc(100% - 52px)}.model-card:hover .model-logo svg,.model-card.selected .model-logo svg{color:var(--cyan);filter:drop-shadow(0 0 9px rgba(8,240,227,.5))}.featured{gap:7px}.featured-row{min-height:34px;padding:4px 6px;border-radius:8px}.featured-row:hover{background:rgba(8,240,227,.07);color:#fff}.featured-row .model-logo{gap:9px}.featured-row .model-logo>span{display:block;font-size:12px}.studio-logo{display:inline-flex;align-items:center;gap:10px}.studio-logo svg{width:28px;height:28px;color:var(--cyan);filter:drop-shadow(0 0 12px rgba(8,240,227,.42))}.studio-logo-copy{display:inline-flex;gap:5px;align-items:baseline}.drawer-logo{display:inline-flex;align-items:center;margin:0 4px}.selected-title{display:flex;align-items:center;gap:11px}.selected-title .model-logo.compact{width:38px;height:38px;border-radius:11px;border-color:rgba(8,240,227,.3)}.selected-title .model-logo.compact svg{width:22px;height:22px}.provider-ribbon{display:flex;gap:7px;overflow-x:auto;padding-top:10px;scrollbar-width:none}.provider-ribbon::-webkit-scrollbar{display:none}@media(max-width:720px){.model-logo>span{font-size:12.5px}.card-title .model-logo{gap:6px}.card-title .model-logo svg{width:17px;height:17px}.studio-logo{gap:7px}.studio-logo svg{width:23px;height:23px}}`;
  document.head.appendChild(style);

  const brand = document.querySelector('.brand');
  if (brand) brand.innerHTML = `<span class="studio-logo"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2.8 19.2 12l9.2 3.2-9.2 3.2L16 27.6l-3.2-9.2-9.2-3.2 9.2-3.2L16 2.8Z" fill="currentColor"/><circle cx="16" cy="15.2" r="4" fill="#071010"/><circle cx="16" cy="15.2" r="1.8" fill="#fff"/></svg><span class="studio-logo-copy">Shazan <em>AI Studio</em></span></span>`;

  document.querySelectorAll('.model-card').forEach(card => {
    const name = card.dataset.name;
    if (!icons[name]) return;
    const title = card.querySelector('.card-title');
    const old = title?.querySelector('b');
    if (old) old.outerHTML = mark(name);
  });

  const featured = document.querySelector('.featured');
  if (featured) featured.innerHTML = order.map(name => `<div class="featured-row">${mark(name)}</div>`).join('');

  const drawerTitle = document.querySelector('.drawer-head h2');
  if (drawerTitle && !document.getElementById('drawerLogoIcon')) drawerTitle.insertAdjacentHTML('afterbegin', '<span class="drawer-logo" id="drawerLogoIcon"></span>');

  const banner = document.querySelector('.selected-banner > div');
  if (banner && !document.getElementById('bannerLogoIcon')) {
    const h3 = banner.querySelector('#bannerModel');
    if (h3) {
      const wrap = document.createElement('div'); wrap.className = 'selected-title';
      const icon = document.createElement('span'); icon.id = 'bannerLogoIcon';
      h3.parentNode.insertBefore(wrap,h3); wrap.append(icon,h3);
      banner.insertAdjacentHTML('beforeend', `<div class="provider-ribbon">${order.map(n=>mark(n,true)).join('')}</div>`);
    }
  }

  const setLogo = name => {
    const drawerIcon = document.getElementById('drawerLogoIcon'); if (drawerIcon) drawerIcon.innerHTML = mark(name,true);
    const bannerIcon = document.getElementById('bannerLogoIcon'); if (bannerIcon) bannerIcon.innerHTML = mark(name,true);
  };
  setLogo('Sora');
  document.querySelectorAll('.model-card').forEach(card => card.addEventListener('click', e => { if (!e.target.closest('.fav')) setLogo(card.dataset.name); }));
})();
