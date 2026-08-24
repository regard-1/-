const state = { session:null, page:'home', mode:'simple', purpose:'first', topics:[], chat:[], preferences:null };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtDate(value) { if(!value) return '—'; try { return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(new Date(value)); } catch { return value; } }
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.remove('hidden'); setTimeout(()=>node.classList.add('hidden'),2400); }
function loading(text='正在加载…') { $('#main-content').innerHTML=`<div class="loading-card">${esc(text)}</div>`; }

async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const result=await response.json().catch(()=>({success:false,error:{message:'响应格式错误'}}));
  if(!response.ok || !result.success) throw new Error(result.error?.message || '请求失败');
  return result.data;
}

function showWelcome(){ $('#app').classList.add('hidden'); $('#welcome-view').classList.remove('hidden'); }
function showApp(){ $('#welcome-view').classList.add('hidden'); $('#app').classList.remove('hidden'); }
function closeDrawer(){ $('#drawer').classList.add('hidden'); $('#drawer-backdrop').classList.add('hidden'); }
function showDrawer(html){ $('#drawer-content').innerHTML=html; $('#drawer').classList.remove('hidden'); $('#drawer-backdrop').classList.remove('hidden'); }

$$('#purpose-grid .purpose-card').forEach(button=>button.addEventListener('click',()=>{
  state.purpose=button.dataset.purpose;
  $$('#purpose-grid .purpose-card').forEach(x=>x.classList.toggle('selected',x===button));
}));
$$('#welcome-mode button').forEach(button=>button.addEventListener('click',()=>{
  state.mode=button.dataset.mode;
  $$('#welcome-mode button').forEach(x=>x.classList.toggle('active',x===button));
}));
$('#start-button').addEventListener('click',startExperience);
$('#drawer-backdrop').addEventListener('click',closeDrawer);
$('#mobile-menu').addEventListener('click',()=>$('#consumer-nav').classList.toggle('open'));
$$('[data-page]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));

async function startExperience(){
  const button=$('#start-button'); button.disabled=true; button.textContent='正在准备…';
  try{
    state.session=await api('/api/v1/user/session',{method:'POST',body:JSON.stringify({purpose:state.purpose,mode:state.mode,save_history:$('#welcome-consent').checked})});
    state.mode=state.session.mode; showApp();
    $('#header-name').textContent=state.session.display_name; $('#header-avatar').textContent=state.session.display_name.slice(0,1);
    await navigate(state.purpose==='question'?'consult':state.purpose==='compare'?'knowledge':'home');
  }catch(err){ toast(err.message); }
  finally{ button.disabled=false; button.innerHTML='开始体验 <span>→</span>'; }
}

async function bootstrap(){
  try{
    state.session=await api('/api/v1/user/session');
    state.mode=state.session.mode || 'simple'; showApp();
    $('#header-name').textContent=state.session.display_name; $('#header-avatar').textContent=state.session.display_name.slice(0,1);
    await navigate('home');
  }catch{ showWelcome(); }
}

function setNav(page){
  state.page=page;
  $$('.consumer-nav-item,.mobile-bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  $('#consumer-nav').classList.remove('open');
}
async function navigate(page){
  if(!page) return; setNav(page); closeDrawer(); loading(); window.scrollTo({top:0,behavior:'smooth'});
  try{
    if(page==='home') await renderHome();
    else if(page==='knowledge') await renderKnowledge();
    else if(page==='consult') await renderConsult();
    else if(page==='focus') await renderFocus();
    else if(page==='reminders') await renderReminders();
    else if(page==='messages') await renderMessages();
    else if(page==='settings') await renderSettings();
  }catch(err){ $('#main-content').innerHTML=`<div class="empty-card">暂时无法加载：${esc(err.message)}<br><button class="secondary-button" onclick="navigate('${esc(page)}')">重新尝试</button></div>`; }
}

function topicCard(topic,compact=false){
  return `<article class="topic-card ${compact?'compact':''}" style="--topic:${esc(topic.color)}">
    <button class="topic-main" onclick="openTopic('${esc(topic.id)}')"><span class="topic-icon">${esc(topic.short)}</span><div><small>${esc(topic.category)}</small><h3>${esc(topic.title)}</h3><p>${esc(state.mode==='professional'?topic.professional_intro:topic.simple_intro)}</p></div></button>
    <div class="topic-footer"><span>${esc(topic.read_time)}分钟阅读</span><button class="save-topic ${topic.saved?'saved':''}" onclick="toggleSaved('${esc(topic.id)}',event)">${topic.saved?'已关注':'＋ 关注'}</button></div>
  </article>`;
}

async function renderHome(){
  const data=await api('/api/v1/user/home'); state.topics=data.topics; state.preferences=data.preferences; updateMessageCount(data.unread_messages);
  $('#main-content').innerHTML=`
    <section class="consumer-hero"><div><p class="hero-kicker">${esc(data.date_label)}</p><h1>${esc(data.greeting)}，今天想先了解什么？</h1><p>从一个问题开始。你可以随时切换解释方式，也可以直接咨询人工服务。</p><div class="hero-actions"><button class="primary-button" onclick="navigate('consult')">向AI提问 <span>→</span></button><button class="soft-button" onclick="requestHuman()">联系人工顾问</button></div></div><div class="hero-visual"><span>安心了解</span><strong>先解释<br>再选择</strong><small>非医疗诊断</small></div></section>
    <section class="quick-section"><div class="consumer-section-title"><div><span>从兴趣开始</span><h2>常见关注方向</h2></div><button onclick="navigate('knowledge')">查看全部 →</button></div><div class="topic-grid">${data.topics.slice(0,4).map(x=>topicCard(x,true)).join('')}</div></section>
    <section class="journey-grid">
      <article class="continue-card"><div class="card-kicker">继续上一次</div><h3>${esc(data.recent_conversation.title)}</h3><p>${esc(data.recent_conversation.summary)}</p><div><span>${esc(fmtDate(data.recent_conversation.updated_at))}</span><button onclick="navigate('consult')">继续咨询 →</button></div></article>
      <article class="reminder-card"><div class="card-kicker">下一条提醒</div>${data.next_reminder?`<h3>${esc(data.next_reminder.title)}</h3><p>${esc(data.next_reminder.schedule_label)}</p><div class="reminder-actions"><button onclick="snoozeReminder('${data.next_reminder.id}')">延后一天</button><button onclick="navigate('reminders')">管理提醒</button></div>`:`<h3>暂时没有提醒</h3><p>你可以为想继续了解的内容设置一次提醒。</p><button onclick="openReminderForm()">设置提醒</button>`}</article>
    </section>
    <section class="trust-strip"><div><span>✓</span><strong>内容有来源</strong><small>重点信息展示更新时间</small></div><div><span>◷</span><strong>时间由你决定</strong><small>随时暂停或调整提醒</small></div><div><span>○</span><strong>资料由你控制</strong><small>只展示你主动保存的内容</small></div><div><span>↗</span><strong>随时转人工</strong><small>复杂问题不由AI强行回答</small></div></section>`;
}

async function renderKnowledge(query=''){
  const data=await api(`/api/v1/user/knowledge?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(state.mode)}`); state.topics=data.items;
  $('#main-content').innerHTML=`<section class="page-intro"><p class="hero-kicker">KNOWLEDGE CENTER</p><h1>把复杂信息讲清楚</h1><p>浏览成分、适用边界和注意事项。内容用于知识了解，不代替专业医疗意见。</p></section>
    <div class="knowledge-toolbar"><div class="consumer-search"><span>⌕</span><input id="knowledge-search" value="${esc(query)}" placeholder="搜索成分或问题"></div><div class="segmented"><button class="${state.mode==='simple'?'active':''}" onclick="switchMode('simple')">简单易懂</button><button class="${state.mode==='professional'?'active':''}" onclick="switchMode('professional')">详细专业</button></div></div>
    <div class="knowledge-filters">${['全部','能量与活力','抗氧化','日常营养','安全与注意'].map((x,i)=>`<button class="${i===0?'active':''}" onclick="filterKnowledge('${esc(x)}',this)">${esc(x)}</button>`).join('')}</div>
    <div id="knowledge-grid" class="topic-grid large">${data.items.map(x=>topicCard(x)).join('')||'<div class="empty-card">没有找到相关内容，可以换个关键词或直接咨询。</div>'}</div>`;
  $('#knowledge-search').addEventListener('keydown',e=>{if(e.key==='Enter')renderKnowledge(e.currentTarget.value.trim())});
}
function filterKnowledge(category,button){
  $$('.knowledge-filters button').forEach(x=>x.classList.toggle('active',x===button));
  const items=category==='全部'?state.topics:state.topics.filter(x=>x.category===category);
  $('#knowledge-grid').innerHTML=items.map(x=>topicCard(x)).join('')||'<div class="empty-card">该分类暂时没有内容。</div>';
}
async function switchMode(mode){ state.mode=mode; await api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({content_mode:mode})}); if(state.page==='knowledge')renderKnowledge(); else renderSettings(); }

