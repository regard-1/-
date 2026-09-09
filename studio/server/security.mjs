export class HttpError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
export const fail = (status, message, code) => { throw new HttpError(status, message, code); };
const encode = value => new TextEncoder().encode(value);
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(value)))); }
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function passwordHash(password, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encode(salt), iterations: 100000 }, key, 256);
  return `pbkdf2-sha256$100000$${salt}$${hex(new Uint8Array(derived))}`;
}
export async function verifyPassword(password, encoded) {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000') return false;
  return equal(await passwordHash(password, parts[2]), encoded);
}
export function checkPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    fail(400, '密码需为 12 至 128 位，并包含字母和数字');
  }
  return value;
}
export function cookie(token, request, age = 43200) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `studio_session=${token}; Path=/api/studio; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
}
export function sessionToken(request) {
  return (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('studio_session='))?.slice(15) || '';
}
export async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, '请使用 JSON 请求');
  const reader = request.body?.getReader();
  if (!reader) fail(400, '缺少请求内容');
  let size = 0; const chunks = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); fail(413, '本次内容过长，请精简对话和资料'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, '请求内容应为对象');
    return parsed;
  } catch { fail(400, 'JSON 格式不正确'); }
}
export function checkOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, '请求来源校验失败', 'ORIGIN_REJECTED');
}
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
