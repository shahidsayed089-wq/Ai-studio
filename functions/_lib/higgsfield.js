import { WalletError } from './wallet.js';

const RESOURCE_METADATA_URL = 'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource';
const MCP_URL = 'https://mcp.higgsfield.ai/mcp';

const TABLES = Object.freeze({
  clients: 'ai_higgsfield_oauth_clients_v1',
  states: 'ai_higgsfield_oauth_states_v1',
  tokens: 'ai_higgsfield_oauth_tokens_v1',
});

let schemaPromise;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${TABLES.clients} (
    origin TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_secret_cipher TEXT,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    registration_client_uri TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.states} (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.tokens} (
    user_id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    access_token_cipher TEXT NOT NULL,
    refresh_token_cipher TEXT,
    token_type TEXT,
    scope TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ai_higgsfield_states_expires_v1 ON ${TABLES.states}(expires_at)`,
];

function jsonHeaders() {
  return { accept: 'application/json', 'content-type': 'application/json' };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomUrlSafe(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function encryptionKey(env) {
  const secret = typeof env.SESSION_SIGNING_KEY === 'string' ? env.SESSION_SIGNING_KEY.trim() : '';
  if (secret.length < 24) {
    throw new WalletError(
      'higgsfield_token_key_missing',
      'SESSION_SIGNING_KEY must be configured before connecting Higgsfield.',
      503,
    );
  }
  const material = await sha256(`higgsfield-oauth-token-v1\0${secret}`);
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(env, value) {
  if (!value) return null;
  const key = await encryptionKey(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(String(value)),
  ));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

async function unseal(env, value) {
  if (!value) return null;
  const [ivPart, cipherPart] = String(value).split('.');
  if (!ivPart || !cipherPart) throw new Error('Encrypted token format is invalid.');
  const key = await encryptionKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivPart) },
    key,
    base64UrlToBytes(cipherPart),
  );
  return new TextDecoder().decode(decrypted);
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers || {}) },
    redirect: init.redirect || 'follow',
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok || !body) {
    const message = body?.error_description || body?.error?.message || body?.message || body?.error || text.slice(0, 240) || `Request failed (${response.status})`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return { response, body };
}

export async function ensureHiggsfieldSchema(db) {
  if (!db) throw new WalletError('higgsfield_database_missing', 'Bind the D1 database as DB before connecting Higgsfield.', 503);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of SCHEMA) await db.prepare(statement).run();
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

async function discoverAuthorizationMetadata() {
  const { body: resource } = await fetchJson(RESOURCE_METADATA_URL);
  const servers = Array.isArray(resource.authorization_servers) ? resource.authorization_servers : [];
  if (!servers.length) throw new Error('Higgsfield did not advertise an OAuth authorization server.');

  for (const server of servers) {
    const base = String(server).replace(/\/$/, '');
    for (const url of [`${base}/.well-known/oauth-authorization-server`, `${base}/.well-known/openid-configuration`]) {
      try {
        const { body } = await fetchJson(url);
        if (body.authorization_endpoint && body.token_endpoint) {
          return {
            resource: resource.resource || MCP_URL,
            scopesSupported: Array.isArray(resource.scopes_supported) ? resource.scopes_supported : [],
            issuer: body.issuer || server,
            authorizationEndpoint: body.authorization_endpoint,
            tokenEndpoint: body.token_endpoint,
            registrationEndpoint: body.registration_endpoint || null,
            codeChallengeMethodsSupported: Array.isArray(body.code_challenge_methods_supported)
              ? body.code_challenge_methods_supported
              : [],
            grantTypesSupported: Array.isArray(body.grant_types_supported) ? body.grant_types_supported : [],
          };
        }
      } catch {
        // Try the next metadata URL or authorization server.
      }
    }
  }
  throw new Error('Higgsfield OAuth metadata could not be discovered.');
}

function requestedScope(metadata) {
  const scopes = metadata.scopesSupported || [];
  const preferred = ['openid', 'profile', 'offline_access'];
  const chosen = preferred.filter(scope => scopes.includes(scope));
  if (!chosen.length && scopes.length) return scopes.join(' ');
  return chosen.join(' ');
}

async function getOrRegisterClient(db, env, origin, metadata) {
  await ensureHiggsfieldSchema(db);
  const existing = await db.prepare(
    `SELECT origin, client_id, client_secret_cipher, token_endpoint_auth_method, registration_client_uri
     FROM ${TABLES.clients} WHERE origin = ?`,
  ).bind(origin).first();
  if (existing) {
    return {
      ...existing,
      clientSecret: await unseal(env, existing.client_secret_cipher),
    };
  }

  if (!metadata.registrationEndpoint) {
    throw new WalletError(
      'higgsfield_dynamic_registration_missing',
      'Higgsfield did not expose dynamic client registration for this deployment.',
      503,
    );
  }

  const redirectUri = `${origin}/api/higgsfield/connect/callback`;
  const scope = requestedScope(metadata);
  const registration = {
    client_name: 'Shazan AI Studio',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
  };
  if (scope) registration.scope = scope;

  const { body } = await fetchJson(metadata.registrationEndpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(registration),
  });
  if (!body.client_id) throw new Error('Higgsfield client registration did not return a client_id.');

  const method = body.token_endpoint_auth_method || (body.client_secret ? 'client_secret_post' : 'none');
  await db.prepare(
    `INSERT INTO ${TABLES.clients}
     (origin, client_id, client_secret_cipher, token_endpoint_auth_method, registration_client_uri)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    origin,
    body.client_id,
    await seal(env, body.client_secret || null),
    method,
    body.registration_client_uri || null,
  ).run();

  return {
    origin,
    client_id: body.client_id,
    token_endpoint_auth_method: method,
    registration_client_uri: body.registration_client_uri || null,
    clientSecret: body.client_secret || null,
  };
}

