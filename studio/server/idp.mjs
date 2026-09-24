import { digest, randomToken } from './security.mjs';

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const DEFAULT_REDIRECT_PATH = '/main/:orgId/member-crm/:groupId/contact-list';

const oauthJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const oauthError = (error, status = 400) => oauthJson({ error }, status);

function text(value, maximum = 200) {
  return typeof value === 'string' && value.length <= maximum ? value : '';
}

function equalSecret(a, b) {
  const left = String(a), right = String(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function idpConfig(env) {
  const spBase = text(env.SP_BASE_URL, 500), redirectUri = text(env.IDP_REDIRECT_URI, 500);
  const clientId = text(env.IDP_CLIENT_ID, 200), clientSecret = text(env.IDP_CLIENT_SECRET, 500);
  const emailDomain = text(env.IDP_EMAIL_DOMAIN, 200), orgId = text(env.IDP_ORG_ID, 200);
  const spPath = text(env.SP_SSO_PATH, 500) || '/hub-app/';
  const redirectPath = text(env.SP_REDIRECT_PATH, 500) || DEFAULT_REDIRECT_PATH;
  let base = null, redirect = null;
  try { base = new URL(spBase); redirect = new URL(redirectUri); } catch {}
  const configured = !!(base && redirect && base.protocol === 'https:' && redirect.protocol === 'https:'
    && clientId && clientSecret && /^[^@\s]+\.[^@\s]+$/.test(emailDomain) && orgId
    && spPath.startsWith('/') && redirectPath.startsWith('/') && !redirectPath.includes('://'));
  if (!configured) return null;
  return { base, redirect, clientId, clientSecret, emailDomain, orgId, spPath, redirectPath };
}

export function juziIframeConfigured(env) {
  return !!idpConfig(env);
}

function identity(user, config) {
  return {
    sub: user.id,
    email: `${user.username}@${config.emailDomain}`,
    name: user.display_name,
    preferred_username: user.username,
    userName: user.username,
    orgId: config.orgId,
    corpName: 'Dotbest',
  };
}

async function issueCode(store, user, config, { redirectUri, state = '' }) {
  const code = randomToken(), now = Date.now();
  await store.query(`INSERT INTO studio_idp_codes(code_hash,client_id,redirect_uri,state,user_id,expires_at)
    VALUES(?,?,?,?,?,?)`, await digest(code), config.clientId, redirectUri, state, user.id, now + CODE_TTL_MS).run();
  return code;
}

export async function createJuziIframe(store, user, env) {
  const config = idpConfig(env);
  if (!config) return null;
  const code = await issueCode(store, user, config, { redirectUri: config.redirect.toString() });
  const iframe = new URL(config.spPath, config.base);
  iframe.searchParams.set('code', code);
  iframe.searchParams.set('redirectPath', config.redirectPath);
  iframe.searchParams.set('client_id', config.clientId);
  iframe.searchParams.set('sso_type', '1');
  return { iframe_url: iframe.toString(), sp_origin: config.base.origin };
}

async function readTokenBody(request) {
  const raw = await request.text();
  if (!raw || raw.length > 8192) return null;
  const contentType = request.headers.get('Content-Type') || '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export async function handleOauth(request, env, store) {
  const url = new URL(request.url), config = idpConfig(env);
  console.log('[IDP]', request.method, url.pathname, 'config:', !!config);
  if (!config) return oauthError('invalid_request', 503);

  if (url.pathname === '/oauth2/authorize' && request.method === 'GET') {
    const clientId = url.searchParams.get('client_id') || '';
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    const responseType = url.searchParams.get('response_type') || '';
    const state = url.searchParams.get('state') || '';
    if (!clientId || !redirectUri || responseType !== 'code' || !state) return oauthError('invalid_request');
    if (clientId !== config.clientId || redirectUri !== config.redirect.toString()) return oauthError('invalid_client', 401);
    let user;
    try { user = await store.authenticate(request); } catch { user = null; }
    if (!user) {
      const login = new URL('/login', url.origin);
      login.searchParams.set('return_to', url.pathname + url.search);
      return new Response(null, { status: 302, headers: { Location: login.toString(), 'Cache-Control': 'no-store' } });
    }
    // SSO direct mode (6951437m0): any authenticated IDP user can issue code to SP; admin/must_change gate removed
    const code = await issueCode(store, user, config, { redirectUri, state });
    const target = new URL(config.redirect);
    target.searchParams.set('code', code);
    target.searchParams.set('state', state);
    return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
  }

  if (url.pathname === '/oauth2/token' && request.method === 'POST') {
    const body = await readTokenBody(request);
    console.log('[IDP] token req body keys:', body ? Object.keys(body) : 'null', 'clientId:', body?.client_id, 'redirectUri:', body?.redirect_uri, 'codeLen:', (body?.code||'').length);
    const clientId = text(body?.client_id), clientSecret = text(body?.client_secret, 500);
    const code = text(body?.code, 200), redirectUri = text(body?.redirect_uri, 500), state = text(body?.state, 500);
    if (!body || body.grant_type !== 'authorization_code' || !clientId || !clientSecret || !code || !redirectUri) {
      return oauthError('invalid_request');
    }
    if (clientId !== config.clientId || !equalSecret(clientSecret, config.clientSecret)) return oauthError('invalid_client', 401);
    const codeHash = await digest(code);
    const row = await store.query('SELECT * FROM studio_idp_codes WHERE code_hash=?', codeHash).first();
    if (!row) return oauthError('invalid_grant');
    await store.query('DELETE FROM studio_idp_codes WHERE code_hash=?', codeHash).run();
    if (row.expires_at <= Date.now() || row.client_id !== clientId || row.redirect_uri !== redirectUri
      || (row.state && row.state !== state)) return oauthError('invalid_grant');
    const token = randomToken(), tokenHash = await digest(token);
    await store.query(`INSERT INTO studio_idp_tokens(token_hash,client_id,user_id,expires_at)
      VALUES(?,?,?,?)`, tokenHash, clientId, row.user_id, Date.now() + TOKEN_TTL_MS).run();
    return oauthJson({ access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_MS / 1000 });
  }

  if (url.pathname === '/oauth2/userinfo' && request.method === 'GET') {
    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : (url.searchParams.get('access_token') || '');
    if (!token || token.length > 200) return oauthError('invalid_token', 401);
    const tokenHash = await digest(token);
    const row = await store.query(`SELECT t.*,u.id AS user_id,u.username,u.display_name,u.role,u.active
      FROM studio_idp_tokens t JOIN studio_users u ON u.id=t.user_id WHERE t.token_hash=?`, tokenHash).first();
    if (!row) return oauthError('invalid_token', 401);
    if (row.expires_at <= Date.now() || !row.active) {
      await store.query('DELETE FROM studio_idp_tokens WHERE token_hash=?', tokenHash).run();
      return oauthError('invalid_token', 401);
    }
    return oauthJson(identity(row, config));
  }

  return oauthError('invalid_request', 404);
}