async function openTopic(id){
  try{
    const topic=await api(`/api/v1/user/knowledge/${encodeURIComponent(id)}?mode=${encodeURIComponent(state.mode)}`);
    showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">${esc(topic.category)}</p><h2>${esc(topic.title)}</h2><p>${esc(topic.subtitle)}</p></div><div class="drawer-body article-body"><div class="article-notice">内容更新时间：${esc(fmtDate(topic.updated_at))}　·　用于知识了解，不构成诊断或治疗建议</div><h3>${state.mode==='professional'?'详细说明':'简单来说'}</h3><p>${esc(state.mode==='professional'?topic.professional_content:topic.simple_content)}</p><h3>你可能关心</h3>${topic.key_points.map(x=>`<div class="knowledge-point"><span>✓</span><p>${esc(x)}</p></div>`).join('')}<h3>注意事项</h3><div class="caution-box">${esc(topic.caution)}</div><div class="source-box"><strong>内容来源</strong><p>${esc(topic.source)}</p></div><div class="drawer-sticky-actions"><button class="soft-button" onclick="toggleSaved('${esc(topic.id)}',event)">${topic.saved?'取消关注':'加入我的关注'}</button><button class="primary-button" onclick="askAboutTopic('${esc(topic.title)}')">继续向AI提问</button></div></div>`);
  }catch(err){toast(err.message)}
}
async function toggleSaved(id,event){
  if(event)event.stopPropagation();
  try{ const data=await api(`/api/v1/user/focus/${encodeURIComponent(id)}`,{method:'POST',body:'{}'}); toast(data.saved?'已加入我的关注':'已取消关注'); if(state.page==='focus')renderFocus(); else if(state.page==='knowledge')renderKnowledge($('#knowledge-search')?.value||''); else if(state.page==='home')renderHome(); }catch(err){toast(err.message)}
}
function askAboutTopic(title){ closeDrawer(); state.pendingQuestion=`我想继续了解${title}`; navigate('consult'); }