export async function createAuthorizationRedirect(db, env, userId, origin) {
  const metadata = await discoverAuthorizationMetadata();
  const client = await getOrRegisterClient(db, env, origin, metadata);
  const redirectUri = `${origin}/api/higgsfield/connect/callback`;
  const state = randomUrlSafe(24);
  const verifier = randomUrlSafe(48);
  const challenge = bytesToBase64Url(await sha256(verifier));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await db.prepare(`DELETE FROM ${TABLES.states} WHERE expires_at < ?`).bind(new Date().toISOString()).run();
  await db.prepare(
    `INSERT INTO ${TABLES.states} (state, user_id, origin, code_verifier, redirect_uri, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(state, userId, origin, verifier, redirectUri, expiresAt).run();

  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', client.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  const scope = requestedScope(metadata);
  if (scope) url.searchParams.set('scope', scope);
  if (metadata.resource) url.searchParams.set('resource', metadata.resource);

  return { authorizationUrl: url.toString(), state };
}

function tokenForm(client, values) {
  const form = new URLSearchParams(values);
  form.set('client_id', client.client_id);
  if (client.clientSecret && client.token_endpoint_auth_method !== 'none') {
    form.set('client_secret', client.clientSecret);
  }
  return form;
}

async function storeTokenSet(db, env, userId, origin, token) {
  const expiresAt = Number.isFinite(Number(token.expires_in))
    ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
    : null;
  const existing = await db.prepare(
    `SELECT refresh_token_cipher FROM ${TABLES.tokens} WHERE user_id = ?`,
  ).bind(userId).first();
  const refreshCipher = token.refresh_token
    ? await seal(env, token.refresh_token)
    : existing?.refresh_token_cipher || null;

  await db.prepare(
    `INSERT INTO ${TABLES.tokens}
     (user_id, origin, access_token_cipher, refresh_token_cipher, token_type, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       origin = excluded.origin,
       access_token_cipher = excluded.access_token_cipher,
       refresh_token_cipher = excluded.refresh_token_cipher,
       token_type = excluded.token_type,
       scope = excluded.scope,
       expires_at = excluded.expires_at,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    userId,
    origin,
    await seal(env, token.access_token),
    refreshCipher,
    token.token_type || 'Bearer',
    token.scope || null,
    expiresAt,
  ).run();

  return { expiresAt, scope: token.scope || null, tokenType: token.token_type || 'Bearer' };
}

export async function exchangeAuthorizationCode(db, env, stateValue, code) {
  await ensureHiggsfieldSchema(db);
  const state = await db.prepare(
    `SELECT state, user_id, origin, code_verifier, redirect_uri, expires_at
     FROM ${TABLES.states} WHERE state = ?`,
  ).bind(stateValue).first();
  if (!state || new Date(state.expires_at).getTime() <= Date.now()) {
    throw new WalletError('higgsfield_oauth_state_invalid', 'The Higgsfield login session expired. Start the connection again.', 400);
  }

  const metadata = await discoverAuthorizationMetadata();
  const client = await getOrRegisterClient(db, env, state.origin, metadata);
  const form = tokenForm(client, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: state.redirect_uri,
    code_verifier: state.code_verifier,
  });
  if (metadata.resource) form.set('resource', metadata.resource);

  try {
    const { body } = await fetchJson(metadata.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!body.access_token) throw new Error('Higgsfield token exchange did not return an access token.');
    const stored = await storeTokenSet(db, env, state.user_id, state.origin, body);
    return { userId: state.user_id, ...stored };
  } finally {
    await db.prepare(`DELETE FROM ${TABLES.states} WHERE state = ?`).bind(stateValue).run().catch(() => {});
  }
}

