export function toolIdentity(tool) {
  return `${tool?.name || ''} ${tool?.title || ''}`.toLowerCase();
}

export function toolText(tool) {
  let schema = '';
  try { schema = JSON.stringify(tool?.inputSchema || {}); } catch { schema = ''; }
  return `${toolIdentity(tool)} ${tool?.description || ''} ${schema}`.toLowerCase();
}

function isStatusOnly(tool) {
  const identity = toolIdentity(tool);
  return /status|recover|recovery|result|progress|history|list|cancel/.test(identity)
    && !/generate|create/.test(identity);
}

export function isVideoTool(tool) {
  const identity = toolIdentity(tool);
  const text = toolText(tool);
  const generator = /generate[_ -]?video|create[_ -]?video|video[_ -]?generation|text[_ -]?to[_ -]?video|image[_ -]?to[_ -]?video/.test(identity)
    || (/\bvideo generation\b/.test(text) && /\b(generate|create)\b/.test(identity));
  return generator && !isStatusOnly(tool);
}

export function isImageTool(tool) {
  const identity = toolIdentity(tool);
  const text = toolText(tool);
  const generator = /generate[_ -]?image|create[_ -]?image|image[_ -]?generation|text[_ -]?to[_ -]?image/.test(identity)
    || (/\bimage generation\b/.test(text) && /\b(generate|create)\b/.test(identity));
  return generator && !isStatusOnly(tool);
}

export function selectGenerationTool(tools, kind, requestedName = '') {
  const test = kind === 'image' ? isImageTool : isVideoTool;
  const wanted = String(requestedName || '').trim();
  if (wanted) {
    const exact = tools.find(tool => tool.name === wanted && test(tool));
    if (exact) return exact;
  }
  const candidates = tools.filter(test);
  const score = tool => {
    const identity = toolIdentity(tool);
    const text = toolText(tool);
    let value = 0;
    if (kind === 'video' && /^generate[_-]?video$/i.test(tool.name || '')) value += 120;
    if (kind === 'image' && /^generate[_-]?image$/i.test(tool.name || '')) value += 120;
    if (/^generate/.test(String(tool.name || '').toLowerCase())) value += 40;
    if (/marketing|clipper|youtube|avatar|product/.test(identity)) value -= 30;
    if (/general|universal|creation/.test(text)) value += 5;
    return value;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0] || null;
}
