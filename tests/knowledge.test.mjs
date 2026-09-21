import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, makeModelBody, validateOutput } from '../studio/server/generation.mjs';
import { buildKnowledgeQuery, knowledgeConfigured, retrieveKnowledge } from '../studio/server/knowledge.mjs';

const env = {
  BAILIAN_KB_API_KEY: 'synthetic-key',
  BAILIAN_KB_BASE_URL: 'https://ws-5ir7z45ox2wmnbb4.cn-beijing.maas.aliyuncs.com',
  BAILIAN_KB_AGENT_ID: 'aid-56fd229f52354d75af21e38ee208fa8a',
  BAILIAN_KB_TOP_K: '5',
};
const input = () => normalizeInput({
  audience: 'anti_aging',
  scene: 'product',
  messages: [{ role: 'user', content: '请问抗衰产品这次的活动价格是多少？' }],
  needs: '想了解抗衰产品活动',
  goal: '确认本次活动价格',
});
const upstream = nodes => new Response(JSON.stringify({
  success: true,
  code: 'Success',
  status_code: 200,
  status: 'SUCCESS',
  data: { total: nodes.length, nodes, cost_time: 20 },
}), { status: 200 });

test('knowledge search uses the published agent and builds a bounded query', async () => {
  let sent;
  const result = await retrieveKnowledge(input(), env, async (url, options) => {
    sent = { url, body: JSON.parse(options.body), authorization: options.headers.Authorization };
    return upstream([{ text: '文档名: 测试资料\n标题: 活动说明\n正文: 测试产品到手价199元。', metadata: { doc_name: '测试资料', title: '活动说明', pipeline_id: 'r4s2etnbv6' } }]);
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.sources.length, 1);
  assert.equal(sent.url, 'https://ws-5ir7z45ox2wmnbb4.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search');
  assert.equal(sent.body.agent_id, 'aid-56fd229f52354d75af21e38ee208fa8a');
  assert.deepEqual(sent.body.images, []);
  assert.ok(sent.body.query.includes('活动价格'));
  assert.ok(buildKnowledgeQuery(input()).length <= 1200);
  assert.equal(knowledgeConfigured(env), true);
});

test('retrieved knowledge chunks enter the model context and citation catalog', () => {
  const item = input();
  const source = {
    id: 'bailian_kb_1', version: 1, title: '多特倍斯知识库 · 测试资料', kind: 'knowledge',
    content: '测试产品到手价199元。', external: true, source_type: 'bailian_knowledge_search',
  };
  const body = makeModelBody(item, [source]);
  const supplied = JSON.parse(body.messages[1].content).supplied_materials;
  assert.equal(supplied[0].id, 'bailian_kb_1');
  assert.equal(supplied[0].external, true);
  assert.match(body.messages[0].content, /多特倍斯知识库检索片段/);
  const output = {
    status: 'ready', reply: '测试产品到手价199元，您想了解规格吗？', next_step: '等待客户确认。',
    followups: [], missing_fields: [], conflicts: [], inferred: { needs: '活动价格', goal: '确认价格', evidence: '客户询问价格' },
    used_sources: [{ id: 'bailian_kb_1', version: 1, quote: source.content }],
    facts: [{ claim: '测试产品到手价199元', source_id: 'bailian_kb_1', quote: source.content }],
  };
  assert.equal(validateOutput(output, item, [source]).status, 'ready');
});

test('knowledge failures do not block generation or leak the API key', async () => {
  for (const mock of [async () => new Response('unauthorized', { status: 401 }), async () => { throw Error('synthetic-key network failure'); }]) {
    const result = await retrieveKnowledge(input(), env, mock);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.sources, []);
  }
  assert.equal(knowledgeConfigured({}), false);
  const result = await retrieveKnowledge(input(), {}, async () => { throw Error('must not call'); });
  assert.equal(result.status, 'not_configured');
  assert.deepEqual(result.sources, []);
});
