(() => {
  const frame = document.getElementById('muapiFrame');
  const loading = document.getElementById('loadingCard');
  const fallback = document.getElementById('frameFallback');
  let loaded = false;

  const finish = () => {
    loaded = true;
    loading?.classList.add('hidden');
  };

  frame?.addEventListener('load', () => {
    window.setTimeout(finish, 700);
  });

  window.setTimeout(() => {
    loading?.classList.add('hidden');
    if (!loaded) fallback?.classList.add('attention');
  }, 6500);
})();