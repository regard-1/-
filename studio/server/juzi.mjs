import { fail } from './security.mjs';

const DEFAULT_TIMEOUT = 15000;
const ERROR_MESSAGES = {
  1: '企业 token 错误，请检查凭证配置',
  2: '请求参数无效，请核对托管账号、客户或消息内容',
  6: '该企业 token 没有发送消息的权限',
  [-1]: '上游系统错误，请稍后重试',
  [-2]: '未找到托管账号',
  [-3]: '匹配到多个托管账号，无法确定发送账号',
  [-4]: '未找到客户，请先同步客户',
  [-5]: '未找到群聊',
  [-6]: '消息类型不支持',
  400101: '托管账号当前不在线，无法发送',
  4002500: '已有同步任务进行中，请稍后重试',
};

function client(env, dependencies = {}) {
  const baseValue = String(env.WECOM_API_BASE || '').trim().replace(/\/$/, '');
  const token = String(env.WECOM_API_TOKEN || '').trim();
  const timeout = Math.min(60000, Math.max(1000, Number(env.WECOM_API_TIMEOUT_MS) || DEFAULT_TIMEOUT));
  if (!baseValue || !token) fail(503, '句子互动连接尚未配置，请联系管理员', 'JUZI_NOT_CONFIGURED');
  let base;
  try { base = new URL(baseValue); } catch { fail(503, '句子互动服务地址配置不正确', 'JUZI_NOT_CONFIGURED'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    fail(503, '句子互动服务地址配置不正确', 'JUZI_NOT_CONFIGURED');
  }
  return { base, token, timeout, fetch: dependencies.fetchJuzi || fetch };
}

function requestURL({ base, token }, path, params = {}) {
  const url = new URL(`${base.origin}${base.pathname.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  url.searchParams.set('token', token);
  return url;
}

function safeMessage(code, message) {
  return ERROR_MESSAGES[code] || '句子互动接口暂时不可用，请稍后重试';
}

async function request(clientState, path, init, params = {}) {
  const url = requestURL(clientState, path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clientState.timeout);
  let response;
  try { response = await clientState.fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error?.name === 'AbortError') fail(504, '句子互动接口响应超时，请稍后重试', 'JUZI_TIMEOUT');
    fail(502, '句子互动接口连接异常，请稍后重试', 'JUZI_UNAVAILABLE');
  } finally { clearTimeout(timer); }

  let body;
  try { body = await response.json(); } catch { fail(502, '句子互动接口返回格式异常，请稍后重试', 'JUZI_BAD_RESPONSE'); }
  const code = Number(body?.errcode ?? 1);
  if (!response.ok || code !== 0) fail(502, safeMessage(code, body?.errmsg), 'JUZI_API_ERROR');
  return body;
}

export function juziConfigured(env) {
  return !!(String(env.WECOM_API_BASE || '').trim() && String(env.WECOM_API_TOKEN || '').trim());
}

export async function listCustomers(env, dependencies = {}, seq) {
  const state = client(env, dependencies);
  const body = await request(state, '/api/v2/customer/list', {
    method: 'GET', headers: { Accept: 'application/json' },
  }, { pageSize: 1000, ...(seq ? { seq } : {}) });
  return { items: Array.isArray(body?.data) ? body.data : [], nextSeq: body?.next_seq || '' };
}

export async function sendText(env, dependencies = {}, input) {
  const state = client(env, dependencies);
  const body = {
    imBotId: input.imBotId,
    messageType: 7,
    payload: { text: input.text },
    imContactId: input.imContactId,
    externalRequestId: input.externalRequestId,
  };
  const result = await request(state, '/api/v2/message/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { requestId: result?.requestId || '' };
}
