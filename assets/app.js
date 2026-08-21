const state = { user:null, page:'dashboard', categories:[], audience:null, customer:null, conversation:null, scene:'consult' };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtDate(value) { if(!value) return '—'; try { return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date(value)); } catch { return value; } }
function fmtMoney(value) { return '¥' + Number(value || 0).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.remove('hidden'); setTimeout(()=>node.classList.add('hidden'),2300); }
function loading(text='正在加载…') { $('#main-content').innerHTML=`<div class="loading-card">${esc(text)}</div>`; }

async function api(path, options={}) {
  const config={...options,headers:{'Content-Type':'application/json',...(options.headers||{})}};
  const response=await fetch(path,config);
  const result=await response.json().catch(()=>({success:false,error:{message:'响应格式错误'}}));
  if(response.status===401){ showLogin(); throw new Error('请先登录'); }
  if(!response.ok || !result.success) throw new Error(result.error?.message || '请求失败');
  return result.data;
}

function showLogin(){ $('#app').classList.add('hidden'); $('#login-view').classList.remove('hidden'); }
function showApp(){ $('#login-view').classList.add('hidden'); $('#app').classList.remove('hidden'); }

async function bootstrap(){
  try{
    state.user=await api('/api/me');
    $('#user-name').textContent=state.user.display_name;
    $('#user-role').textContent=state.user.role;
    $('#user-avatar').textContent=state.user.display_name.slice(0,1);
    showApp(); navigate('dashboard');
  }catch{ showLogin(); }
}

$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault(); const form=new FormData(e.currentTarget);
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(form))});
    state.user=await api('/api/me'); showApp();
    $('#user-name').textContent=state.user.display_name; $('#user-role').textContent=state.user.role;
    navigate('dashboard');
  }catch(err){ toast(err.message); }
});

$('#logout-button').addEventListener('click',async()=>{ try{await api('/api/logout',{method:'POST',body:'{}'});}catch{} showLogin(); });
$$('.nav-item').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
$('#drawer-backdrop').addEventListener('click',closeDrawer);

function setHeader(title, crumb){ $('#page-title').textContent=title; $('#breadcrumb').textContent=`运营中台 / ${crumb}`; }
function setNav(page){ $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); }
async function navigate(page){
  state.page=page; setNav(page); closeDrawer(); loading();
  try{
    if(page==='dashboard') await renderDashboard();
    if(page==='assets') await renderAssets();
    if(page==='members') await renderMembers();
    if(page==='campaigns') await renderCampaigns();
    if(page==='communities') await renderCommunities();
    if(page==='analytics') await renderAnalytics();
  }catch(err){ $('#main-content').innerHTML=`<div class="empty-card">加载失败：${esc(err.message)}</div>`; }
}

function assetCard(item){
  return `<button class="asset-card" style="--accent:${esc(item.color)}" onclick="openAudience('${esc(item.code)}')">
    <div class="asset-icon">${esc(item.name.slice(0,1))}</div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p>
    <div class="asset-stats"><div><strong>${item.customer_count}</strong><span>资产用户</span></div><div><strong>${item.average_score}</strong><span>平均意向</span></div></div><b class="asset-arrow">→</b>
  </button>`;
}

