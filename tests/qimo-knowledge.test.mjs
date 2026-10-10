import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeQuery, knowledgeConfigured, retrieveKnowledge } from '../studio/server/knowledge.mjs';
import { resetQimoKnowledgeForTests } from '../studio/server/qimo-knowledge.mjs';

const env = {
  QIMO_KB_USERNAME: 'synthetic-user',
  QIMO_KB_PASSWORD: 'synthetic-password',
  QIMO_KB_AGENT_ID: 'synthetic-agent-id',
};
const input = () => ({
  audience: 'anti_aging',
  scene: 'product',
  messages: [
    { role: 'assistant', content: '王哥，您想先了解哪款产品？' },
    { role: 'user', content: '我想问一下辅酶Q10的规格。' },
  ],
  needs: '了解辅酶Q10规格',
  goal: '确认产品规格',
});
const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const login = token => response({ code: 200, data: token, description: '登录成功' });
const hit = () => response({
  code: 200,
  message: 'success',
  success: true,
  data: {
    is_retrieved: true,
    question: '辅酶Q10规格',
    related_docs: [{
      document_id: 'doc-1',
      file_name: '辅酶Q10资料.pdf',
      kb_id: 'kb-1',
      page_content: '辅酶Q10每瓶60粒，每粒含100mg。',
      score: 0.82,
    }],
    sim_score: 0.82,
    sim_threshold: 0.4,
    billing_info: [],
  },
});

test('7moor retrieval logs in once, caches the token, and maps hits into external sources', async () => {
  resetQimoKnowledgeForTests();
  const calls = [];
  const fetchKnowledge = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    return path === '/agent/token' ? login('synthetic-token') : hit();
  };
  const question = buildKnowledgeQuery(input());
  const first = await retrieveKnowledge(input(), env, fetchKnowledge);
  const second = await retrieveKnowledge(input(), env, fetchKnowledge);

  assert.equal(first.status, 'ready');
  assert.equal(second.status, 'ready');
  assert.equal(first.sources.length, 1);
  assert.equal(first.sources[0].source_type, '7moor_knowledge_retrieval');
  assert.equal(first.sources[0].content, '辅酶Q10每瓶60粒，每粒含100mg。');
  assert.equal(calls.filter(call => call.path === '/agent/token').length, 1);
  assert.equal(calls.filter(call => call.path.includes('rag_retrieval')).length, 2);
  assert.equal(knowledgeConfigured(env), true);
  assert.ok(!JSON.stringify(first).includes('synthetic-token'));
  assert.ok(!JSON.stringify(first).includes('synthetic-password'));

  const retrieval = JSON.parse(calls.at(-1).options.body);
  assert.equal(retrieval.rag_mode, 'traditional');
  assert.equal(retrieval.return_full_params, true);
  assert.equal(retrieval.multi_wheel, false);
  assert.equal(retrieval.messages.at(-1).type, 'user');
  assert.ok(retrieval.messages.at(-1).message.includes(question));
  assert.equal(retrieval.kb_ids, undefined);
});

test('concurrent first requests share one 7moor login', async () => {
  resetQimoKnowledgeForTests();
  let logins = 0;
  const fetchKnowledge = async url => {
    const path = new URL(url).pathname;
    if (path === '/agent/token') {
      logins += 1;
      return login('shared-token');
    }
    return hit();
  };
  const results = await Promise.all([
    retrieveKnowledge(input(), env, fetchKnowledge),
    retrieveKnowledge(input(), env, fetchKnowledge),
    retrieveKnowledge(input(), env, fetchKnowledge),
  ]);
  assert.equal(logins, 1);
  assert.equal(results.filter(result => result.status === 'ready').length, 3);
});

test('an authentication failure refreshes the token and retries exactly once', async () => {
  resetQimoKnowledgeForTests();
  const calls = [];
  const fetchKnowledge = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, token: options.headers?.token });
    if (path === '/agent/token') return login(calls.filter(call => call.path === '/agent/token').length === 1 ? 'old-token' : 'new-token');
    return calls.filter(call => call.path.includes('rag_retrieval')).length === 1
      ? response({ code: 401, success: false }, 401)
      : hit();
  };
  const result = await retrieveKnowledge(input(), env, fetchKnowledge);
  assert.equal(result.status, 'ready');
  assert.equal(calls.filter(call => call.path === '/agent/token').length, 2);
  assert.equal(calls.filter(call => call.path.includes('rag_retrieval')).length, 2);
  assert.equal(calls[1].token, 'old-token');
  assert.equal(calls.at(-1).token, 'new-token');
});

test('a second authentication failure stops without a third attempt', async () => {
  resetQimoKnowledgeForTests();
  const calls = [];
  const fetchKnowledge = async url => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/agent/token') return login('expired-token');
    return response({ code: 403, success: false }, 403);
  };
  const result = await retrieveKnowledge(input(), env, fetchKnowledge);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.sources, []);
  assert.equal(calls.filter(path => path === '/agent/token').length, 2);
  assert.equal(calls.filter(path => path.includes('rag_retrieval')).length, 2);
});

test('7moor no-hit is a successful empty result and does not refresh the token', async () => {
  resetQimoKnowledgeForTests();
  const calls = [];
  const fetchKnowledge = async url => {
    const path = new URL(url).pathname;
    calls.push(path);
    return path === '/agent/token'
      ? login('stable-token')
      : response({
        code: 200,
        message: 'success',
        success: true,
        data: { is_retrieved: false, question: '未命中', related_docs: [], sim_score: 0, sim_threshold: 0.4, billing_info: [] },
      });
  };
  const result = await retrieveKnowledge(input(), env, fetchKnowledge);
  assert.equal(result.status, 'empty');
  assert.deepEqual(result.sources, []);
  assert.equal(calls.filter(path => path === '/agent/token').length, 1);
  assert.equal(calls.filter(path => path.includes('rag_retrieval')).length, 1);
});

test('configured 7moor knowledge IDs are forwarded and missing config is not an error', async () => {
  resetQimoKnowledgeForTests();
  const scopedEnv = { ...env, QIMO_KB_IDS: 'kb-1, kb-2' };
  let sent;
  const fetchKnowledge = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/agent/token') return login('scoped-token');
    sent = JSON.parse(options.body);
    return hit();
  };
  const result = await retrieveKnowledge(input(), scopedEnv, fetchKnowledge);
  assert.equal(result.status, 'ready');
  assert.deepEqual(sent.kb_ids, ['kb-1', 'kb-2']);

  const missing = await retrieveKnowledge(input(), {}, async () => { throw Error('must not call'); });
  assert.equal(missing.status, 'not_configured');
  assert.equal(knowledgeConfigured({}), false);
});
