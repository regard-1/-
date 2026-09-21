import { AUDIENCES, SCENES, maskText } from '../shared.mjs';

const DEFAULT_TOP_K = 5;

export function knowledgeConfigured(env) {
  return !!(env.BAILIAN_KB_API_KEY && (env.BAILIAN_KB_BASE_URL || env.BAILIAN_KB_WORKSPACE_ID) && env.BAILIAN_KB_AGENT_ID);
}

export function buildKnowledgeQuery(input) {
  const scene = SCENES.find(item => item.id === input.scene)?.label || '';
  const audience = AUDIENCES[input.audience] || '';
  const recentMessages = input.messages.slice(-6).map(message => message.content);
  const parts = [
    scene,
    audience,
    input.needs,
    input.goal,
    ...recentMessages,
  ].filter(Boolean);
  return parts.join('；').replace(/\s+/g, ' ').slice(0, 1200);
}

function baseUrl(env) {
  const value = env.BAILIAN_KB_BASE_URL || (env.BAILIAN_KB_WORKSPACE_ID && `https://${env.BAILIAN_KB_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com`);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!/(^|\.)maas\.aliyuncs\.com$/.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function sourceFromNode(node, index) {
  const metadata = node?.metadata && typeof node.metadata === 'object' ? node.metadata : {};
  const content = maskText(String(node.text || metadata.content || '').trim()).slice(0, 4000);
  if (!content) return null;
  const titleParts = [metadata.doc_name, metadata.hier_title || metadata.title].filter(Boolean);
  const title = `多特倍斯知识库 · ${titleParts.join(' · ') || `检索片段${index + 1}`}`.slice(0, 160);
  return {
    id: `bailian_kb_${index + 1}`,
    version: 1,
    title,
    kind: 'knowledge',
    audience: 'all',
    product: typeof metadata.product === 'string' ? metadata.product.slice(0, 120) : '',
    content,
    valid_from: '',
    valid_to: '',
    active: 1,
    external: true,
    source_type: 'bailian_knowledge_search',
  };
}

export async function retrieveKnowledge(input, env, fetchKnowledge = fetch) {
  if (!knowledgeConfigured(env)) return { status: 'not_configured', sources: [] };
  const url = baseUrl(env), query = buildKnowledgeQuery(input);
  if (!url || !query) {
    console.warn(JSON.stringify({ knowledge_error: 'CONFIG' }));
    return { status: 'failed', sources: [] };
  }
  const topK = Math.min(10, Math.max(1, Number(env.BAILIAN_KB_TOP_K) || DEFAULT_TOP_K));
  try {
    const response = await fetchKnowledge(`${url.href.replace(/\/$/, '')}/api/v1/indices/knowledge/search`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BAILIAN_KB_API_KEY}` },
      body: JSON.stringify({ agent_id: env.BAILIAN_KB_AGENT_ID, query, images: [] }),
    });
    if (!response.ok) {
      console.warn(JSON.stringify({ knowledge_error: 'HTTP', status: response.status }));
      return { status: 'failed', sources: [] };
    }
    const rawText = await response.text();
    if (rawText.length > 100000) return { status: 'failed', sources: [] };
    let payload;
    try { payload = JSON.parse(rawText); } catch { return { status: 'failed', sources: [] }; }
    if (payload.success !== true || !Array.isArray(payload.data?.nodes)) {
      console.warn(JSON.stringify({ knowledge_error: 'RESPONSE', code: typeof payload.code === 'string' ? payload.code.slice(0, 80) : 'UNKNOWN' }));
      return { status: 'failed', sources: [] };
    }
    const sources = payload.data.nodes
      .slice(0, topK)
      .map(sourceFromNode)
      .filter(Boolean);
    return { status: sources.length ? 'ready' : 'empty', sources };
  } catch (error) {
    console.warn(JSON.stringify({ knowledge_error: 'NETWORK', name: error?.name || 'UNKNOWN' }));
    return { status: 'failed', sources: [] };
  }
}
