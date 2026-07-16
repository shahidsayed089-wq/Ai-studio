const PROTECTED_RESOURCE_URL = 'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'follow',
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    body,
    preview: body ? null : text.slice(0, 240),
  };
}

function metadataCandidates(server) {
  const base = String(server || '').replace(/\/$/, '');
  return [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];
}

async function discoverAuthorizationServer(server) {
  const attempts = [];
  for (const url of metadataCandidates(server)) {
    try {
      const result = await fetchJson(url);
      attempts.push({ url, status: result.status, ok: result.ok });
      if (result.ok && result.body) {
        const body = result.body;
        return {
          server,
          metadataUrl: result.url,
          issuer: body.issuer || null,
          authorizationEndpoint: body.authorization_endpoint || null,
          tokenEndpoint: body.token_endpoint || null,
          deviceAuthorizationEndpoint: body.device_authorization_endpoint || null,
          registrationEndpoint: body.registration_endpoint || null,
          scopesSupported: Array.isArray(body.scopes_supported) ? body.scopes_supported : [],
          grantTypesSupported: Array.isArray(body.grant_types_supported) ? body.grant_types_supported : [],
          codeChallengeMethodsSupported: Array.isArray(body.code_challenge_methods_supported)
            ? body.code_challenge_methods_supported
            : [],
          attempts,
        };
      }
    } catch (error) {
      attempts.push({ url, ok: false, error: String(error?.message || error) });
    }
  }
  return { server, metadataUrl: null, attempts };
}

export async function onRequestGet() {
  let resource;
  try {
    resource = await fetchJson(PROTECTED_RESOURCE_URL);
  } catch (error) {
    return json({
      ok: false,
      stage: 'protected_resource_discovery',
      message: 'Cloudflare could not reach the Higgsfield MCP discovery endpoint.',
      error: String(error?.message || error),
    }, 502);
  }

  if (!resource.ok || !resource.body) {
    return json({
      ok: false,
      stage: 'protected_resource_discovery',
      status: resource.status,
      message: 'Higgsfield did not return valid protected-resource metadata.',
      preview: resource.preview,
    }, 502);
  }

  const authorizationServers = Array.isArray(resource.body.authorization_servers)
    ? resource.body.authorization_servers
    : [];
  const servers = await Promise.all(authorizationServers.map(discoverAuthorizationServer));

  const hasTokenEndpoint = servers.some(item => Boolean(item.tokenEndpoint));
  const hasInteractiveLogin = servers.some(item => Boolean(item.authorizationEndpoint && item.tokenEndpoint));
  const hasDeviceLogin = servers.some(item => Boolean(item.deviceAuthorizationEndpoint && item.tokenEndpoint));
  const hasDynamicRegistration = servers.some(item => Boolean(item.registrationEndpoint));
  const customClientLikelyPossible = hasTokenEndpoint && (hasInteractiveLogin || hasDeviceLogin);

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    provider: 'Higgsfield MCP',
    resource: resource.body.resource || 'https://mcp.higgsfield.ai/mcp',
    scopesSupported: Array.isArray(resource.body.scopes_supported) ? resource.body.scopes_supported : [],
    bearerMethodsSupported: Array.isArray(resource.body.bearer_methods_supported)
      ? resource.body.bearer_methods_supported
      : [],
    authorizationServers,
    servers,
    compatibility: {
      hasTokenEndpoint,
      hasInteractiveLogin,
      hasDeviceLogin,
      hasDynamicRegistration,
      customClientLikelyPossible,
      readyForPurchaseDecision: customClientLikelyPossible,
    },
    nextStep: customClientLikelyPossible
      ? 'Build the account connection and MCP tool-calling flow before purchasing credits.'
      : 'Do not purchase credits yet. Higgsfield account authentication needs a supported client-registration path.',
  });
}
