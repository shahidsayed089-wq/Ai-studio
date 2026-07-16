export function toolIdentity(tool) {
  return `${tool?.name || ''} ${tool?.title || ''}`.toLowerCase();
}

export function toolText(tool) {
  let schema = '';
  try { schema = JSON.stringify(tool?.inputSchema || {}); } catch { schema = ''; }
  return `${toolIdentity(tool)} ${tool?.description || ''} ${schema}`.toLowerCase();
}

function compact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function exactToolMatch(tool, expected) {
  const name = compact(tool?.name);
  const title = compact(tool?.title);
  return name === expected || title === expected;
}

export function isVideoTool(tool) {
  return exactToolMatch(tool, 'generatevideo');
}

export function isImageTool(tool) {
  return exactToolMatch(tool, 'generateimage');
}

export function selectGenerationTool(tools, kind, requestedName = '') {
  const test = kind === 'image' ? isImageTool : isVideoTool;
  const wanted = String(requestedName || '').trim();
  if (wanted) {
    const exact = tools.find(tool => tool.name === wanted && test(tool));
    if (exact) return exact;
  }
  return tools.find(test) || null;
}
