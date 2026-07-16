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
    if (window.innerWidth > 900 || !sidebar?.classList.contains('open')) return;
    if (!sidebar.contains(event.target) && event.target !== menuButton) closeSidebar();
  });

  sidebar?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));

  function runSearch(value) {
    const query = String(value || '').trim().toLowerCase();
    const cards = [...document.querySelectorAll('[data-search-card]')];
    const sections = [...document.querySelectorAll('[data-search-section]')];

    cards.forEach(card => {
      const haystack = `${card.dataset.searchCard || ''} ${card.textContent || ''}`.toLowerCase();
      card.dataset.hidden = query && !haystack.includes(query) ? 'true' : 'false';
    });

    sections.forEach(section => {
      const sectionCards = [...section.querySelectorAll('[data-search-card]')];
      section.dataset.hidden = query && sectionCards.length && sectionCards.every(card => card.dataset.hidden === 'true') ? 'true' : 'false';
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
      if (document.activeElement === search) search.blur();
      closeSidebar();
    }
  });

  async function loadStatus() {
    const label = $('homeStatusText');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const ready = Boolean(data.checks?.seedance2Api || data.ok || data.status === 'ok');
      if (label) label.textContent = ready ? 'Yagna live' : 'Studio online';
    } catch {
      if (label) label.textContent = 'Studio online';
    }
  }

  async function loadWallet() {
    try {
      const response = await fetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.wallet) throw new Error('Wallet unavailable');

      const rawBalance = Number(data.wallet.balance || 0);
      const formatted = rawBalance.toLocaleString();
      const sideCredits = $('sideCredits');
      if (sideCredits) sideCredits.textContent = `${formatted} credits`;

      const progress = $('creditProgress');
      if (progress) {
        const cap = Math.max(Number(data.wallet.limit || 30000), rawBalance, 1);
        progress.style.width = `${Math.max(4, Math.min(100, (rawBalance / cap) * 100))}%`;
      }
    } catch {
      const sideCredits = $('sideCredits');
      if (sideCredits) sideCredits.textContent = 'Studio credits';
    }
  }

  const heroArt = document.querySelector('.hero-art img');
  if (heroArt && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('pointermove', event => {
      if (window.innerWidth < 901) return;
      const x = (event.clientX / window.innerWidth - 0.5) * 8;
      const y = (event.clientY / window.innerHeight - 0.5) * 5;
      heroArt.style.transform = `scale(1.06) translate(${x}px, ${y}px)`;
    }, { passive: true });
  }

  loadStatus();
  loadWallet();
})();