async function renderConsult(){
  const data=await api('/api/v1/user/conversation'); state.chat=data.messages;
  $('#main-content').innerHTML=`<section class="consult-shell"><aside class="consult-side"><p class="hero-kicker">AI ASSISTANT</p><h2>健康知识咨询</h2><p>你可以直接提问。涉及诊断、用药或紧急身体状况时，请咨询专业医疗人员。</p><div class="mode-card"><span>当前解释方式</span><strong>${state.mode==='professional'?'详细专业':'简单易懂'}</strong><button onclick="switchConsultMode()">切换</button></div><button class="human-button" onclick="requestHuman()"><span>↗</span><div><strong>联系人工顾问</strong><small>复杂问题可转人工继续</small></div></button><div class="privacy-note">本次回答只使用当前对话和你主动保存的偏好，不展示或输出系统内部分类。</div></aside>
    <section class="consult-chat"><header><div><span class="online-dot"></span><strong>多特倍斯AI助手</strong><small>知识辅助 · 非医疗诊断</small></div><button onclick="clearConversationPreview()">新问题</button></header><main id="chat-messages" class="consumer-chat-messages">${data.messages.map(renderChatMessage).join('')}</main><footer><div class="quick-prompts">${data.quick_prompts.map(x=>`<button onclick="usePrompt(decodeURIComponent('${encodeURIComponent(x)}'))">${esc(x)}</button>`).join('')}</div><div class="consumer-composer"><textarea id="chat-input" placeholder="输入你想了解的问题…"></textarea><button id="send-button" onclick="sendUserMessage()">发送 →</button></div><label><input id="save-chat" type="checkbox" ${data.save_history?'checked':''}> 保存本次咨询记录</label></footer></section></section>`;
  if(state.pendingQuestion){$('#chat-input').value=state.pendingQuestion;state.pendingQuestion='';}
  const area=$('#chat-messages'); area.scrollTop=area.scrollHeight;
}
function renderChatMessage(message){
  if(message.role==='user')return `<div class="consumer-message user"><div class="message-bubble">${esc(message.content)}</div><time>${esc(message.time_label||'刚刚')}</time></div>`;
  return `<div class="consumer-message assistant"><div class="assistant-mark">D</div><div><div class="answer-card">${esc(message.content)}</div>${message.notice?`<p class="answer-notice">${esc(message.notice)}</p>`:''}${message.actions?.length?`<div class="answer-actions">${message.actions.map(x=>`<button onclick="handleChatAction('${esc(x.action)}')">${esc(x.label)}</button>`).join('')}</div>`:''}<time>${esc(message.time_label||'刚刚')}</time></div></div>`;
}
function usePrompt(text){ $('#chat-input').value=text; $('#chat-input').focus(); }
async function sendUserMessage(){
  const input=$('#chat-input'),text=input.value.trim(); if(!text)return toast('请输入问题');
  const button=$('#send-button'); button.disabled=true; button.textContent='回答中…';
  try{ await api('/api/v1/user/conversation/messages',{method:'POST',body:JSON.stringify({message:text,mode:state.mode,save_history:$('#save-chat').checked})}); await renderConsult(); }
  catch(err){toast(err.message);button.disabled=false;button.textContent='发送 →';}
}
function handleChatAction(action){ if(action==='human')requestHuman(); if(action==='reminder')openReminderForm(); if(action==='knowledge')navigate('knowledge'); }
function switchConsultMode(){ state.mode=state.mode==='simple'?'professional':'simple'; api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({content_mode:state.mode})}).then(renderConsult); }
function clearConversationPreview(){ api('/api/v1/user/conversation/clear',{method:'POST',body:'{}'}).then(renderConsult); }