async function renderDashboard(){
  setHeader('早上好，欢迎回来','运营总览'); const data=await api('/api/v1/private/dashboard'); state.categories=data.categories;
  const m=data.metrics;
  $('#main-content').innerHTML=`
    <section class="hero"><div><p class="hero-kicker">PRIVATE DOMAIN INTELLIGENCE</p><h3>让每一份用户资产，都被更好地理解与运营</h3><p>统一客户事实、AI历史画像与个性化Agent话术已经就绪。</p></div><button class="primary-button" onclick="navigate('assets')">进入用户资产 →</button></section>
    <div class="metric-grid">
      ${metric('用户资产',m.customers,'统一客户主档')}${metric('可触达用户',m.reachable,'已通过授权校验')}${metric('会员账户',m.members,'等级与权益在线')}
      ${metric('累计成交',fmtMoney(m.revenue),'演示数据口径')}${metric('运行中活动',m.running_campaigns,'旅程持续执行')}${metric('画像覆盖率',m.profile_coverage+'%','结构化事实 + AI摘要')}
    </div>
    <div class="section-heading"><div><h3>用户资产</h3><p>按产品关注与行为证据形成四类运营视图</p></div><button class="text-button" onclick="navigate('assets')">查看全部 →</button></div>
    <div class="asset-grid">${data.categories.map(assetCard).join('')}</div>
    <div class="panel-grid"><section class="panel"><div class="panel-title"><h4>最近活跃用户</h4><span>实时更新</span></div>${data.recent_customers.map(c=>`
      <div class="customer-mini" onclick="openCustomer(${c.id})"><div class="mini-avatar">${esc(c.name.slice(0,1))}</div><div><strong>${esc(c.name)}</strong><p>${esc(c.last_interaction)}</p></div><b>${esc(c.member_level)}</b></div>`).join('')}</section>
      <section class="panel"><div class="panel-title"><h4>AI画像健康度</h4><span>今日</span></div><div class="activity-ring"><div class="ring"><div><strong>${m.profile_coverage}%</strong><span>画像覆盖</span></div></div></div><div class="legend"><span>● 已更新</span><span>○ 待刷新</span></div></section></div>`;
}
function metric(label,value,note){return `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`}

async function renderAssets(){
  setHeader('用户资产','用户资产 / 总览'); const data=await api('/api/v1/private/user-assets'); state.categories=data.categories;
  const total=data.categories.reduce((s,x)=>s+x.customer_count,0);
  $('#main-content').innerHTML=`<section class="hero"><div><p class="hero-kicker">USER ASSET CENTER</p><h3>统一看见，持续理解，精准沟通</h3><p>当前四类资产共 ${total} 个有效归属；同一用户可按事实进入多个板块，画像与对话始终共享。</p></div></section>
    <div class="section-heading"><div><h3>选择用户资产板块</h3><p>每个板块拥有独立列表、筛选与运营入口</p></div><span>更新于 ${fmtDate(data.updated_at)}</span></div>
    <div class="asset-grid">${data.categories.map(assetCard).join('')}</div>
    <section class="panel"><div class="panel-title"><h4>资产口径说明</h4><span>规则版本 V1</span></div><p style="color:var(--muted);line-height:1.8">用户归属由购买、咨询、活动互动或人工确认等证据生成。常规品人群不会因“缺少功效品数据”而被自动纳入；所有归属均可追溯，不复制客户主档。</p></section>`;
}

