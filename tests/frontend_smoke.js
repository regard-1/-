const assert = require('node:assert/strict');
const path = require('node:path');

const memory = new Map();
global.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
global.location = { href: 'http://127.0.0.1:8091/' };
global.window = global;

require(path.join(__dirname, '..', 'assets', 'demo-api.js'));

async function request(url, options) {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}

function containsRestrictedKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    /profile|portrait|segment|score|risk|prediction|画像|标签|评分/i.test(key) ||
    containsRestrictedKey(item)
  );
}

(async () => {
  let result = await request('/api/v1/user/session');
  assert.equal(result.status, 401);

  result = await request('/api/v1/user/session', {
    method: 'POST',
    body: JSON.stringify({ purpose: 'first', mode: 'simple', save_history: true }),
  });
  assert.equal(result.status, 201);

  const home = await request('/api/v1/user/home');
  assert.equal(home.status, 200);
  assert.equal(home.body.data.topics.length, 4);

  const knowledge = await request('/api/v1/user/knowledge');
  assert.equal(knowledge.body.data.items.length, 5);

  const chat = await request('/api/v1/user/conversation/messages', {
    method: 'POST',
    body: JSON.stringify({ message: '正在用药，可以自行调整吗？', mode: 'simple' }),
  });
  const answer = chat.body.data.messages.at(-1);
  assert.match(answer.content, /医生或药师/);
  assert.match(answer.notice, /不提供具体使用方案/);

  const reminder = await request('/api/v1/user/reminders', {
    method: 'POST',
    body: JSON.stringify({ title: '继续了解安全信息', when: 'week', channel: '站内消息' }),
  });
  assert.equal(reminder.status, 201);

  for (const endpoint of ['/api/v1/user/home', '/api/v1/user/focus', '/api/v1/user/preferences']) {
    const response = await request(endpoint);
    assert.equal(containsRestrictedKey(response.body.data), false, `${endpoint} exposed a restricted field`);
  }

  console.log('frontend smoke: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
