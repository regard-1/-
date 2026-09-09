export const AUDIENCES = { anti_aging: '抗衰用户', daily_nutrition: '日常营养补充用户' };
export const SCENES = [
  { id: 'needs', label: '需求澄清', icon: 'messages-square', goal: '确认客户最在意的一点' },
  { id: 'product', label: '产品咨询', icon: 'package', goal: '回答产品问题，确认是否适合继续了解' },
  { id: 'activity', label: '活动价格', icon: 'badge-percent', goal: '核清权益与价格，确认购买意向' },
  { id: 'purchase', label: '购买确认', icon: 'shopping-bag', goal: '确认产品、规格和数量' },
  { id: 'objection', label: '顾虑异议', icon: 'message-circle-question-mark', goal: '回应具体顾虑，减少决策障碍' },
  { id: 'usage', label: '服用与搭配', icon: 'notebook-tabs', goal: '依据产品资料说明用法与边界' },
  { id: 'aftercare', label: '售后反馈', icon: 'heart-handshake', goal: '先处理使用体验和服务诉求' },
  { id: 'repurchase', label: '复购咨询', icon: 'refresh-cw', goal: '确认使用情况和本次补充需求' },
];
export const MODEL = 'qwen3.8-max-0902';
export const MONTHLY_LIMIT = 300_000_000; // Integer micro-yuan, never floating-point accounting.
export const OUTPUT_TOKENS = 1800;
export function maskText(value = '') {
  return String(value)
    .replace(/(?:https?:\/\/)?[^\s]*\/hook\/[^\s]+/gi, '[已隐藏访问地址]')
    .replace(/(\b(?:password|passwd|token|api[_-]?key|secret|authorization|cookie)\b|密码|令牌)\s*["']?\s*[:=：]\s*(?:"[^"]*"|'[^']*'|[^\n,，;；]+)/gi, '$1=[已隐藏]')
    .replace(/\b(?:sk-[\w-]{8,}|github_pat_[\w]+|ghp_[\w]+)\b/g, '[已隐藏令牌]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)|(?<!\d)\d{15}(?!\d)/g, '[已隐藏证件号]')
    .replace(/(?<!\d)(?:\+?86[ -]?)?(1[3-9](?:[ -]?\d){9})(?!\d)/g, (_, phone) => `尾号${phone.replace(/\D/g, '').slice(-4)}`);
}
export function monthKey(date = new Date()) {
  return chinaDay(date).slice(0, 7);
}
export function chinaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function maskData(value) {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map(maskData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskData(item)]));
  return value;
}