async function openAudience(code,q=''){
  state.audience=code; loading('正在载入用户资产…');
  const data=await api(`/api/v1/private/user-assets/${encodeURIComponent(code)}/customers?q=${encodeURIComponent(q)}`);
  setHeader(data.audience.name,`用户资产 / ${data.audience.name}`);
  $('#main-content').innerHTML=`<button class="back-button" onclick="navigate('assets')">← 返回用户资产</button>
    <div class="section-heading"><div><h3>${esc(data.audience.name)}</h3><p>${esc(data.audience.description)} · 共 ${data.pagination.total} 位用户</p></div></div>
    <div class="toolbar"><div class="search-box"><input id="asset-search" placeholder="搜索姓名、手机号后四位或顾问" value="${esc(q)}"></div><button class="secondary-button" onclick="searchAudience()">搜索</button><button class="filter-button">筛选 ▾</button></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>用户</th><th>资产与会员</th><th>消费记录</th><th>AI历史画像</th><th>最近互动</th><th>操作</th></tr></thead><tbody>
    ${data.items.map(c=>`<tr onclick="openCustomer(${c.id})"><td><div class="user-cell"><div class="mini-avatar">${esc(c.name.slice(0,1))}</div><div><strong>${esc(c.name)}</strong><span>${esc(c.phone)} · ${esc(c.owner)}</span></div></div></td>
      <td>${c.assets.slice(0,2).map(a=>`<span class="tag">${esc(a.name)}</span>`).join('')}<br><span class="tag green">${esc(c.member_level)}</span></td>
      <td><strong>${fmtMoney(c.total_amount)}</strong><br><span style="color:var(--muted);font-size:10px">${c.order_count}笔 · ${fmtDate(c.last_purchase_at)}</span></td>
      <td class="profile-cell">${esc(c.profile.summary.slice(0,62))}…<br>${c.profile.tags.slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</td>
      <td class="profile-cell">${esc(c.last_interaction)}</td><td><button class="action-link" onclick="event.stopPropagation();openCustomer(${c.id})">查看 / 对话</button></td></tr>`).join('')}
    </tbody></table><div class="pagination-note">第 ${data.pagination.page} 页，共 ${data.pagination.total} 条；列表按最近数据变化排序</div></div>`;
  $('#asset-search').addEventListener('keydown',e=>{if(e.key==='Enter')searchAudience();});
}
function searchAudience(){openAudience(state.audience,$('#asset-search').value.trim())}

async function openCustomer(id){
  try{
    const data=await api(`/api/v1/private/customers/${id}`); state.customer=data;
    const profile=data.ai_profile;
    showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><div class="drawer-user"><div class="mini-avatar">${esc(data.name.slice(0,1))}</div><div><h3>${esc(data.name)}</h3><p>${esc(data.phone)} · ${esc(data.city)} · ${esc(data.owner)}负责</p></div></div>
      <div class="drawer-actions"><button class="primary-button" onclick="startConversation(${data.id})">发起 Agent 对话</button><button class="secondary-button" onclick="refreshProfile(${data.id})">刷新画像</button></div></div>
      <div class="drawer-body"><div class="detail-metrics">${detailMetric('累计消费',fmtMoney(data.total_amount))}${detailMetric('订单',data.order_count+'笔')}${detailMetric('会员',data.member_level)}${detailMetric('积分',data.points)}</div>
      <section class="profile-box"><div class="profile-meta"><span>AI 历史画像 · ${esc(profile.provider)}</span><span>置信度 ${Math.round(profile.confidence*100)}% · ${fmtDate(profile.generated_at)}</span></div><h4>用户洞察</h4><p>${esc(profile.summary)}</p><div>${profile.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="evidence-list">${profile.evidence.map(e=>`<span>依据 · ${esc(e.label)}</span>`).join('')}</div></section>
      <section class="detail-section"><h4>推荐下一步</h4><ol class="recommend-list">${profile.suggestions.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="detail-section"><h4>购买记录</h4>${data.orders.length?data.orders.map(o=>`<div class="timeline-item"><time>${fmtDate(o.purchased_at)}</time><p><strong>${esc(o.product_name)}</strong><br>${fmtMoney(o.amount)} · ${esc(o.status)}</p></div>`).join(''):'<p>暂无购买记录</p>'}</section>
      <section class="detail-section"><h4>互动记录</h4>${data.interactions.length?data.interactions.map(i=>`<div class="timeline-item"><time>${fmtDate(i.occurred_at)}</time><p>${esc(i.content)}<br><span class="tag">${esc(i.channel)}</span></p></div>`).join(''):'<p>暂无互动记录</p>'}</section></div>`);
  }catch(err){toast(err.message)}
}
function detailMetric(label,value){return `<div class="detail-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function showDrawer(html){$('#drawer-content').innerHTML=html;$('#drawer').classList.remove('hidden');$('#drawer-backdrop').classList.remove('hidden')}
function closeDrawer(){ $('#drawer').classList.add('hidden');$('#drawer-backdrop').classList.add('hidden');state.conversation=null; }
async function refreshProfile(id){try{await api(`/api/v1/private/customers/${id}/ai-profile/refresh`,{method:'POST',body:'{}'});toast('画像已生成新版本');await openCustomer(id)}catch(err){toast(err.message)}}

async function startConversation(customerId){
  try{
    const conversation=await api(`/api/v1/private/customers/${customerId}/agent-conversations`,{method:'POST',body:JSON.stringify({scene:'consult',audience_code:state.audience})});
    state.conversation=conversation; state.scene='consult'; renderChat([]);
  }catch(err){toast(err.message)}
}
function renderChat(messages){
  const c=state.customer; const p=c.ai_profile;
  showDrawer(`<div class="chat-layout"><header class="chat-header"><button class="back-button" onclick="openCustomer(${c.id})">←</button><div class="mini-avatar">${esc(c.name.slice(0,1))}</div><div><h3>与 ${esc(c.name)} 沟通</h3><p>${esc(c.assets.map(a=>a.name).join(' · '))} · ${esc(c.member_level)}</p></div><button class="drawer-close" onclick="closeDrawer()">×</button></header>
    <div class="chat-context"><strong>当前画像：</strong>${esc(p.summary.slice(0,150))}…</div>
    <main id="chat-messages" class="chat-messages"><div class="suggestion-card"><h5>Agent 已就绪</h5><p class="reason">输入客户最新消息，我会结合画像、历史行为、当前场景与知识库生成个性化话术。</p></div>${messages.map(renderMessage).join('')}</main>
    <footer class="chat-composer"><div class="scene-row">${[['ice_break','破冰'],['consult','咨询'],['objection','异议'],['push','推动'],['follow','跟进'],['complaint','投诉']].map(([k,v])=>`<button class="scene-chip ${state.scene===k?'active':''}" onclick="selectScene('${k}')">${v}</button>`).join('')}</div><div class="compose-row"><textarea id="chat-input" placeholder="粘贴或输入客户刚刚说的话…"></textarea><button id="send-message" class="primary-button" onclick="sendMessage()">生成话术</button></div></footer></div>`);
  const area=$('#chat-messages'); if(area) area.scrollTop=area.scrollHeight;
}
function renderMessage(m){
  if(m.role==='customer') return `<div class="message customer"><div class="message-bubble">${esc(m.content)}</div></div>`;
  const s=m.suggestion||{}; return `<div class="message"><div class="message-bubble">${esc(m.content)}</div></div>${s.reply?`<div class="suggestion-card"><h5>个性化话术建议 · ${esc(s.provider||'Agent')}</h5><blockquote>${esc(s.reply)}</blockquote>${(s.alternatives||[]).map((a,i)=>`<div class="alternative"><strong>备选 ${i+1}</strong>　${esc(a)}</div>`).join('')}<p class="reason">${esc(s.recommendation_reason||'')} · ${(s.policy_flags||[]).map(x=>esc(x)).join(' / ')}</p><button class="secondary-button" onclick="copyText(decodeURIComponent('${encodeURIComponent(s.reply)}'))">复制话术</button></div>`:''}`;
}
function selectScene(scene){state.scene=scene;$$('.scene-chip').forEach(x=>x.classList.toggle('active',x.getAttribute('onclick').includes(`'${scene}'`)))}
async function sendMessage(){
  const input=$('#chat-input'); const text=input.value.trim(); if(!text)return toast('请输入客户消息');
  const button=$('#send-message');button.disabled=true;button.textContent='生成中…';
  try{
    await api(`/api/v1/private/agent-conversations/${state.conversation.id}/messages`,{method:'POST',body:JSON.stringify({message:text,scene:state.scene})});
    const data=await api(`/api/v1/private/agent-conversations/${state.conversation.id}`); renderChat(data.messages);
  }catch(err){toast(err.message);button.disabled=false;button.textContent='生成话术'}
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('话术已复制')}catch{toast('请手动复制话术')}}

async function renderMembers(){
  setHeader('会员中心','会员资产');const rows=await api('/api/v1/private/members');
  $('#main-content').innerHTML=`<div class="section-heading"><div><h3>会员资产</h3><p>等级、积分和权益统一管理</p></div></div><div class="metric-grid">${metric('会员总数',rows.length,'统一会员账户')}${metric('黑金会员',rows.filter(x=>x.level==='黑金').length,'高价值会员')}${metric('积分余额',rows.reduce((s,x)=>s+x.points,0).toLocaleString(),'可用积分')}</div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>会员</th><th>等级</th><th>成长值</th><th>积分</th><th>权益</th><th>顾问</th></tr></thead><tbody>${rows.map(x=>`<tr onclick="openCustomer(${x.customer_id})"><td><strong>${esc(x.name)}</strong><br><span>${esc(x.member_no)}</span></td><td><span class="tag green">${esc(x.level)}</span></td><td>${x.growth_value}</td><td>${x.points}</td><td>${x.benefits.map(b=>`<span class="tag">${esc(b)}</span>`).join('')}</td><td>${esc(x.owner)}</td></tr>`).join('')}</tbody></table></div>`;
}
async function renderCampaigns(){
  setHeader('营销活动','活动与旅程');const rows=await api('/api/v1/private/campaigns');
  $('#main-content').innerHTML=`<div class="section-heading"><div><h3>活动与自动化旅程</h3><p>以用户资产为入口，连接内容、触达与转化</p></div><button class="primary-button">创建活动</button></div><div class="card-list">${rows.map(x=>{const rate=x.reached?Math.round(x.converted/x.reached*100):0;return `<article class="info-card"><span class="status-pill ${esc(x.status)}">${esc(x.status)}</span><h4>${esc(x.name)}</h4><p>${esc(x.audience_name||'全量人群')} · 目标：${esc(x.goal)}</p><div class="big">${rate}%</div><span style="color:var(--muted);font-size:10px">转化率 · ${x.converted}/${x.reached}</span><div class="progress"><i style="width:${rate}%"></i></div></article>`}).join('')}</div>`;
}
async function renderCommunities(){
  setHeader('社群运营','社群运营');const rows=await api('/api/v1/private/communities');
  $('#main-content').innerHTML=`<div class="section-heading"><div><h3>社群健康度</h3><p>群成员、活跃、内容与转化统一追踪</p></div><button class="primary-button">新建社群SOP</button></div><div class="card-list">${rows.map(x=>`<article class="info-card"><span class="status-pill active">运营中</span><h4>${esc(x.name)}</h4><p>${esc(x.theme)} · ${esc(x.owner)}负责</p><div class="big">${x.member_count}<small style="font-size:10px;color:var(--muted)"> 人</small></div><div class="progress"><i style="width:${Math.round(x.active_rate*100)}%"></i></div><p>活跃率 ${Math.round(x.active_rate*100)}%　转化率 ${Math.round(x.conversion_rate*100)}%</p></article>`).join('')}</div>`;
}
async function renderAnalytics(){
  setHeader('数据分析','资产洞察');const data=await api('/api/v1/private/analytics/overview');const max=Math.max(...data.categories.map(x=>x.revenue),1);
  $('#main-content').innerHTML=`<div class="section-heading"><div><h3>用户资产经营分析</h3><p>规模、购买与转化采用统一口径</p></div><span>生成于 ${fmtDate(data.generated_at)}</span></div><div class="panel-grid"><section class="panel"><div class="panel-title"><h4>四类资产成交贡献</h4><span>累计</span></div>${data.categories.map(x=>`<div class="bar-row"><span>${esc(x.name)}</span><div class="bar"><i style="width:${Math.round(x.revenue/max*100)}%;background:${esc(x.color)}"></i></div><b>${fmtMoney(x.revenue)}</b></div>`).join('')}</section><section class="panel"><div class="panel-title"><h4>资产转化概览</h4><span>购买用户 / 资产用户</span></div>${data.categories.map(x=>`<div class="customer-mini"><div class="asset-icon" style="--accent:${esc(x.color)}">${esc(x.name.slice(0,1))}</div><div><strong>${esc(x.name)}</strong><p>${x.buyers} 位购买用户</p></div><b>${x.conversion_rate}%</b></div>`).join('')}</section></div>`;
}

window.navigate=navigate;window.openAudience=openAudience;window.searchAudience=searchAudience;window.openCustomer=openCustomer;window.closeDrawer=closeDrawer;window.refreshProfile=refreshProfile;window.startConversation=startConversation;window.selectScene=selectScene;window.sendMessage=sendMessage;window.copyText=copyText;
bootstrap();
