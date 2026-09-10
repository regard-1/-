import { createIcons, icons } from 'lucide';
import { AUDIENCES, SCENES, maskText, escapeHtml as esc, chinaDay } from '../shared.mjs';

const $ = selector => document.querySelector(selector);
const root = $('#root'), modal = $('#modal');
const draft = () => ({ salutation: '', needs: '', goal: '', supplement: '', instruction: '' });
const state = { user: null, csrf: '', page: 'generate', audience: 'anti_aging', scene: 'needs', draft: draft(), composer: { text: '', role: 'user' }, editing: null, messages: [], result: null, selected: new Set(), materials: [], filter: 'all', pending: false, error: '', feedback: '', configured: false, sequence: 0, controller: null, conflicts: [] };
let noticeTimer;
const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const action = (name, text, ico, cls = '', extra = '') => `<button type="button" data-action="${name}" class="${cls}" ${extra}>${ico ? icon(ico) : ''}${esc(text)}</button>`;
const field = (name, label, value = '', options = {}) => `<div class="field ${options.optional ? 'optional' : ''}"><label for="${name}">${label}</label>${options.textarea ? `<textarea id="${name}" name="${name}" rows="${options.rows || 3}" maxlength="${options.max || 6000}" ${options.required ? 'required' : ''}>${esc(value)}</textarea>` : `<input id="${name}" name="${name}" value="${esc(value)}" type="${options.type || 'text'}" maxlength="${options.max || 600}" ${options.required ? 'required' : ''} ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}>`}</div>`;
function iconsNow() { createIcons({ icons }); }
function notify(message) { const box = $('#notice'); box.textContent = message; box.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { box.hidden = true; }, 4500); }
function clearConsultation() { state.controller?.abort(); state.sequence++; state.pending = false; state.messages = []; state.result = null; state.conflicts = []; state.draft = draft(); state.composer = { text: '', role: 'user' }; state.editing = null; state.error = ''; state.feedback = ''; }
function capture() { for (const key of Object.keys(state.draft)) { const node = document.getElementById(key); if (node) state.draft[key] = maskText(node.value); } const ci = document.getElementById('composer-text'); if (ci) state.composer.text = maskText(ci.value); if ($('#reply') && state.result) state.result.edited = maskText($('#reply').value); }
async function request(path, options = {}) {
  const response = await fetch(`/api/studio${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(state.csrf ? { 'X-Studio-CSRF': state.csrf } : {}), ...options.headers } });
  let body; try { body = await response.json(); } catch { throw new Error('服务响应异常，请稍后重试'); }
  if (!response.ok || !body.success) {
    const error = new Error(body.error?.message || '操作未完成'); error.status = response.status; error.code = body.error?.code;
    if (response.status === 401 && path !== '/login') { clearConsultation(); state.user = null; state.csrf = ''; state.materials = []; state.selected.clear(); modal.close(); renderLogin(); }
    throw error;
  }
  return body.data;
}
const post = (path, body, extra = {}) => request(path, { method: 'POST', body: JSON.stringify(body), ...extra });
function renderLogin(localSetup = false) {
  root.innerHTML = `<main class="login-page"><form id="login-form" class="login-form" data-setup="${localSetup}"><div><h2>${localSetup ? '创建本机管理员' : '登录话术服务'}</h2><p class="small">${localSetup ? '本地试用环境' : '精准咨询回复'}</p></div>${field('username', '账号', '', { required: true, autocomplete: 'username', max: 40 })}${field('password', localSetup ? '密码（至少12位，含字母和数字）' : '密码', '', { type: 'password', required: true, autocomplete: localSetup ? 'new-password' : 'current-password', max: 128 })}<div id="login-error" role="alert"></div><button class="primary" type="submit">${localSetup ? '创建管理员' : '登录'}${icon('arrow-right')}</button></form></main>`;
  iconsNow();
}
function shell(title) {
  const admin = state.user.role === 'admin';
  root.innerHTML = `<section class="studio-module"><header class="module-toolbar"><nav class="module-tabs" aria-label="话术中心功能">${action('generate-page', '生成回复', 'message-circle', state.page === 'generate' ? 'active' : '')}${action('materials', '团队资料', 'folder-open', state.page === 'materials' ? 'active' : '')}${action('usage', '用量与反馈', 'chart-no-axes-combined', state.page === 'usage' ? 'active' : '')}${admin ? action('users', '试用账号', 'user-round-cog', state.page === 'users' ? 'active' : '') : ''}</nav><div class="module-account"><span class="badge ${state.configured ? '' : 'warn'}">${state.configured ? '真实 AI · 小组试用' : '模型尚未配置'}</span><span class="small">${esc(state.user.display_name)}</span>${action('password', '', 'key-round', 'icon-button quiet', 'title="修改密码" aria-label="修改密码"')}${action('logout', '', 'log-out', 'icon-button quiet', 'title="退出话术服务" aria-label="退出话术服务"')}</div></header><main class="main" id="main" aria-label="${esc(title)}"></main></section>`;
}
function available(material) { const day = chinaDay(); return !!material?.active && ['all', state.audience].includes(material.audience) && (!material.valid_from || material.valid_from <= day) && (!material.valid_to || material.valid_to >= day); }
function autoSelectMaterials() {
  const avail = state.materials.filter(m => available(m));
  for (const m of avail.slice(0, 8)) state.selected.add(m.id);
  for (const id of state.selected) { if (!state.materials.some(m => m.id === id && available(m))) state.selected.delete(id); }
}
const kindName = kind => ({ activity: '当月活动机制', plan: '产品搭配组合', knowledge: '多特倍斯知识库' }[kind]);
function resourceChoices() {
  const rows = state.materials.filter(m => ['all', state.audience].includes(m.audience));
  return rows.length ? `<div class="resource-list">${rows.map(m => `<label class="resource-option ${available(m) ? '' : 'unavailable'}"><input type="checkbox" data-resource="${esc(m.id)}" ${state.selected.has(m.id) ? 'checked' : ''} ${!available(m) ? 'disabled' : ''}><span><strong>${esc(m.title)}</strong><small>${esc(m.product || kindName(m.kind))} · V${m.version}${m.valid_to ? ` · 至 ${esc(m.valid_to)}` : ''}${!available(m) ? ' · 当前不可用' : ''}</small></span></label>`).join('')}</div>` : `<p class="small">当前人群暂无公共资料。${state.user.role === 'admin' ? '可在项目资料中维护。' : '可请管理员添加，或填写本次补充。'}</p>`;
}
function bubbleHtml(m, i) {
  const isCustomer = m.role === 'user';
  const aiBadge = m.ai ? `<span class="ai-badge" title="AI 生成回复">AI</span>` : '';
  if (state.editing === i) return `<div class="bubble-wrap ${isCustomer ? 'left' : 'right'}"><div class="bubble editing"><textarea id="edit-text" rows="3" maxlength="8000">${esc(m.content)}</textarea><div class="bubble-edit-actions">${action('save-edit', '确认', 'check', 'primary', `data-index="${i}"`)}${action('cancel-edit', '取消', 'x', 'quiet')}</div></div></div>`;
  return `<div class="bubble-wrap ${isCustomer ? 'left' : 'right'}"><div class="bubble ${isCustomer ? 'customer' : 'staff'}">${aiBadge}<div class="bubble-content">${esc(m.content)}</div></div><div class="bubble-actions">${action('edit-message', '', 'pencil', 'icon-button quiet', `data-index="${i}" title="编辑" aria-label="编辑"`)}${action('delete-message', '', 'trash-2', 'icon-button quiet', `data-index="${i}" title="删除" aria-label="删除"`)}</div></div>`;
}
function threadHtml() { return state.messages.length ? state.messages.map((m, i) => bubbleHtml(m, i)).join('') : '<div class="thread-empty">添加客户消息开始对话</div>'; }
function canGenerate() { return state.configured && !state.pending && ((state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'user') || (state.composer.text.trim() && state.composer.role === 'user')); }
function generator() {
  state.page = 'generate'; shell('话术中心');
  const goal = SCENES.find(s => s.id === state.scene).goal;
  $('#main').innerHTML = `<div class="row between page-intro"><div class="audiences" role="group" aria-label="用户类型">${Object.entries(AUDIENCES).map(([id, name]) => action('audience', name, id === 'anti_aging' ? 'sparkles' : 'sun', state.audience === id ? 'active' : '', `data-id="${id}" aria-pressed="${state.audience === id}"`)).join('')}</div>${action('new', '新咨询', 'plus', '')}</div><div class="field-label">咨询场景</div><div class="scenes" role="group" aria-label="咨询场景">${SCENES.map(s => action('scene', s.label, s.icon, `scene ${state.scene === s.id ? 'active' : ''}`, `data-id="${s.id}" aria-pressed="${state.scene === s.id}"`)).join('')}</div>${!state.configured ? '<div class="warning">真实生成服务尚未配置。可先维护项目资料和试用账号。</div>' : ''}<div class="generator-grid"><section class="input-column"><div class="input-heading row between"><h2>本次咨询</h2><span class="small">${state.messages.filter(m => m.role === 'assistant').length ? '连续接话中' : '独立咨询'}</span></div><div class="thread" id="thread">${threadHtml()}</div>${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ''}<div class="composer"><div class="composer-row"><button type="button" data-action="toggle-role" class="role-badge ${state.composer.role}">${state.composer.role === 'user' ? '客户' : '营养师'}</button><textarea id="composer-text" rows="2" maxlength="8000" placeholder="输入消息，添加到对话">${esc(state.composer.text)}</textarea>${action('add-message', '添加', 'plus', 'icon-button')}</div><button type="button" data-action="run" class="primary" ${!canGenerate() ? 'disabled' : ''}>${icon(state.pending ? 'loader-circle' : 'wand-sparkles', state.pending ? 'spinner' : '')}${state.pending ? '正在核对资料并生成…' : '生成回复'}</button></div><div class="resource-section"><div class="field-label row between"><span>引用公共资料 · 已选 ${state.selected.size} 条</span><span class="small">已自动勾选可用资料</span></div>${resourceChoices()}</div><details class="details"><summary>补充信息 · 称呼、补充资料</summary><div class="two-fields">${field('salutation', '客户称呼（可选）', state.draft.salutation, { max: 30, optional: true })}${field('needs', '用户需求（可自动提取）', state.draft.needs, { optional: true })}</div>${field('goal', '销售目标（可自动建议）', state.draft.goal, { optional: true, max: 400 })}<p class="small">场景目标：${esc(goal)}</p>${field('supplement', '本次补充 · 活动、产品资料或待补信息', state.draft.supplement, { textarea: true, rows: 4 })}${field('instruction', '回复侧重点（可选）', state.draft.instruction, { optional: true, max: 500 })}</details></section><section class="result-column" aria-label="回复建议" aria-busy="${state.pending}"><div class="row between result-header"><h2>回复建议</h2>${state.result?.status === 'ready' ? '<span class="badge">待顾问确认</span>' : ''}</div>${resultHtml()}</section></div>`;
  iconsNow();
}
function resultHtml() {
  if (state.pending) return `<div class="result-placeholder">${icon('loader-circle', 'spinner')}<p>正在生成本次回复…</p>${action('cancel', '取消', 'x', 'quiet')}</div>`;
  const r = state.result;
  if (!r) return `<div class="result-placeholder">${icon('message-circle')}<p>等待本次咨询</p><span class="small">${esc(SCENES.find(s => s.id === state.scene).label)} · ${esc(AUDIENCES[state.audience])}</span></div>`;
  if (r.status === 'needs_input') return `<div class="missing-box"><h3>${icon('circle-help')} 需要补充关键信息</h3>${r.missing_fields.map(m => `<p>${esc(m.question)}</p>`).join('')}${r.conflicts.map((c, index) => `<label class="conflict"><input type="checkbox" data-conflict="${index}" ${state.conflicts.includes(c) ? 'checked' : ''}><span>已核实以下冲突，并在本次补充中明确选用依据：${esc(c)}</span></label>`).join('')}<span class="small">补充资料后重新生成</span></div>${inferredHtml(r)}`;
  return `<div class="reply-box"><label class="sr-label" hidden for="reply">客户回复</label><textarea id="reply" aria-label="客户回复" maxlength="3000">${esc(r.edited ?? r.reply)}</textarea><div class="reply-tools"><div class="row">${action('shorter', '更简短', 'align-left', 'quiet')}${action('warmer', '更口语', 'message-circle', 'quiet')}</div>${action('copy', '复制回复', 'copy', '')}</div></div><div class="row output-actions">${action('adopt', '采用并继续接话', 'check', 'primary')}</div><section class="next-step"><h3>下一步</h3><p>${esc(r.next_step)}</p></section>${r.followups.length ? `<details class="details"><summary>客户回应后怎么接</summary>${r.followups.map(f => `<div class="followup"><strong>${esc(f.when)}</strong><p>${esc(f.reply)}</p></div>`).join('')}</details>` : ''}${inferredHtml(r)}<details class="details"><summary>资料依据 · ${r.used_sources.length} 条</summary>${r.used_sources.map(s => `<div class="fact-line"><b>${esc(state.materials.find(m => m.id === s.id)?.title || '销售本次补充')} · V${s.version}</b><p>${esc(s.quote)}</p></div>`).join('') || '<p class="small">本次仅澄清需求，未引用产品事实。</p>'}</details><div class="feedback"><span>这条回复</span>${[['direct','直接可用'],['edited','小改可用'],['unusable','不可用']].map(([id,label]) => action('feedback', label, '', state.feedback === id ? 'active' : '', `data-id="${id}"`)).join('')}</div><p class="small result-timing">本次生成 ${(r.elapsed_ms / 1000).toFixed(1)} 秒</p>`;
}
function inferredHtml(r) { return `<details class="details"><summary>需求与目标建议</summary><p class="fact-line">需求：${esc(r.inferred.needs || '待明确')}</p><p class="fact-line">目标：${esc(r.inferred.goal || '待明确')}</p><p class="fact-line">依据：${esc(r.inferred.evidence)}</p>${action('use-inferred', '填入建议', 'arrow-up-left', 'quiet')}</details>`; }
async function run(style = 'normal') {
  capture();
  if (state.pending) return;
  if (state.composer.text.trim() && state.composer.role === 'user') {
    if (state.messages.length >= 20) { notify('本次对话已达上限，请新建咨询'); return; }
    state.messages.push({ role: 'user', content: maskText(state.composer.text.trim()) }); state.composer.text = '';
  }
  if (!state.messages.length || state.messages[state.messages.length - 1].role !== 'user') { notify('请先添加客户消息'); $('#composer-text')?.focus(); return; }
  const rewrite = state.result?.edited ?? state.result?.reply ?? ''; const current = ++state.sequence; state.controller = new AbortController(); state.pending = true; state.error = ''; state.result = null; state.feedback = '';
  const body = { audience: state.audience, scene: state.scene, messages: state.messages, ...state.draft, rewrite: style === 'normal' ? '' : rewrite, style, confirmed_conflicts: state.conflicts,
    resources: [...state.selected].map(id => ({ id, version: state.materials.find(m => m.id === id)?.version })) };
  generator();
  try {
    const result = await post('/generations', body, { signal: state.controller.signal });
    if (current !== state.sequence) return;
    state.result = result;
  } catch (error) { if (current !== state.sequence) return; state.error = error.name === 'AbortError' ? '已取消生成' : error.message; }
  finally { if (current === state.sequence) { state.pending = false; if (state.user && state.page === 'generate') generator(); } }
}
async function loadMaterials() { const items = (await request('/materials')).items; if(state.result?.used_sources.some(ref => ref.id !== 'supplement' && !items.some(m => m.id === ref.id && m.version === ref.version && available(m)))) state.result=null; state.materials = items; autoSelectMaterials(); }
function materialsPage() {
  state.page = 'materials'; shell('项目资料');
  const rows = state.materials.filter(m => state.filter === 'all' || m.kind === state.filter);
  $('#main').innerHTML = `<div class="row between materials-toolbar"><div class="filters">${[['all','全部资料'],['activity','当月活动机制'],['plan','产品搭配组合'],['knowledge','多特倍斯知识库']].map(([id,label]) => action('material-filter', label, '', state.filter === id ? 'active' : '', `data-id="${id}"`)).join('')}</div>${state.user.role === 'admin' ? action('new-material', '添加资料', 'plus', 'primary') : '<span class="badge blue">公共资料 · 只读</span>'}</div><div class="material-list">${rows.map(m => `<article class="material-item"><div class="row between"><h3>${esc(m.title)}</h3><span class="badge ${m.active ? '' : 'warn'}">${m.active ? '已确认' : '已停用'} · V${m.version}</span></div><div class="material-meta"><span>${esc(kindName(m.kind))}</span><span>${esc(AUDIENCES[m.audience] || '两类人群通用')}</span><span>${esc(m.product || '未指定产品')}</span>${m.valid_to ? `<span>${esc(m.valid_from)} 至 ${esc(m.valid_to)}</span>` : ''}</div><p>${esc(m.content)}</p>${state.user.role === 'admin' ? `<div class="material-controls">${action('edit-material','编辑','pencil','',`data-id="${esc(m.id)}"`)}${action('material-versions','版本记录','history','quiet',`data-id="${esc(m.id)}"`)}</div>` : ''}</article>`).join('') || '<div class="empty">暂无资料。已核对的活动机制和产品说明可在此维护。</div>'}</div>`;
  iconsNow();
}
function showModal(html) { modal.innerHTML = html; modal.showModal(); iconsNow(); }
const modalHead = title => `<header><h2>${esc(title)}</h2>${action('close-modal','','x','icon-button quiet','aria-label="关闭" title="关闭"')}</header>`;
function materialEditor(id = '') {
  const m = state.materials.find(x => x.id === id) || { title: '', product: '', content: '', kind: 'knowledge', audience: 'all', valid_from: '', valid_to: '', active: 1 };
  showModal(`${modalHead(id ? '编辑公共资料' : '添加公共资料')}<form id="material-form" data-id="${esc(id)}" data-version="${m.version || 0}">${field('material-title','资料标题',m.title,{required:true,max:100})}<div class="two-fields"><div class="field"><label for="material-kind">资料类型</label><select name="kind" id="material-kind">${['activity','plan','knowledge'].map(k => `<option value="${k}" ${m.kind===k?'selected':''}>${kindName(k)}</option>`).join('')}</select></div><div class="field"><label for="material-audience">适用人群</label><select name="audience" id="material-audience">${Object.entries({all:'两类人群通用',...AUDIENCES}).map(([id,label])=>`<option value="${id}" ${m.audience===id?'selected':''}>${esc(label)}</option>`).join('')}</select></div></div>${field('material-product','产品名称',m.product,{max:120})}<div class="two-fields">${field('material-from','生效日期',m.valid_from,{type:'date'})}${field('material-to','结束日期',m.valid_to,{type:'date'})}</div>${field('material-content','资料正文',m.content,{textarea:true,rows:8,required:true,max:10000})}<label class="row"><input name="active" type="checkbox" ${m.active?'checked':''}>启用资料</label><label class="row"><input name="confirmed" type="checkbox" required>已核对资料内容及适用条件</label><div class="form-error" role="alert"></div><footer>${action('close-modal','取消','','quiet')}<button class="primary" type="submit">${icon('save')}保存资料</button></footer></form>`);
}
async function usersPage() {
  state.page = 'users'; const version = state.sequence; const data = await request('/users'); if (version !== state.sequence || !state.user) return; shell('试用账号');
  $('#main').innerHTML = `<div class="row between page-intro"><span class="muted">${data.items.length} 个试用账号</span>${action('new-user','添加账号','user-plus','primary')}</div><div class="table-scroll"><table class="table"><thead><tr><th>账号</th><th>名称</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>${data.items.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.display_name)}</td><td>${u.role==='admin'?'管理员':'销售'}</td><td>${u.active?'可用':'停用'}${u.must_change?' · 待改密码':''}</td><td>${action('toggle-user',u.active?'停用':'启用','',u.active?'danger':'',`data-id="${u.id}" data-active="${u.active}"`)} ${action('reset-user','重置密码','','',`data-id="${u.id}"`)}</td></tr>`).join('')}</tbody></table></div>`; iconsNow();
}
async function usagePage() {
  state.page = 'usage'; const version = state.sequence; const data = await request('/usage'); if (version !== state.sequence || !state.user) return; shell('用量与反馈');
  const {summary:s}=data;
  $('#main').innerHTML = `<div class="row between page-intro"><h2>模型用量</h2><span class="badge blue">${state.user.role==='admin'?'小组汇总':'我的使用'}</span></div><div class="usage-grid"><div class="usage-stat"><small>本月调用</small><strong>${s.calls||0}</strong><small>含待补信息和失败请求</small></div><div class="usage-stat"><small>已评价回复可用率</small><strong>${s.rated?Math.round(s.adopted/s.rated*100)+'%':'待评价'}</strong><small>${s.rated||0} 条评价 · 直接可用或小改可用</small></div><div class="usage-stat"><small>十秒内完成</small><strong>${s.ready?Math.round(s.fast/s.ready*100)+'%':'待统计'}</strong><small>${s.fast||0} / ${s.ready||0} 条完整回复</small></div></div><p class="small">用量不限。调用结果不明确的请求按预占金额计入用量，费用以服务商账单为准。</p>`; iconsNow();
}
function passwordDialog(forced = false) { showModal(`${modalHead(forced ? '首次登录 · 修改临时密码' : '修改密码')}<form id="password-form">${field('current-password','当前密码','',{type:'password',required:true,autocomplete:'current-password',max:128})}${field('new-password','新密码（至少12位，含字母和数字）','',{type:'password',required:true,autocomplete:'new-password',max:128})}<div class="form-error" role="alert"></div><footer><button type="submit" class="primary">保存并重新登录</button></footer></form>`); }
function userEditor(id = '') { showModal(`${modalHead(id?'重置临时密码':'添加试用账号')}<form id="user-form" data-id="${esc(id)}">${id?'':`${field('new-username','账号','',{required:true,max:40})}${field('display-name','显示名称','',{required:true,max:40})}<div class="field"><label for="user-role">角色</label><select name="role" id="user-role"><option value="sales">销售</option><option value="admin">管理员</option></select></div>`}${field('temporary-password','临时密码（至少12位，含字母和数字）','',{type:'password',required:true,autocomplete:'new-password',max:128})}<div class="form-error" role="alert"></div><footer><button type="submit" class="primary">${id?'重置密码':'创建账号'}</button></footer></form>`); }
async function enter() {
  const me = await request('/me'); state.user = me.user; state.csrf = me.csrf; state.configured = me.model_configured;
  if (state.user.must_change) { shell('首次登录'); $('#main').innerHTML = '<div class="warning">请先修改临时密码。</div>'; iconsNow(); passwordDialog(true); return; }
  await loadMaterials(); generator();
}
document.addEventListener('input', e => { if (e.target.id in state.draft) { state.draft[e.target.id] = maskText(e.target.value); if (state.pending) { state.controller?.abort(); state.sequence++; state.pending=false; } if (state.result) { state.result=null; $('.result-column').innerHTML='<h2>回复建议</h2><p class="muted">咨询内容已调整，请重新生成。</p>'; } const runButton=$('[data-action="run"]'); if(runButton) { runButton.disabled=!state.configured; runButton.textContent='生成回复'; } } if (e.target.id === 'composer-text') { state.composer.text = maskText(e.target.value); if (state.pending) { state.controller?.abort(); state.sequence++; state.pending=false; } if (state.result) { state.result=null; $('.result-column').innerHTML='<h2>回复建议</h2><p class="muted">咨询内容已调整，请重新生成。</p>'; } const rb=$('[data-action="run"]'); if(rb) { rb.disabled=!canGenerate(); } } });
document.addEventListener('change', e => {
  if(e.target.dataset.resource){capture();if(e.target.checked){if(state.selected.size>=8){e.target.checked=false;notify('最多引用八条资料');return;}state.selected.add(e.target.dataset.resource);}else state.selected.delete(e.target.dataset.resource); state.controller?.abort();state.sequence++;state.pending=false;state.result=null; generator();}
  if(e.target.dataset.conflict!==undefined){const c=state.result?.conflicts[Number(e.target.dataset.conflict)];if(c){state.conflicts=state.conflicts.filter(x=>x!==c);if(e.target.checked)state.conflicts.push(c);}}
});
document.addEventListener('click', async e => {
  const button=e.target.closest('[data-action]');if(!button)return;
  const a=button.dataset.action,id=button.dataset.id,idx=button.dataset.index;
  try {
    if(a==='close-modal'){modal.close();return;}
    if(a==='run')return await run();
    if(a==='shorter'||a==='warmer')return await run(a);
    if(a==='cancel'){state.controller?.abort();state.sequence++;state.pending=false;state.error='已取消生成';generator();return;}
    if(a==='new'){clearConsultation();generator();return;}
    if(a==='toggle-role'){capture();state.composer.role=state.composer.role==='user'?'assistant':'user';generator();$('#composer-text')?.focus();return;}
    if(a==='add-message'){capture();const t=state.composer.text.trim();if(!t){notify('请输入消息内容');return;}if(state.messages.length>=20){notify('本次对话已达上限，请新建咨询');return;}state.messages.push({role:state.composer.role,content:maskText(t)});state.composer.text='';state.composer.role=state.composer.role==='user'?'assistant':'user';state.editing=null;generator();$('#composer-text')?.focus();return;}
    if(a==='edit-message'){capture();state.editing=Number(idx);generator();return;}
    if(a==='delete-message'){capture();state.messages.splice(Number(idx),1);if(state.editing===Number(idx))state.editing=null;state.result=null;state.error='';generator();return;}
    if(a==='save-edit'){const t=maskText($('#edit-text').value.trim());if(!t){notify('消息不能为空');return;}state.messages[Number(idx)].content=t;state.editing=null;generator();return;}
    if(a==='cancel-edit'){state.editing=null;generator();return;}
    if(a==='audience'||a==='scene'){capture();state.controller?.abort();state.sequence++;state.pending=false;state.result=null;state.conflicts=[];if(a==='audience'){state.audience=id;state.selected.clear();autoSelectMaterials();}else state.scene=id;generator();return;}
    if(a==='copy'){const value=maskText($('#reply').value);await navigator.clipboard.writeText(value);notify('已复制客户回复');return;}
    if(a==='adopt'){capture();const reply=state.result?.edited??state.result?.reply;if(!reply?.trim())return notify('回复不能为空');if(state.messages.length>=20)return notify('本次对话已达上限，请新建咨询');state.messages.push({role:'assistant',content:maskText(reply),ai:true});state.result=null;state.conflicts=[];state.draft.instruction='';state.composer.role='user';state.error='';generator();$('#composer-text')?.focus();return;}
    if(a==='feedback'){await post('/feedback',{generation_id:state.result.generation_id,rating:id});state.feedback=id;capture();generator();return;}
    if(a==='use-inferred'){capture();state.draft.needs=state.result.inferred.needs;state.draft.goal=state.result.inferred.goal;generator();return;}
    if(a==='logout'){try{await post('/logout',{});}finally{clearConsultation();state.user=null;state.csrf='';state.materials=[];state.selected.clear();renderLogin();}return;}
    if(a==='password'){passwordDialog();return;}
    if(a==='new-material'||a==='edit-material'){materialEditor(id);return;}
    if(a==='material-filter'){state.filter=id;materialsPage();return;}
    if(a==='material-versions'){const data=await request(`/materials/${id}/versions`);showModal(`${modalHead('资料版本记录')}<div class="stack">${data.items.map(v=>{const m=JSON.parse(v.snapshot);return `<section><h3>V${v.version} · ${esc(m.title)}</h3><p class="small">${esc(new Date(v.updated_at).toLocaleString('zh-CN'))}</p><p class="resource-preview">${esc(m.content)}</p></section>`;}).join('')}</div>`);return;}
    if(a==='new-user'||a==='reset-user'){userEditor(id);return;}
    if(a==='toggle-user'){await request(`/users/${id}`,{method:'PUT',body:JSON.stringify({active:button.dataset.active!=='1'})});await usersPage();return;}
    capture();state.controller?.abort();const version=++state.sequence;state.pending=false;
    if(a==='materials'){await loadMaterials();if(version===state.sequence&&state.user)materialsPage();}
    if(a==='generate-page')generator();
    if(a==='users')await usersPage();
    if(a==='usage')await usagePage();
  }catch(error){notify(error.message);}
});
document.addEventListener('submit', async e=>{
  const form=e.target;if(!['login-form','material-form','password-form','user-form'].includes(form.id))return;e.preventDefault();
  const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try {
    const values=Object.fromEntries(new FormData(form));
    if(form.id==='login-form'){
      const credentials={username:values.username,password:values.password};
      if(form.dataset.setup==='true')await post('/setup',credentials);
      await post('/login',credentials);form.reset();await enter();return;
    }
    if(form.id==='material-form'){
      const body={title:values['material-title'],product:values['material-product'],content:maskText(values['material-content']),kind:values.kind,audience:values.audience,valid_from:values['material-from'],valid_to:values['material-to'],active:values.active==='on',confirmed:values.confirmed==='on',version:Number(form.dataset.version)};
      if(form.dataset.id)await request(`/materials/${form.dataset.id}`,{method:'PUT',body:JSON.stringify(body)});else await post('/materials',body);
      modal.close();state.result=null;state.conflicts=[];await loadMaterials();materialsPage();notify('公共资料已保存');return;
    }
    if(form.id==='password-form'){await post('/password',{current_password:values['current-password'],new_password:values['new-password']});form.reset();modal.close();clearConsultation();state.user=null;state.csrf='';state.materials=[];renderLogin();notify('密码已修改，请重新登录');return;}
    if(form.id==='user-form'){
      if(form.dataset.id)await request(`/users/${form.dataset.id}`,{method:'PUT',body:JSON.stringify({password:values['temporary-password']})});
      else await post('/users',{username:values['new-username'],display_name:values['display-name'],password:values['temporary-password'],role:values.role});
      form.reset();modal.close();await usersPage();notify('账号已更新，首次登录需修改临时密码');
    }
  }catch(error){const box=form.querySelector('.form-error')||$('#login-error');if(box){box.className='error';box.textContent=error.message;}}
  finally{submit.disabled=false;}
});
window.addEventListener('pagehide',()=>{clearConsultation();root.replaceChildren();modal.replaceChildren();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try{await enter();}catch{try{const status=await request('/status');state.configured=status.model_configured;renderLogin(status.local_setup);}catch{renderLogin();$('#login-error').className='error';$('#login-error').textContent='服务暂时无法连接，请稍后重试';}}
