(() => {
  const replacements = [
    [/\best\. credits\b/gi, 'est. Seedance2.ai API credits'],
    [/\bprovider credits\b/gi, 'Seedance2.ai API credits'],
    [/\bcredits reserved\b/gi, 'Seedance2.ai API credits reserved'],
  ];

  function relabel(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const targets = [node, ...node.querySelectorAll?.('#costText,#progressText,.credits-pill,.wallet-disclosure') || []];
    for (const target of targets) {
      if (!(target instanceof HTMLElement)) continue;
      let text = target.textContent || '';
      let next = text;
      for (const [pattern, value] of replacements) next = next.replace(pattern, value);
      if (next !== text) target.textContent = next;
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      relabel(record.target instanceof Element ? record.target : record.target.parentElement);
      record.addedNodes.forEach(added => relabel(added instanceof Element ? added : added.parentElement));
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  relabel(document.body);
})();
