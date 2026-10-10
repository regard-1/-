import { maskText } from '../shared.mjs';

const DEFAULT_BASE_URL = 'https://ai-agent-sdk.7moor.com';
const TOKEN_CACHE_MS = 23 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;

let cachedToken = null;
let tokenRefreshAt = 0;
let inFlightRefresh = null;

export function qimoConfigured(env) {
  return !!(env.QIMO_KB_USERNAME && env.QIMO_KB_PASSWORD && env.QIMO_KB_AGENT_ID);
}

export function resetQimoKnowledgeForTests() {
  cachedToken = null;
  tokenRefreshAt = 0;
  inFlightRefresh = null;
}

function baseUrl(env) {
  const value = env.QIMO_KB_BASE_URL || DEFAULT_BASE_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!/(^|\.)7moor\.com$/.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function configuredIds(env) {
  return String(env.QIMO_KB_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 20);
}

async function readJson(response) {
  const rawText = await response.text();
  if (rawText.length > 100000) return null;
  try { return JSON.parse(rawText); } catch { return null; }
}

async function getToken(url, env, fetchKnowledge, forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenRefreshAt) return cachedToken;
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      const response = await fetchKnowledge(`${url.href.replace(/\/$/, '')}/agent/token`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.QIMO_KB_USERNAME, password: env.QIMO_KB_PASSWORD }),
      });
      if (!response.ok) throw new Error('QIMO_LOGIN_HTTP');
      const payload = await readJson(response);
      if (payload?.code !== 200 || typeof payload.data !== 'string' || !payload.data) throw new Error('QIMO_LOGIN_RESPONSE');
      cachedToken = payload.data;
      tokenRefreshAt = Date.now() + TOKEN_CACHE_MS;
      return cachedToken;
    })().finally(() => { inFlightRefresh = null; });
  }
  return inFlightRefresh;
}

function sourceFromDoc(doc, index) {
  const content = maskText(String(doc?.page_content || '').trim()).slice(0, 4000);
  if (!content) return null;
  const fileName = String(doc?.file_name || '').trim();
  return {
    id: `qimo_kb_${index + 1}`,
    version: 1,
    title: `多特倍斯知识库 · ${fileName || `检索片段${index + 1}`}`.slice(0, 160),
    kind: 'knowledge',
    audience: 'all',
    product: '',
    content,
    valid_from: '',
    valid_to: '',
    active: 1,
    external: true,
    source_type: '7moor_knowledge_retrieval',
  };
}

function authFailed(response, payload) {
  return response.status === 401 || response.status === 403 || payload?.code === 401 || payload?.code === 403;
}

export async function retrieveQimoKnowledge({ question, messages = [] }, env, fetchKnowledge = fetch) {
  if (!qimoConfigured(env)) return { status: 'not_configured', sources: [] };
  const url = baseUrl(env), finalQuestion = String(question || '').trim();
  if (!url || !finalQuestion) {
    console.warn(JSON.stringify({ knowledge_error: 'QIMO_CONFIG' }));
    return { status: 'failed', sources: [] };
  }

  const history = (Array.isArray(messages) ? messages : []).slice(-6).map(message => ({
    type: message.role === 'assistant' ? 'assistant' : 'user',
    message: String(message.content || '').slice(0, 8000),
  })).filter(message => message.message);
  const requestMessages = [...history, { type: 'user', message: finalQuestion.slice(0, 4000) }];
  const kbIds = configuredIds(env);
  const body = {
    rag_mode: 'traditional',
    return_full_params: true,
    multi_wheel: false,
    messages: requestMessages,
    ...(kbIds.length ? { kb_ids: kbIds } : {}),
  };
  const topK = Math.min(10, Math.max(1, Number(env.QIMO_KB_TOP_K) || 5));

  let response;
  try {
    let token = await getToken(url, env, fetchKnowledge);
    response = await fetchKnowledge(`${url.href.replace(/\/$/, '')}/agent/platform/v2/openapi/rag_retrieval`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', apikey: env.QIMO_KB_AGENT_ID, token },
      body: JSON.stringify(body),
    });
    let payload = await readJson(response);
    if (authFailed(response, payload)) {
      token = await getToken(url, env, fetchKnowledge, true);
      response = await fetchKnowledge(`${url.href.replace(/\/$/, '')}/agent/platform/v2/openapi/rag_retrieval`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', apikey: env.QIMO_KB_AGENT_ID, token },
        body: JSON.stringify(body),
      });
      payload = await readJson(response);
      if (authFailed(response, payload)) throw new Error('QIMO_AUTH');
    }
    if (!response.ok) {
      console.warn(JSON.stringify({ knowledge_error: 'QIMO_HTTP', status: response.status }));
      return { status: 'failed', sources: [] };
    }
    if (payload?.success !== true || payload?.code !== 200 || !payload.data) {
      console.warn(JSON.stringify({ knowledge_error: 'QIMO_RESPONSE' }));
      return { status: 'failed', sources: [] };
    }
    const data = payload.data;
    const relatedDocs = Array.isArray(data.related_docs) ? data.related_docs : [];
    const sources = relatedDocs.slice(0, topK).map(sourceFromDoc).filter(Boolean);
    const result = {
      status: sources.length ? 'ready' : 'empty',
      sources,
      provider: '7moor',
      retrieved: data.is_retrieved === true,
      question: typeof data.question === 'string' ? data.question.slice(0, 2000) : '',
      sim_score: typeof data.sim_score === 'number' && Number.isFinite(data.sim_score) ? data.sim_score : null,
      sim_threshold: typeof data.sim_threshold === 'number' && Number.isFinite(data.sim_threshold) ? data.sim_threshold : null,
    };
    return result;
  } catch (error) {
    console.warn(JSON.stringify({ knowledge_error: 'QIMO_NETWORK', name: error?.name || 'UNKNOWN' }));
    return { status: 'failed', sources: [] };
  }
}
