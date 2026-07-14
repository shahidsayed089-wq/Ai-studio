(() => {
  const PROVIDER_CREDITS_PER_STUDIO_CREDIT = 45;

  function toStudioCredits(providerCredits) {
    const value = Number(providerCredits);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.max(1, Math.ceil(value / PROVIDER_CREDITS_PER_STUDIO_CREDIT));
  }

  function convertCostText(node) {
    if (!node) return;
    const text = node.textContent || '';
    const match = text.match(/([\d,.]+)\s+provider credits/i);
    if (!match) return;
    const providerCredits = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(providerCredits)) return;
    const studioCredits = toStudioCredits(providerCredits);
    node.textContent = text.replace(match[0], `${studioCredits} Studio credit${studioCredits === 1 ? '' : 's'}`);
    node.dataset.providerCredits = String(providerCredits);
    node.title = `${providerCredits} upstream provider credits`;
  }

  function convertProgressText(node) {
    if (!node) return;
    const text = node.textContent || '';
    const match = text.match(/([\d,.]+)\s+credits reserved/i);
    if (!match) return;
    const providerCredits = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(providerCredits)) return;
    const studioCredits = toStudioCredits(providerCredits);
    node.textContent = text.replace(match[0], `${studioCredits} Studio credit${studioCredits === 1 ? '' : 's'} reserved`);
    node.dataset.providerCredits = String(providerCredits);
    node.title = `${providerCredits} upstream provider credits reserved`;
  }

  function addExplanation(costText) {
    if (!costText || document.getElementById('studioCreditInfo')) return;
    const info = document.createElement('div');
    info.id = 'studioCreditInfo';
    info.style.cssText = 'margin-top:5px;color:#71817e;font-size:9px;line-height:1.45';
    info.textContent = 'AI Studio uses compact billing units. 1 Studio credit covers up to 45 upstream provider credits.';
    costText.insertAdjacentElement('afterend', info);
  }

  function sync() {
    const costText = document.getElementById('costText');
    const progressText = document.getElementById('progressText');
    convertCostText(costText);
    convertProgressText(progressText);
    addExplanation(costText);
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  sync();

  window.AIStudioCredits = Object.freeze({
    providerCreditsPerStudioCredit: PROVIDER_CREDITS_PER_STUDIO_CREDIT,
    toStudioCredits,
  });
})();