async function requestHuman(){
  try{ const result=await api('/api/v1/user/support/handoff',{method:'POST',body:JSON.stringify({source:state.page})}); showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">HUMAN SUPPORT</p><h2>已为你保留人工服务入口</h2><p>你可以选择合适的联系方式和时间。</p></div><div class="drawer-body"><div class="handoff-status"><span>✓</span><div><strong>${esc(result.status_label)}</strong><p>${esc(result.description)}</p></div></div><label class="form-label">希望通过<select id="handoff-channel"><option>在线文字</option><option>企业微信</option><option>电话回访</option></select></label><label class="form-label">方便联系的时间<select id="handoff-time"><option>今天 18:00 后</option><option>明天上午</option><option>周末</option><option>仅在线留言，不回电</option></select></label><button class="primary-button full" onclick="confirmHandoff()">确认服务偏好</button><p class="form-note">演示环境不会真实提交联系方式。</p></div>`); }catch(err){toast(err.message)}
}
function confirmHandoff(){ closeDrawer(); toast('服务偏好已保存'); }

async function renderFocus(){
  const data=await api('/api/v1/user/focus'); state.topics=data.saved_topics;
  $('#main-content').innerHTML=`<section class="page-intro"><p class="hero-kicker">MY FOCUS</p><h1>我的关注</h1><p>这里仅展示你主动选择的主题、收藏内容和待处理事项。</p></section><section class="focus-summary"><div><span>已关注主题</span><strong>${data.interests.length}</strong></div><div><span>已收藏内容</span><strong>${data.saved_topics.length}</strong></div><div><span>待继续咨询</span><strong>${data.pending_questions}</strong></div></section><div class="consumer-section-title"><div><span>你主动选择的内容</span><h2>关注方向</h2></div></div><div class="interest-pills">${data.available_interests.map(x=>`<button class="${data.interests.includes(x)?'selected':''}" onclick="toggleInterest('${esc(x)}')">${data.interests.includes(x)?'✓ ': '＋ '}${esc(x)}</button>`).join('')}</div><div class="consumer-section-title spaced"><div><span>方便以后继续查看</span><h2>收藏内容</h2></div><button onclick="navigate('knowledge')">发现更多 →</button></div><div class="topic-grid">${data.saved_topics.map(x=>topicCard(x)).join('')||'<div class="empty-card">还没有收藏内容。你可以在知识中心选择“关注”。</div>'}</div>`;
}
async function toggleInterest(name){ await api('/api/v1/user/interests',{method:'POST',body:JSON.stringify({name})}); renderFocus(); }

async function renderReminders(){
  const data=await api('/api/v1/user/reminders');
  $('#main-content').innerHTML=`<section class="page-intro split"><div><p class="hero-kicker">MY REMINDERS</p><h1>我的提醒</h1><p>提醒由你创建，也可以随时延后、暂停或关闭。</p></div><button class="primary-button" onclick="openReminderForm()">＋ 设置提醒</button></section><div class="reminder-preference"><span>◷</span><div><strong>当前免打扰：${esc(data.quiet_hours)}</strong><p>服务提醒不会在免打扰时段发送</p></div><button onclick="navigate('settings')">修改</button></div><div class="reminder-list">${data.items.map(r=>`<article class="user-reminder ${r.status}"><div class="reminder-date"><strong>${esc(r.day)}</strong><span>${esc(r.month)}</span></div><div><span class="status-label">${esc(r.status_label)}</span><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><small>${esc(r.schedule_label)} · ${esc(r.channel)}</small></div><div class="reminder-menu"><button onclick="snoozeReminder('${r.id}')">延后</button><button onclick="toggleReminder('${r.id}')">${r.status==='active'?'暂停':'恢复'}</button></div></article>`).join('')||'<div class="empty-card">暂时没有提醒。</div>'}</div>`;
}
function openReminderForm(){
  showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">NEW REMINDER</p><h2>设置一次提醒</h2><p>你可以随时延后或关闭。</p></div><div class="drawer-body"><label class="form-label">提醒内容<input id="reminder-title" value="继续了解我关注的内容" maxlength="60"></label><label class="form-label">提醒时间<select id="reminder-when"><option value="tomorrow">明天这个时间</option><option value="week">一周后</option><option value="month">一个月后</option></select></label><label class="form-label">提醒方式<select id="reminder-channel"><option>站内消息</option><option>企业微信</option><option>仅在下次打开时提醒</option></select></label><button class="primary-button full" onclick="createReminder()">保存提醒</button><p class="form-note">提醒不会覆盖你的免打扰设置。</p></div>`);
}
async function createReminder(){
  const title=$('#reminder-title').value.trim(); if(!title)return toast('请输入提醒内容');
  await api('/api/v1/user/reminders',{method:'POST',body:JSON.stringify({title,when:$('#reminder-when').value,channel:$('#reminder-channel').value})}); closeDrawer();toast('提醒已设置');if(state.page==='reminders')renderReminders();
}
async function snoozeReminder(id){ await api(`/api/v1/user/reminders/${id}/snooze`,{method:'POST',body:'{}'});toast('已延后一天');if(state.page==='home')renderHome();else renderReminders(); }
async function toggleReminder(id){ await api(`/api/v1/user/reminders/${id}/toggle`,{method:'POST',body:'{}'});renderReminders(); }

async function renderMessages(){
  const data=await api('/api/v1/user/messages'); updateMessageCount(data.unread);
  $('#main-content').innerHTML=`<section class="page-intro split"><div><p class="hero-kicker">MESSAGES</p><h1>消息中心</h1><p>只包含你允许接收的服务消息和提醒。</p></div><button class="soft-button" onclick="markAllRead()">全部标为已读</button></section><div class="message-settings-link"><span>当前频率：${esc(data.frequency_label)}</span><button onclick="navigate('settings')">调整消息偏好 →</button></div><div class="inbox-list">${data.items.map(x=>`<article class="inbox-item ${x.read?'':'unread'}" onclick="openMessage('${x.id}')"><span class="inbox-icon">${esc(x.icon)}</span><div><div><strong>${esc(x.title)}</strong><time>${esc(x.time_label)}</time></div><p>${esc(x.summary)}</p></div></article>`).join('')}</div>`;
}
function updateMessageCount(count){const node=$('#message-count');node.textContent=count;node.classList.toggle('hidden',!count)}
async function markAllRead(){await api('/api/v1/user/messages/read-all',{method:'POST',body:'{}'});renderMessages()}
async function openMessage(id){const data=await api(`/api/v1/user/messages/${id}`);showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">SERVICE MESSAGE</p><h2>${esc(data.title)}</h2><p>${esc(data.time_label)}</p></div><div class="drawer-body article-body"><p>${esc(data.content)}</p>${data.action?`<button class="primary-button full" onclick="closeDrawer();navigate('${esc(data.action.page)}')">${esc(data.action.label)}</button>`:''}<button class="text-action" onclick="muteSimilar('${esc(data.type)}')">不再接收此类非必要消息</button></div>`);updateMessageCount(data.unread)}
async function muteSimilar(type){await api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({mute_type:type})});closeDrawer();toast('已更新消息偏好')}

