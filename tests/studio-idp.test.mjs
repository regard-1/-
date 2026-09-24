import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalDB } from '../studio/local-db.mjs';
import { handle } from '../studio/server/worker.mjs';
import { passwordHash, digest } from '../studio/server/security.mjs';

const origin = 'https://studio.example';
const baseEnv = {
  IDP_CLIENT_ID: 'dotbest-test-client',
  IDP_CLIENT_SECRET: 'test-only-client-secret',
  IDP_REDIRECT_URI: 'https://sp.example/oauth/callback',
  IDP_EMAIL_DOMAIN: 'idp.example',
  IDP_ORG_ID: 'test-org',
  SP_BASE_URL: 'https://sp.example',
  SP_SSO_PATH: '/hub-app/',
  SP_REDIRECT_PATH: '/main/:orgId/member-crm/:groupId/contact-list',
};

async function harness(t) {
  const db = new LocalDB(); t.after(() => db.close());
  const hash = await passwordHash('SyntheticPass123!');
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('admin', 'admin', '合成管理员', hash, 'admin', Date.now());
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('sales', 'sales', '合成销售', hash, 'sales', Date.now());
  const env = { ...baseEnv, DB: db };
  const call = async (path, { method = 'GET', body, headers = {}, session } = {}) => {
    const request = new Request(origin + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(session ? { Cookie: session.cookie, 'X-Studio-CSRF': session.csrf } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return await handle(request, env);
  };
  const login = async username => {
    const response = await call('/api/studio/login', { method: 'POST', body: { username, password: 'SyntheticPass123!' } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    return { cookie: response.headers.get('Set-Cookie').split(';')[0], csrf: payload.data.csrf };
  };
  return { db, env, call, login };
}
const oauthJson = async response => ({ status: response.status, body: await response.json() });

test('juzi SSO requires login and returns a one-use iframe URL', async t => {
  const h = await harness(t);
  assert.equal((await h.call('/api/studio/juzi/sso')).status, 401);
  const sales = await h.login('sales');
  const response = await h.call('/api/studio/juzi/sso', { session: sales });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const url = new URL(payload.data.iframe_url);
  assert.equal(url.searchParams.get('redirectPath'), baseEnv.SP_REDIRECT_PATH);
  const code = url.searchParams.get('code');
  assert.match(code, /^[0-9a-f]{64}$/);
  assert.ok(h.db.sqlite.prepare('SELECT 1 FROM studio_idp_codes WHERE code_hash=?').get(await digest(code)));
  assert.ok(!JSON.stringify(h.db.sqlite.prepare('SELECT * FROM studio_idp_codes').all()).includes(code));

  const admin = await h.login('admin');
  const adminResponse = await h.call('/api/studio/juzi/sso', { session: admin });
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  const adminUrl = new URL(adminPayload.data.iframe_url);
  assert.equal(adminUrl.origin + adminUrl.pathname, 'https://sp.example/hub-app/');
  assert.equal(adminUrl.searchParams.get('client_id'), baseEnv.IDP_CLIENT_ID);
  assert.equal(adminUrl.searchParams.get('sso_type'), '1');
  assert.equal(adminUrl.searchParams.get('redirectPath'), baseEnv.SP_REDIRECT_PATH);
  assert.equal(adminPayload.data.sp_origin, 'https://sp.example');
  const adminCode = adminUrl.searchParams.get('code');
  assert.match(adminCode, /^[0-9a-f]{64}$/);
  assert.ok(h.db.sqlite.prepare('SELECT 1 FROM studio_idp_codes WHERE code_hash=?').get(await digest(adminCode)));
  assert.ok(!JSON.stringify(h.db.sqlite.prepare('SELECT * FROM studio_idp_codes').all()).includes(adminCode));
});

test('oauth token exchange is one-time and userinfo never stores plaintext tokens', async t => {
  const h = await harness(t), admin = await h.login('admin');
  const first = await (await h.call('/api/studio/juzi/sso', { session: admin })).json();
  const code = new URL(first.data.iframe_url).searchParams.get('code');
  const tokenBody = {
    grant_type: 'authorization_code',
    code,
    client_id: baseEnv.IDP_CLIENT_ID,
    client_secret: baseEnv.IDP_CLIENT_SECRET,
    redirect_uri: baseEnv.IDP_REDIRECT_URI,
  };
  const wrong = await oauthJson(await h.call('/oauth2/token', { method: 'POST', body: { ...tokenBody, client_secret: 'wrong' } }));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'invalid_client');
  const token = await oauthJson(await h.call('/oauth2/token', { method: 'POST', body: tokenBody }));
  assert.equal(token.status, 200);
  assert.match(token.body.access_token, /^[0-9a-f]{64}$/);
  assert.equal(token.body.token_type, 'Bearer');
  assert.equal(token.body.expires_in, 3600);
  const replay = await oauthJson(await h.call('/oauth2/token', { method: 'POST', body: tokenBody }));
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, 'invalid_grant');
  const info = await oauthJson(await h.call('/oauth2/userinfo', { headers: { Authorization: `Bearer ${token.body.access_token}` } }));
  assert.equal(info.status, 200);
  assert.equal(info.body.email, 'admin@idp.example');
  assert.equal(info.body.orgId, baseEnv.IDP_ORG_ID);
  assert.equal(info.body.userName, 'admin');
  const invalid = await oauthJson(await h.call('/oauth2/userinfo', { headers: { Authorization: 'Bearer wrong-token' } }));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error, 'invalid_token');
  const dump = JSON.stringify([
    h.db.sqlite.prepare('SELECT * FROM studio_idp_codes').all(),
    h.db.sqlite.prepare('SELECT * FROM studio_idp_tokens').all(),
  ]);
  assert.ok(!dump.includes(code));
  assert.ok(!dump.includes(token.body.access_token));
});

test('missing IDP configuration and expired tokens are explicit', async t => {
  const h = await harness(t), admin = await h.login('admin');
  delete h.env.IDP_CLIENT_SECRET;
  const response = await h.call('/api/studio/juzi/sso', { session: admin });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'IDP_NOT_CONFIGURED');
  assert.equal((await oauthJson(await h.call('/oauth2/token', { method: 'POST', body: { grant_type: 'authorization_code' } }))).status, 503);

  h.env.IDP_CLIENT_SECRET = baseEnv.IDP_CLIENT_SECRET;
  const first = await (await h.call('/api/studio/juzi/sso', { session: admin })).json();
  const code = new URL(first.data.iframe_url).searchParams.get('code');
  const body = {
    grant_type: 'authorization_code',
    code,
    client_id: baseEnv.IDP_CLIENT_ID,
    client_secret: baseEnv.IDP_CLIENT_SECRET,
    redirect_uri: baseEnv.IDP_REDIRECT_URI,
  };
  const token = await oauthJson(await h.call('/oauth2/token', { method: 'POST', body }));
  h.db.sqlite.prepare('UPDATE studio_idp_tokens SET expires_at=?').run(Date.now() - 1);
  const info = await oauthJson(await h.call('/oauth2/userinfo', { headers: { Authorization: `Bearer ${token.body.access_token}` } }));
  assert.equal(info.status, 401);
  assert.equal(info.body.error, 'invalid_token');
});
