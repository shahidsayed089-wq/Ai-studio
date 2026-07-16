(() => {
  const $ = id => document.getElementById(id);

  async function loadStatus() {
    const status = $('homeStatusText');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const ready = Boolean(data.checks?.seedance2Api || data.ok);
      if (status) status.textContent = ready ? 'Yagna online' : 'Studio ready';
      document.body.classList.toggle('provider-ready', ready);
    } catch {
      if (status) status.textContent = 'Studio ready';
    }
  }

  async function loadWallet() {
    try {
      const response = await fetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.wallet) return;
      const balance = Number(data.wallet.balance || 0).toLocaleString();
      if ($('homeCredits')) $('homeCredits').textContent = `${balance} credits`;
    } catch {}
  }

  function installHeroMotion() {
    const hero = document.querySelector('.hero');
    const panels = [...document.querySelectorAll('.mosaic-panel img')];
    if (!hero || !panels.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    hero.addEventListener('pointermove', event => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = hero.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        panels.forEach((image, index) => {
          const strength = 5 + (index % 3) * 2;
          image.style.transform = `scale(1.06) translate(${x * strength}px, ${y * strength}px)`;
        });
      });
    });

    hero.addEventListener('pointerleave', () => {
      panels.forEach(image => { image.style.transform = 'scale(1.03)'; });
    });
  }

  function revealOnScroll() {
    const items = [...document.querySelectorAll('.hub-card,.project-card,.monitor')];
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.animate([
          { opacity: 0, transform: 'translateY(24px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    items.forEach(item => observer.observe(item));
  }

  loadStatus();
  loadWallet();
  installHeroMotion();
  revealOnScroll();
})();