async function renderSettings(){
  const data=await api('/api/v1/user/preferences'); state.preferences=data;
  $('#main-content').innerHTML=`<section class="page-intro"><p class="hero-kicker">MY SETTINGS</p><h1>我的资料与偏好</h1><p>这里仅包含你主动填写的信息、授权和服务设置。</p></section><div class="settings-layout"><nav class="settings-nav"><button class="active" onclick="showSettingsPanel('basic',this)">基本资料</button><button onclick="showSettingsPanel('content',this)">内容偏好</button><button onclick="showSettingsPanel('contact',this)">联系与提醒</button><button onclick="showSettingsPanel('privacy',this)">隐私与授权</button><button onclick="showSettingsPanel('family',this)">家庭与代理</button><button onclick="showSettingsPanel('help',this)">帮助与反馈</button></nav><section id="settings-panel" class="settings-panel">${settingsBasic(data)}</section></div>`;
}
function settingsBasic(data){return `<div class="settings-heading"><h2>基本资料</h2><p>只填写提供服务所需要的信息。</p></div><div class="settings-form"><label>称呼<input id="pref-name" value="${esc(data.display_name)}" maxlength="20"></label><label>所在地区<input id="pref-city" value="${esc(data.city)}" maxlength="30"></label><label>当前主要关注<select id="pref-goal">${data.available_goals.map(x=>`<option ${x===data.primary_goal?'selected':''}>${esc(x)}</option>`).join('')}</select></label><button class="primary-button" onclick="saveBasicSettings()">保存修改</button></div>`}
function settingsContent(data){return `<div class="settings-heading"><h2>内容偏好</h2><p>这些选择全部由你设置，也可以随时修改。</p></div><div class="preference-row"><div><strong>解释方式</strong><p>决定知识内容和AI回答的详细程度</p></div><div class="segmented"><button class="${data.content_mode==='simple'?'active':''}" onclick="switchMode('simple')">简单易懂</button><button class="${data.content_mode==='professional'?'active':''}" onclick="switchMode('professional')">详细专业</button></div></div><div class="preference-row"><div><strong>保存咨询记录</strong><p>关闭后新对话不会保存到历史记录</p></div><label class="switch"><input id="pref-history" type="checkbox" ${data.save_history?'checked':''} onchange="saveToggle('save_history',this.checked)"><i></i></label></div><div class="preference-row"><div><strong>根据主动关注提供相关内容</strong><p>仅使用你主动选择的关注主题</p></div><label class="switch"><input id="pref-personal" type="checkbox" ${data.personalized_content?'checked':''} onchange="saveToggle('personalized_content',this.checked)"><i></i></label></div>`}
function settingsContact(data){return `<div class="settings-heading"><h2>联系与提醒</h2><p>你的设置优先于系统默认值。</p></div><div class="settings-form"><label>主要服务渠道<select id="pref-channel">${['站内消息','企业微信','仅下次打开时'].map(x=>`<option ${x===data.channel?'selected':''}>${x}</option>`).join('')}</select></label><label>消息频率<select id="pref-frequency">${['只接收我设置的提醒','每周最多一次','每月最多两次','暂停全部非必要消息'].map(x=>`<option ${x===data.frequency?'selected':''}>${x}</option>`).join('')}</select></label><div class="two-fields"><label>免打扰开始<input id="quiet-start" type="time" value="${esc(data.quiet_start)}"></label><label>免打扰结束<input id="quiet-end" type="time" value="${esc(data.quiet_end)}"></label></div><button class="primary-button" onclick="saveContactSettings()">保存联系偏好</button></div>`}
function settingsPrivacy(data){return `<div class="settings-heading"><h2>隐私与授权</h2><p>你可以分别控制记录保存和服务消息。</p></div><div class="privacy-banner"><span>○</span><div><strong>这里只展示你主动保存的信息</strong><p>包括自己填写的资料、主动关注、咨询记录和授权状态。</p></div></div><div class="preference-row"><div><strong>保存体验数据</strong><p>用于在本设备继续上次体验</p></div><label class="switch"><input type="checkbox" ${data.save_local?'checked':''} onchange="saveToggle('save_local',this.checked)"><i></i></label></div><div class="preference-row"><div><strong>允许服务提醒</strong><p>仅发送你设置的提醒和必要服务消息</p></div><label class="switch"><input type="checkbox" ${data.service_messages?'checked':''} onchange="saveToggle('service_messages',this.checked)"><i></i></label></div><div class="data-actions"><button onclick="exportMyData()">查看已保存的数据类别</button><button onclick="closePersonalization()">关闭个性化内容</button><button class="danger-text" onclick="showResetConfirmation()">清除本机演示数据</button></div>`}
function settingsFamily(data){return `<div class="settings-heading"><h2>家庭与代理</h2><p>咨询前请先确认是为自己还是为家人了解。</p></div>${data.family_members.length?data.family_members.map(x=>`<div class="family-card"><span>${esc(x.name.slice(0,1))}</span><div><strong>${esc(x.name)}</strong><p>${esc(x.relationship)} · 授权至 ${esc(x.expires_label)}</p></div><button>管理</button></div>`).join(''):'<div class="empty-card small">暂未添加家庭成员。不同家庭成员的咨询记录不会混合。</div>'}<button class="soft-button" onclick="openFamilyForm()">＋ 添加授权关系</button>`}
function settingsHelp(){return `<div class="settings-heading"><h2>帮助与反馈</h2><p>如果AI没有解决问题，可以随时转人工。</p></div><div class="help-grid"><button onclick="requestHuman()"><span>↗</span><strong>联系人工顾问</strong><small>复杂问题继续由人工协助</small></button><button onclick="openFeedbackForm()"><span>✎</span><strong>提交体验反馈</strong><small>告诉我们哪里不清楚</small></button><button onclick="navigate('knowledge')"><span>?</span><strong>查看常见问题</strong><small>了解内容来源与使用边界</small></button></div>`}
function showSettingsPanel(panel,button){ $$('.settings-nav button').forEach(x=>x.classList.toggle('active',x===button)); const d=state.preferences; $('#settings-panel').innerHTML=panel==='basic'?settingsBasic(d):panel==='content'?settingsContent(d):panel==='contact'?settingsContact(d):panel==='privacy'?settingsPrivacy(d):panel==='family'?settingsFamily(d):settingsHelp(); }
async function saveBasicSettings(){const data=await api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({display_name:$('#pref-name').value.trim(),city:$('#pref-city').value.trim(),primary_goal:$('#pref-goal').value})});state.preferences=data;$('#header-name').textContent=data.display_name;$('#header-avatar').textContent=data.display_name.slice(0,1);toast('基本资料已保存')}
async function saveContactSettings(){await api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({channel:$('#pref-channel').value,frequency:$('#pref-frequency').value,quiet_start:$('#quiet-start').value,quiet_end:$('#quiet-end').value})});toast('联系偏好已保存')}
async function saveToggle(key,value){state.preferences=await api('/api/v1/user/preferences',{method:'POST',body:JSON.stringify({[key]:value})});toast('设置已更新')}
function exportMyData(){showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">MY DATA</p><h2>已保存的数据类别</h2><p>本演示只保存以下用户主动数据。</p></div><div class="drawer-body"><ul class="data-category-list"><li><strong>基础资料</strong><span>称呼、地区、主动选择的关注方向</span></li><li><strong>体验偏好</strong><span>解释方式、渠道、频率和免打扰时间</span></li><li><strong>使用记录</strong><span>主动收藏、提醒和选择保存的咨询记录</span></li><li><strong>授权状态</strong><span>服务消息和本机保存开关</span></li></ul><div class="article-notice">页面展示范围仅限以上四类信息。</div></div>`)}
async function closePersonalization(){await saveToggle('personalized_content',false)}
function showResetConfirmation(){showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">DATA CONTROL</p><h2>清除本机演示数据？</h2><p>这会删除收藏、提醒、咨询和偏好，并回到欢迎页。</p></div><div class="drawer-body"><button class="danger-button full" onclick="resetDemoData()">确认清除</button><button class="soft-button full" onclick="closeDrawer()">取消</button></div>`)}
async function resetDemoData(){await api('/api/v1/user/reset',{method:'POST',body:'{}'});location.reload()}
function openFamilyForm(){showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">FAMILY ACCESS</p><h2>添加授权关系</h2><p>本演示不会提交真实身份信息。</p></div><div class="drawer-body"><label class="form-label">称呼<input id="family-name" placeholder="例如：家人"></label><label class="form-label">关系<select><option>父母</option><option>配偶</option><option>其他家人</option></select></label><label class="consent-line"><input type="checkbox"> 我已了解：成年家庭成员需要单独授权</label><button class="primary-button full" onclick="closeDrawer();toast('演示关系已保存')">保存演示关系</button></div>`)}
function openFeedbackForm(){showDrawer(`<div class="drawer-header clean"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">FEEDBACK</p><h2>告诉我们哪里需要改进</h2></div><div class="drawer-body"><label class="form-label">反馈类型<select id="feedback-type"><option>内容看不懂</option><option>AI没有解决问题</option><option>提醒太多</option><option>隐私与授权</option><option>其他</option></select></label><label class="form-label">具体说明<textarea id="feedback-text" rows="6" placeholder="请描述你的体验…"></textarea></label><button class="primary-button full" onclick="submitFeedback()">提交反馈</button></div>`)}
async function submitFeedback(){await api('/api/v1/user/feedback',{method:'POST',body:JSON.stringify({type:$('#feedback-type').value,content:$('#feedback-text').value.trim()})});closeDrawer();toast('感谢反馈，我们已经记录')}

window.navigate=navigate;window.openTopic=openTopic;window.toggleSaved=toggleSaved;window.switchMode=switchMode;window.filterKnowledge=filterKnowledge;window.askAboutTopic=askAboutTopic;window.usePrompt=usePrompt;window.sendUserMessage=sendUserMessage;window.handleChatAction=handleChatAction;window.switchConsultMode=switchConsultMode;window.clearConversationPreview=clearConversationPreview;window.requestHuman=requestHuman;window.confirmHandoff=confirmHandoff;window.toggleInterest=toggleInterest;window.openReminderForm=openReminderForm;window.createReminder=createReminder;window.snoozeReminder=snoozeReminder;window.toggleReminder=toggleReminder;window.markAllRead=markAllRead;window.openMessage=openMessage;window.muteSimilar=muteSimilar;window.showSettingsPanel=showSettingsPanel;window.saveBasicSettings=saveBasicSettings;window.saveContactSettings=saveContactSettings;window.saveToggle=saveToggle;window.exportMyData=exportMyData;window.closePersonalization=closePersonalization;window.showResetConfirmation=showResetConfirmation;window.resetDemoData=resetDemoData;window.openFamilyForm=openFamilyForm;window.openFeedbackForm=openFeedbackForm;window.submitFeedback=submitFeedback;window.closeDrawer=closeDrawer;
bootstrap();
