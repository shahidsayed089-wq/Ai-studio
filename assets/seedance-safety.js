(() => {
  const input = document.getElementById('seedanceBetaCode');
  if (!input) return;

  const container = input.closest('.seedance-beta');
  const label = container?.querySelector('label');
  const hint = container?.querySelector('.seedance-hint');
  const generateButton = document.getElementById('generateBtn');
  const storageKey = 'aiStudioBetaCode';

  if (label) label.textContent = 'Private launch code · NOT your API key';
  input.placeholder = 'Enter a short launch code';
  if (hint) {
    hint.innerHTML = '<b style="color:#ffdc86">Never paste an API key here.</b> The Seedance key belongs only in Cloudflare as the secret <code>SEEDANCE2_API_KEY</code>.';
  }

  function looksLikeApiKey(value) {
    const text = String(value || '').trim();
    return text.length > 32 || /^(sk-|sd-|seedance_|api[_-]?key|bearer\s)/i.test(text) || /[A-Za-z0-9_-]{40,}/.test(text);
  }

  function clearSuspectedKey(showWarning = true) {
    if (!looksLikeApiKey(input.value)) return false;
    input.value = '';
    localStorage.removeItem(storageKey);
    input.setCustomValidity('API keys cannot be entered here. Add it to Cloudflare as SEEDANCE2_API_KEY.');
    input.reportValidity();
    if (showWarning) {
      window.alert('Security stop: this box accepts only a short launch code, not the Seedance API key. The suspected key was removed from this browser.');
    }
    return true;
  }

  clearSuspectedKey(false);

  input.addEventListener('input', () => {
    input.setCustomValidity('');
    if (looksLikeApiKey(input.value)) clearSuspectedKey(true);
  }, true);

  generateButton?.addEventListener('click', event => {
    if (clearSuspectedKey(true)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
