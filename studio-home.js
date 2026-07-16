(() => {
  const $ = id => document.getElementById(id);
  const sidebar = $('sidebar');
  const menuButton = $('menuButton');
  const search = $('globalSearch');

  function closeSidebar() {
    sidebar?.classList.remove('open');
  }

  menuButton?.addEventListener('click', event => {
    event.stopPropagation();
    sidebar?.classList.toggle('open');
  });

  document.addEventListener('click', event => {
    if (window.innerWidth > 760 || !sidebar?.classList.contains('open')) return;
    if (!sidebar.contains(event.target) && event.target !== menuButton) closeSidebar();
  });

  sidebar?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));

  function runSearch(value) {
    const query = String(value || '').trim().toLowerCase();
    document.querySelectorAll('[data-search-card]').forEach(card => {
      const text = `${card.dataset.searchCard || ''} ${card.textContent || ''}`.toLowerCase();
      card.dataset.hidden = query && !text.includes(query) ? 'true' : 'false';
    });
    document.querySelectorAll('[data-search-section]').forEach(section => {
      const cards = [...section.querySelectorAll('[data-search-card]')];
      section.dataset.hidden = query && cards.length && cards.every(card => card.dataset.hidden === 'true') ? 'true' : 'false';
    });
  }

  search?.addEventListener('input', () => runSearch(search.value));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search?.focus();
      search?.select();
    }
    if (event.key === 'Escape') {
      search?.blur();
      closeSidebar();
    }
  });

  async function loadStatus() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const ready = Boolean(data.checks?.seedance2Api || data.ok || data.status === 'ok');
      if ($('homeStatusText')) $('homeStatusText').textContent = ready ? 'Yagna live' : 'Studio online';
    } catch {
      if ($('homeStatusText')) $('homeStatusText').textContent = 'Studio online';
    }
  }

  async function loadWallet() {
    try {
      const response = await fetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.wallet) throw new Error('wallet unavailable');
      const balance = Number(data.wallet.balance || 0);
      if ($('sideCredits')) $('sideCredits').textContent = `${balance.toLocaleString()} credits`;
      if ($('creditProgress')) {
        const cap = Math.max(Number(data.wallet.limit || 30000), balance, 1);
        $('creditProgress').style.width = `${Math.max(4, Math.min(100, balance / cap * 100))}%`;
      }
    } catch {
      if ($('sideCredits')) $('sideCredits').textContent = 'Studio credits';
    }
  }

  const heroImage = document.querySelector('.hero-visual img');
  if (heroImage && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('pointermove', event => {
      if (window.innerWidth < 900) return;
      const x = (event.clientX / innerWidth - .5) * 7;
      const y = (event.clientY / innerHeight - .5) * 4;
      heroImage.style.transform = `scale(1.06) translate(${x}px,${y}px)`;
    }, { passive: true });
  }

  loadStatus();
  loadWallet();
})();