async function refreshAccessToken(db, env, userId, row) {
  const refreshToken = await unseal(env, row.refresh_token_cipher);
  if (!refreshToken) throw new WalletError('higgsfield_reconnect_required', 'Reconnect Higgsfield to refresh access.', 401);
  const metadata = await discoverAuthorizationMetadata();
  const client = await getOrRegisterClient(db, env, row.origin, metadata);
  const form = tokenForm(client, { grant_type: 'refresh_token', refresh_token: refreshToken });
  if (metadata.resource) form.set('resource', metadata.resource);
  const { body } = await fetchJson(metadata.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!body.access_token) throw new Error('Higgsfield refresh did not return an access token.');
  await storeTokenSet(db, env, userId, row.origin, body);
  return body.access_token;
}

export async function getHiggsfieldConnection(db, env, userId) {
  await ensureHiggsfieldSchema(db);
  const row = await db.prepare(
    `SELECT user_id, origin, token_type, scope, expires_at, created_at, updated_at
     FROM ${TABLES.tokens} WHERE user_id = ?`,
  ).bind(userId).first();
  return row || null;
}

export async function getHiggsfieldAccessToken(db, env, userId) {
  await ensureHiggsfieldSchema(db);
  const row = await db.prepare(
    `SELECT user_id, origin, access_token_cipher, refresh_token_cipher, expires_at
     FROM ${TABLES.tokens} WHERE user_id = ?`,
  ).bind(userId).first();
  if (!row) throw new WalletError('higgsfield_not_connected', 'Connect your Higgsfield account first.', 401);
  const expires = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
  if (expires - Date.now() > 60_000) return unseal(env, row.access_token_cipher);
  return refreshAccessToken(db, env, userId, row);
}

export async function disconnectHiggsfield(db, userId) {
  await ensureHiggsfieldSchema(db);
  await db.prepare(`DELETE FROM ${TABLES.tokens} WHERE user_id = ?`).bind(userId).run();
}

function parseMcpPayload(text, expectedId = null) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* Try SSE below. */ }
  const events = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch { /* Ignore malformed keepalive lines. */ }
  }
  if (expectedId != null) return events.find(item => item?.id === expectedId) || events.at(-1) || null;
  return events.at(-1) || null;
}

async function mcpPost(accessToken, payload, sessionId = null) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const parsed = parseMcpPayload(text, payload.id ?? null);
  if (!response.ok || parsed?.error) {
    const message = parsed?.error?.message || text.slice(0, 300) || `MCP request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  return {
    payload: parsed,
    sessionId: response.headers.get('mcp-session-id') || sessionId,
  };
}

export async function listHiggsfieldTools(accessToken) {
  const versions = ['2025-03-26', '2024-11-05'];
  let initialized;
  let lastError;
  for (const protocolVersion of versions) {
    try {
      initialized = await mcpPost(accessToken, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'Shazan AI Studio', version: '0.1.0' },
        },
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!initialized) throw lastError || new Error('Higgsfield MCP initialization failed.');

  await mcpPost(accessToken, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, initialized.sessionId).catch(() => {});

  const listed = await mcpPost(accessToken, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  }, initialized.sessionId);

  return {
    protocolVersion: initialized.payload?.result?.protocolVersion || null,
    serverInfo: initialized.payload?.result?.serverInfo || null,
    tools: Array.isArray(listed.payload?.result?.tools) ? listed.payload.result.tools : [],
  };
}
