(() => {
  function applyDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem('yagnaDraft') || 'null'); } catch { draft = null; }
    if (!draft || !draft.savedAt || Date.now() - Number(draft.savedAt) > 30 * 60 * 1000) return;

    const prompt = document.getElementById('prompt');
    if (prompt && typeof draft.prompt === 'string' && draft.prompt.trim()) {
      prompt.value = draft.prompt.trim();
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const aspect = document.getElementById('aspect');
    if (aspect && draft.aspectRatio && [...aspect.options].some(option => option.value === draft.aspectRatio)) {
      aspect.value = draft.aspectRatio;
      aspect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const duration = document.getElementById('duration');
    if (duration && draft.duration && [...duration.options].some(option => Number(option.value) === Number(draft.duration))) {
      duration.value = String(draft.duration);
      duration.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (draft.mode === 'image') document.querySelector('[data-kind="image"]')?.click();
    if (draft.mode && draft.mode !== 'image') document.querySelector('[data-kind="video"]')?.click();

    localStorage.removeItem('yagnaDraft');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(applyDraft, 300));
  else setTimeout(applyDraft, 300);
})();