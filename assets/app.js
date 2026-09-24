const state={user:null,studioRole:null,page:'workbench',categories:[],audience:null,audienceQuery:'',audienceOwner:'',audiencePage:1,customer:null,scripts:[],tasks:[],taskCategory:'all',outreachUser:null,outreachCsrf:'',outreachData:null,outreachUsers:[],outreachPending:false,outreachAutoStarted:false,outreachModelConfigured:false,outreachError:'',outreachNotice:'',outreachBatch:null,juziSpOrigin:'',passwordChangeRequired:false,passwordChangeUsername:''};
let navigationVersion=0;
let juziBlinkTimer=null,juziOriginalTitle='';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(value){if(!value)return '—';try{return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch{return value}}
function toast(message){const node=$('#toast');node.textContent=message;node.classList.remove('hidden');setTimeout(()=>node.classList.add('hidden'),2300)}
function loading(text='正在加载…'){$('#main-content').innerHTML=`<div class="loading-card">${esc(text)}</div>`}
async function api(path,options={}){const version=navigationVersion;const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json().catch(()=>({success:false,error:{message:'响应格式错误'}}));if(version!==navigationVersion)throw new DOMException('页面已切换','AbortError');if(response.status===401){showLogin();throw new Error('请先登录')}if(!response.ok||!result.success)throw new Error(result.error?.message||'请求失败');return result.data}
function showLogin(){$('#app').classList.add('hidden');$('#login-view').classList.remove('hidden')}
function showApp(){$('#login-view').classList.add('hidden');$('#app').classList.remove('hidden')}
function showDrawer(html){$('#drawer-content').innerHTML=html;$('#drawer').classList.remove('hidden');$('#drawer-backdrop').classList.remove('hidden')}
function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawer-backdrop').classList.add('hidden')}
function setHeader(title,crumb){$('#page-title').textContent=title;$('#breadcrumb').textContent=`私域运营中台 / ${crumb}`}
function setNav(page){state.page=page;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#main-content').classList.toggle('studio-content',page==='scripts');$('.sync-state').textContent='真实账号 · 权限受控'}

async function bootstrap(){try{const data=await studioApi('/me');applyStudioSession(data);window.DotbestDemoAuth?.set(true);applyUser();showApp();if(data.user?.must_change){renderPasswordChange();return}state.passwordChangeRequired=false;state.passwordChangeUsername='';navigate(initialPage(),'replace')}catch{showLogin()}}
function applyUser(){$('#user-name').textContent=state.user?.display_name||'未登录';$('#user-role').textContent=state.user?.role==='admin'?'管理员':state.user?.role==='sales'?'销售':'团队账号';$('#user-avatar').textContent=state.user?.display_name?.slice(0,1)||'多'}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.currentTarget);const credentials=Object.fromEntries(form);credentials.username=String(credentials.username||'').trim();try{const data=await studioApi('/login',{method:'POST',body:JSON.stringify(credentials)});applyStudioSession(data);window.DotbestDemoAuth?.set(true);applyUser();showApp();if(data.user?.must_change){state.passwordChangeRequired=true;state.passwordChangeUsername=credentials.username;renderPasswordChange();return}state.passwordChangeRequired=false;state.passwordChangeUsername='';const me=await studioApi('/me');applyStudioSession(me);window.DotbestDemoAuth?.set(true);applyUser();navigate(initialPage())}catch(err){toast(err.message)}});
$('#logout-button').addEventListener('click',async()=>{navigationVersion++;$('#main-content').replaceChildren();try{await logoutStudio();state.user=null;state.passwordChangeRequired=false;state.passwordChangeUsername='';window.DotbestDemoAuth?.set(false);showLogin()}catch{toast('退出未完成，请重试')}});
function updateOutreachVisibility(){
  const outreach=$('[data-page="outreach"]');if(outreach)outreach.classList.toggle('hidden',state.studioRole==='sales');
  const juzi=$('[data-page="juzi-workbench"]');if(juzi)juzi.classList.toggle('hidden',state.studioRole!=='admin');
}
function applyStudioSession(data){if(!data?.user||!['admin','sales'].includes(data.user.role))return;state.user=data.user;state.studioRole=data.user.role;state.outreachUser=data.user;state.outreachCsrf=data.csrf||state.outreachCsrf;state.outreachModelConfigured=!!data.model_configured;updateOutreachVisibility()}
function renderPasswordChange(){
  state.passwordChangeRequired=true;
  state.passwordChangeUsername=state.passwordChangeUsername||state.user?.username||'';
  setHeader('首次登录安全设置','账号安全');
  setNav('workbench');
  $('#main-content').innerHTML=`<section class="outreach-login password-change-card">
    <header><h3>修改临时密码</h3><p>为了继续使用完整中台，请先完成本次安全设置。修改后会自动回到你进入前的板块。</p></header>
    <form id="password-change-form">
      <label class="form-label">当前临时密码<input name="current_password" type="password" autocomplete="current-password" required></label>
      <label class="form-label">新密码<input name="new_password" type="password" autocomplete="new-password" minlength="12" required></label>
      <label class="form-label">再次输入新密码<input name="confirm_password" type="password" autocomplete="new-password" minlength="12" required></label>
      <div class="password-change-error" role="alert"></div>
      <button class="primary-button full" type="submit">保存并进入中台</button>
    </form>
  </section>`;
  $('#password-change-form').addEventListener('submit',submitPasswordChange);
}
async function submitPasswordChange(event){
  event.preventDefault();
  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form));
  const submitButton=form.querySelector('[type=submit]');
  if(values.new_password!==values.confirm_password){
    $('.password-change-error').textContent='两次输入的新密码不一致';
    return;
  }
  submitButton.disabled=true;
  $('.password-change-error').textContent='';
  try{
    await studioApi('/password',{method:'POST',body:JSON.stringify({current_password:values.current_password,new_password:values.new_password})});
    const username=state.passwordChangeUsername||state.user?.username;
    const data=await studioApi('/login',{method:'POST',body:JSON.stringify({username,password:values.new_password})});
    const me=await studioApi('/me');
    applyStudioSession(me);
    state.passwordChangeRequired=false;
    state.passwordChangeUsername='';
    window.DotbestDemoAuth?.set(true);
    applyUser();
    toast('密码已更新，已进入完整中台');
    navigate(initialPage(),'replace');
  }catch(error){
    $('.password-change-error').textContent=error.message;
    if(error.status===401){
      state.passwordChangeRequired=false;
      state.passwordChangeUsername='';
      showLogin();
      toast('登录已失效，请重新登录');
    }
  }finally{
    const button=$('#password-change-form [type=submit]');
    if(button)button.disabled=false;
  }
}
async function logoutStudio(){if(!state.outreachCsrf)return;const response=await fetch('/api/studio/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Studio-CSRF':state.outreachCsrf},body:'{}'});if(response.status===401||response.status===404){state.outreachUser=null;state.outreachCsrf='';state.studioRole=null;state.user=null;updateOutreachVisibility();return}if(!response.ok)throw new Error('退出未完成');state.outreachUser=null;state.outreachCsrf='';state.studioRole=null;state.user=null;updateOutreachVisibility()}
$$('[data-page]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
$('#drawer-backdrop').addEventListener('click',closeDrawer);
document.addEventListener('change',event=>{
  const bot=event.target.closest('[data-bot]');
  if(bot){assignOutreachBot(bot.dataset.bot,bot.value);return}
  const contact=event.target.closest('[data-contact]');
  if(contact)bindOutreachContact(contact.dataset.contact,contact.value);
});

async function navigate(page,historyMode='push'){if(!page)return;if(state.passwordChangeRequired){toast('请先完成临时密码修改');return}const version=++navigationVersion;setNav(page);closeDrawer();loading();if(historyMode!=='none'){const url=new URL(location.href);url.searchParams.set('page',page);if(url.href!==location.href)history[historyMode==='replace'?'replaceState':'pushState']({},'',url)}try{if(page==='workbench')await renderWorkbench();else if(page==='assets')await renderAssets();else if(page==='tasks')await renderTasks();else if(page==='scripts')await renderScripts();else if(page==='outreach')await renderOutreach();else if(page==='juzi-workbench')await renderJuziWorkbench();else if(page==='script-templates')await renderScriptTemplates();else if(page==='governance')await renderGovernance()}catch(err){if(version!==navigationVersion||err.name==='AbortError')return;$('#main-content').innerHTML=`<div class="empty-card">加载失败：${esc(err.message)}<br><button class="secondary-button" onclick="navigate('${esc(page)}')">重新加载</button></div>`}}
window.addEventListener('popstate',()=>{if(state.user)navigate(initialPage(),'none')});
function metric(label,value,note,tone='') {return `<article class="metric-card execution-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function assetCard(item){return `<button class="asset-card" style="--accent:${esc(item.color)}" onclick="openAudience('${esc(item.code)}')"><div class="asset-icon">${esc(item.name.slice(0,1))}</div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p><div class="asset-stats"><div><strong>${item.customer_count}</strong><span>归属用户</span></div><div><strong>${item.due_count}</strong><span>待触达</span></div></div><b class="asset-arrow">→</b></button>`}
function segmentCard(item){const parts=(state.categories||[]).filter(c=>item.category_codes.includes(c.code)).map(c=>c.name).join('、');return `<button class="asset-card segment-card" style="--accent:${esc(item.color)}" onclick="openSegment('${esc(item.code)}')"><div class="asset-icon">${esc(item.name.slice(0,1))}</div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p><small class="segment-parts">${esc(parts)}</small><div class="asset-stats"><div><strong>${item.customer_count}</strong><span>板块用户</span></div><div><strong>${item.due_count}</strong><span>待触达</span></div></div><b class="asset-arrow">→</b></button>`}
function stagePill(stage){const cls=stage==='待回复'||stage==='对话中'?'urgent':stage==='暂停触达'?'paused':stage==='待跟进'?'follow':'';return `<span class="stage-pill ${cls}">${esc(stage)}</span>`}

async function renderWorkbench(){setHeader('今天需要跟进的用户','今日工作台');const data=await api('/api/v1/private/workbench');state.categories=data.categories;$('#task-count').textContent=data.metrics.due;
  $('#main-content').innerHTML=`<section class="hero execution-hero"><div><p class="hero-kicker">FRONTLINE EXECUTION DESK</p><h3>先读懂当前待办，再给出合适触达</h3><p>聚合用户事实、内部辅助摘要和触达任务，为一线运营提供可执行的用户触达入口。</p></div><button class="primary-button" onclick="navigate('outreach')">进入用户触达 →</button></section>
  <div class="metric-grid execution-grid">${metric('今日待办',data.metrics.due,'需要回复或跟进','urgent')}${metric('等待回复',data.metrics.waiting,'客户消息优先处理')}${metric('约定跟进',data.metrics.followups,'按约定时间执行')}${metric('暂停触达',data.metrics.paused,'严格遵守用户边界')}${metric('今日已完成',data.completed_today,'已写入跟进记录','done')}</div>
  <div class="section-heading"><div><h3>优先处理队列</h3><p>按客户消息、约定时间和授权状态排列，不提供经营决策排序</p></div><button class="text-button" onclick="navigate('tasks')">查看全部任务 →</button></div>
  <section class="execution-queue">${data.queue.map(t=>queueCard(t)).join('')}</section>
  <div class="section-heading spaced-heading"><div><h3>用户资产入口</h3><p>按抗衰、基础营养两个板块进入，资料和会话在两个板块间共享</p></div><button class="text-button" onclick="navigate('assets')">查看全部 →</button></div>
  <div class="asset-grid">${data.segments.map(segmentCard).join('')}</div>`}
function queueCard(task){const c=task.customer;return `<article class="queue-card"><div class="queue-avatar">${esc(c.name.slice(0,1))}</div><div class="queue-main"><div><strong>${esc(c.name)}</strong>${stagePill(c.stage)}<span class="priority ${c.priority==='高'?'high':''}">${esc(c.priority)}优先</span></div><p class="customer-quote">“${esc(c.last_message)}”</p><small>${esc(task.type)} · ${esc(task.reason)} · ${esc(task.due)}</small></div><div class="queue-action"><span>${esc(c.product_focus)}</span><button class="primary-button" onclick="openCustomer(${c.id})">处理用户</button><button class="secondary-button" onclick="navigate('tasks')">查看任务</button></div></article>`}

function ownerChipsHtml(owners,selected,onClick){if(!owners||!owners.length)return '';const sorted=[...owners].sort((a,b)=>b.count-a.count);return `<div class="owner-filter"><button class="owner-chip ${selected===''?'active':''}" onclick="${onClick}('')">全部顾问</button>${sorted.map(o=>`<button class="owner-chip ${selected===o.name?'active':''}" onclick="${onClick}('${esc(o.name).replace(/'/g,"\\'")}')">${esc(o.name)} <b>${o.count||''}</b></button>`).join('')}</div>`}
function selectOwner(owner){state.audienceOwner=owner||'';state.audiencePage=1;openAudience(state.audience,state.audienceQuery,1)}

async function renderAssets(){setHeader('用户资产','用户资产');const data=await api('/api/v1/private/user-assets');state.categories=data.categories;const total=data.total_users;const segmentTotal=data.segments.reduce((sum,x)=>sum+x.customer_count,0);$('#main-content').innerHTML=`<section class="hero asset-hero"><div><p class="hero-kicker">USER ASSET CENTER</p><h3>从用户事实进入每一次沟通</h3><p>当前共 ${total} 位用户，按抗衰与基础营养两大板块组织。同一用户可同时属于多个细类，但只保留一份资料、一条会话链路和一套触达边界。</p></div></section><div class="section-heading"><div><h3>选择用户板块</h3><p>内部辅助摘要仅供已授权运营人员使用，不会进入客户消息</p></div><span class="asset-actions"><button class="secondary-button" onclick="openCustomerForm()">+ 新增客户</button><button class="secondary-button" onclick="openImportForm()">+ 批量导入</button><span>更新于 ${fmtDate(data.updated_at)}</span></span></div><div class="asset-grid">${data.segments.map(segmentCard).join('')}</div><section class="boundary-note"><strong>本模块的使用边界</strong><span>可用于理解用户与生成回复；不可直接把内部标签、优先级、评分或推断内容发送给客户。</span></section>`}
async function openAudience(code,q='',page=1){state.audience=code;state.audienceQuery=q||'';state.audiencePage=Math.max(1,Number(page)||1);loading('正在加载用户列表…');const data=await api(`/api/v1/private/user-assets/${encodeURIComponent(code)}/customers?q=${encodeURIComponent(q)}&owner=${encodeURIComponent(state.audienceOwner||'')}`);const view=audienceSlice(data.items,data.pagination.total,state.audiencePage);setHeader(data.audience.name,`用户资产 / ${data.audience.name}`);const ownerBar=ownerChipsHtml(data.owners,state.audienceOwner,'selectOwner');const segmentBar=data.audience.category_codes?`<div class="audience-segment-bar"><button class="segment-chip active">${esc(data.audience.name)} · 全部 ${data.pagination.total}</button>${state.categories.filter(c=>data.audience.category_codes.includes(c.code)).map(c=>`<button class="segment-chip" onclick="openAudience('${esc(c.code)}')">${esc(c.name)} <b>${c.customer_count}</b></button>`).join('')}</div>`:'';$('#main-content').innerHTML=`<button class="back-button" onclick="navigate('assets')">← 返回用户资产</button><div class="section-heading"><div><h3>${esc(data.audience.name)}</h3><p>${esc(data.audience.description)} · ${data.pagination.total} 位用户</p></div></div>${ownerBar}${segmentBar}<div class="toolbar"><div class="search-box"><input id="asset-search" value="${esc(q)}" placeholder="搜索姓名、称呼、手机号后四位、产品关注或当前状态"></div><button class="secondary-button" onclick="searchAudience()">搜索</button></div><div class="table-wrap"><table class="data-table operator-table"><thead><tr><th>用户</th><th>产品关注</th><th>内部沟通摘要</th><th>当前状态</th><th>下一步</th><th>操作</th></tr></thead><tbody>${view.items.map(c=>`<tr onclick="openCustomer(${c.id})"><td><div class="user-cell"><div class="mini-avatar">${esc((c.salutation||c.name).slice(0,1))}</div><div><strong>${esc(c.salutation||c.name)}</strong><span>${esc(c.phone)} · ${esc(c.owner)}</span>${c.remark?`<small>${esc(c.remark)}</small>`:''}</div></div></td><td><strong>${esc(c.product_focus)}</strong><br>${c.assets.map(a=>`<span class="tag">${esc(a.name)}</span>`).join('')}</td><td class="profile-cell">${esc(c.ai_profile.summary.slice(0,75))}…<br>${c.ai_profile.tags.slice(0,2).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</td><td>${stagePill(c.stage)}<br><small>${esc(c.last_time)}</small></td><td class="profile-cell">${esc(c.next_action)}<br><b>${esc(c.next_at)}</b></td><td><button class="action-link" onclick="event.stopPropagation();openCustomer(${c.id})">查看资料</button></td></tr>`).join('')}</tbody></table><div class="pagination-note">${audienceRange(view)} · 手机号已脱敏 · 仅展示当前运营角色可见用户</div>${audiencePagerHtml(data.audience.code,view)}</div>`;$('#asset-search').addEventListener('keydown',e=>{if(e.key==='Enter')searchAudience()})}
function audienceSlice(items,total,page){const size=100;const pages=Math.max(1,Math.ceil(total/size));const current=Math.min(Math.max(1,Number(page)||1),pages);const start=(current-1)*size;return {items:items.slice(start,start+size),start,current,pages,total}}
function audienceRange(view){if(!view.total)return '共 0 条';const end=Math.min(view.start+view.items.length,view.total);return `第 ${view.start+1}-${end} / 共 ${view.total} 条`}
function audiencePagerHtml(code,view){return `<div class="pagination-controls"><button class="secondary-button" onclick="changeAudiencePage(-1)" ${view.current<=1?'disabled':''}>上一页</button><span>第 ${view.current} / ${view.pages} 页</span><button class="secondary-button" onclick="changeAudiencePage(1)" ${view.current>=view.pages?'disabled':''}>下一页</button></div>`}
function changeAudiencePage(delta){openAudience(state.audience,state.audienceQuery,state.audiencePage+delta)}
function searchAudience(){openAudience(state.audience,$('#asset-search').value.trim(),1)}
function segmentMetricCard(label,value,hint,accent){return `<div class="segment-metric-card" style="--accent:${esc(accent||'#2f7165')}"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(hint||'')}</small></div>`}
async function openSegment(code){loading('正在加载板块工作台…');const data=await api(`/api/v1/private/segments/${encodeURIComponent(code)}/overview`);state.segmentCode=code;setHeader(data.segment.name,`用户资产 / ${data.segment.name} · 板块工作台`);const parts=(state.categories||[]).filter(c=>data.segment.category_codes.includes(c.code)).map(c=>c.name).join('、');const m=data.metrics;$('#main-content').innerHTML=`<button class="back-button" onclick="navigate('assets')">← 返回用户资产</button><section class="segment-hero" style="--accent:${esc(data.segment.color)}"><div><p class="hero-kicker">SEGMENT OPERATING FLOOR</p><h2>${esc(data.segment.name)} · 板块工作台</h2><p>${esc(data.segment.description)}</p><small>${esc(parts)}</small></div><div class="segment-positioning"><strong>运营定位</strong><span>${esc(data.positioning)}</span></div></section><div class="segment-metric-grid">${[['板块用户',m.total,'含重叠用户，按资料口径'],['今日待办',m.due,'需要推进的触达'],['已购待复购',m.repurchase,'销售额核心，服务优先'],['高意向核心',m.core,'本周转化重点'],['观望培育',m.nurture,'低压力信息培育'],['待首次触达',m.fresh,'先建联，采集需求与授权'],['沉默唤醒',m.silent,'低打扰确认是否继续'],['暂停触达',m.paused,'遵守边界，不主动联系']].map(x=>segmentMetricCard(x[0],x[1],x[2],data.segment.color)).join('')}</div><div class="section-heading"><div><h3>一人一策 · ${esc(data.segment.name)}分层</h3><p>同一用户只落入一个行动层级；生成话术前必须先确认层级与授权状态。</p></div><button class="secondary-button" onclick="openAudience('${esc(code)}')">查看全部用户 →</button></div><div class="tier-grid">${data.tiers.map(t=>`<article class="tier-card" style="--accent:${esc(t.accent)}"><header><span>${esc(t.name)}</span><strong>${t.count}</strong></header><p>${esc(t.description)}</p><div class="tier-action"><b>下一步动作</b><span>${esc(t.action)}</span></div><small>${esc(t.tone)}</small></article>`).join('')}</div>${data.due_sample.length?`<section class="segment-due"><div class="section-heading"><div><h3>优先触达队列</h3><p>按触达状态取出最前面的待办，点击查看用户资料。</p></div></div>${data.due_sample.map(c=>`<article class="queue-card" onclick="openCustomer(${c.id})"><div class="queue-avatar">${esc(c.name.slice(0,1))}</div><div class="queue-main"><div><strong>${esc(c.name)}</strong>${stagePill(c.stage)}</div><p class="customer-quote">${esc(c.next_action)}</p><small>${esc(c.product_focus)} · ${esc(c.phone)}</small></div><div class="queue-action"><span>${esc(c.stage)}</span><button class="primary-button" onclick="event.stopPropagation();openCustomer(${c.id})">查看资料</button></div></article>`).join('')}</section>`:''}<section class="boundary-note"><strong>本板块的使用边界</strong><span>只能用于理解用户与生成内部话术；不可把分层、评分、优先级或推断直接发送给客户，也不可将抗衰与基础营养的话术混用。</span></section>`}
function openCustomerForm(){const cats=state.categories.length?state.categories:[{code:'nmn',name:'NMN人群'},{code:'ergothioneine',name:'麦角硫因人群'},{code:'coq10',name:'辅酶Q10人群'},{code:'regular',name:'常规品人群'}];showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">CUSTOMER INTAKE</p><h3>新增客户</h3><p>仅录入姓名、脱敏手机号后四位与归属关系；画像判断留待真实沟通后生成。</p></div><div class="drawer-body"><form class="customer-form" onsubmit="saveCustomer(event)"><label class="form-label">客户姓名<input id="c-name" name="name" required placeholder="例如：王先生"></label><label class="form-label">称呼（可选）<input id="c-salutation" name="salutation" placeholder="例如：王姐 / 王哥，留空自动判断"></label><label class="form-label">手机号后四位<input id="c-phone" name="phone" required placeholder="后四位，例如 0823"></label><label class="form-label">归属顾问<input id="c-owner" name="owner" required placeholder="例如：演示顾问A"></label><label class="form-label">备注<textarea id="c-remark" name="remark" rows="2" placeholder="例如：251108NMN18000 5瓶"></textarea></label><div class="form-grid"><label class="form-label">城市<input id="c-city" name="city" placeholder="例如：华东地区"></label><label class="form-label">关注方向<input id="c-focus" name="product_focus" placeholder="例如：辅酶Q10日常方案"></label></div><div class="form-label">用户板块<div class="audience-picks">${cats.map(x=>`<label class="audience-pick"><input type="checkbox" name="assetCodes" value="${esc(x.code)}"><span>${esc(x.name)}</span></label>`).join('')}</div></div><div class="drawer-actions"><button type="button" class="secondary-button" onclick="closeDrawer()">取消</button><button type="submit" class="primary-button">保存并归属</button></div></form></div>`)}
async function saveCustomer(e){e.preventDefault();const form=new FormData(e.target);const payload={name:form.get('name'),salutation:form.get('salutation'),phone:form.get('phone'),owner:form.get('owner'),remark:form.get('remark'),city:form.get('city'),product_focus:form.get('product_focus'),assetCodes:form.getAll('assetCodes')};try{const c=await api('/api/v1/private/customers',{method:'POST',body:JSON.stringify(payload)});toast(`已录入 ${c.salutation||c.name}，归属 ${c.owner}`);await navigate('assets')}catch(err){toast(err.message)}}

function categoryOptions(){return state.categories.length?state.categories:[{code:'nmn',name:'NMN人群'},{code:'ergothioneine',name:'麦角硫因人群'},{code:'coq10',name:'辅酶Q10人群'},{code:'regular',name:'常规品人群'}]}
function openImportForm(){showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">BATCH CUSTOMER IMPORT</p><h3>批量导入客户</h3><p>每行一位客户，字段顺序：姓名、称呼、手机号后四位、归属顾问、城市、关注方向、用户板块、备注。称呼可留空，系统会自动判断“哥/姐”。</p></div><div class="drawer-body"><form class="customer-form" onsubmit="saveCustomerImport(event)"><div class="form-label">客户数据<textarea id="import-rows" class="import-textarea" rows="10" oninput="renderImportPreview()" placeholder="姓名,称呼,手机号后四位,归属顾问,城市,关注方向,用户板块,备注&#10;王先生,王哥,0823,演示顾问A,华东地区,辅酶Q10日常方案,nmn|coq10,251108NMN18000 5瓶&#10;李女士,李姐,0912,演示顾问B,华南地区,NMN焕活方案,nmn,SAfu"></textarea></div><div class="import-file-row"><label class="secondary-button import-file-button">选择 CSV 文件<input id="import-file" type="file" accept=".csv,.txt,text/csv" onchange="loadImportFile(event)" hidden></label><span>支持逗号或制表符分隔；可带表头自动识别列，用户板块可用竖线、顿号或分号分隔。</span></div><div id="import-preview" class="import-preview">粘贴后自动预览预计导入数量与格式错误。</div><div class="drawer-actions"><button type="button" class="secondary-button" onclick="closeDrawer()">取消</button><button type="submit" class="primary-button">校验并导入</button></div></form></div>`)}
function defaultImportTemplate(){return '姓名,称呼,手机号后四位,归属顾问,城市,关注方向,用户板块,备注\n王先生,王哥,0823,演示顾问A,华东地区,辅酶Q10日常方案,nmn|coq10,251108NMN18000 5瓶\n李女士,李姐,0912,演示顾问B,华南地区,NMN焕活方案,nmn,SAfu'}
function parseDelimitedLine(line,delimiter){const cells=[];let current='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(quoted){if(ch==='"'){if(line[i+1]==='"'){current+='"';i++}else{quoted=false}}else{current+=ch}}else if(ch==='"'){quoted=true}else if(ch===delimiter){cells.push(current.trim());current=''}else{current+=ch}}cells.push(current.trim());return cells}
function audienceCodes(value){const cats=categoryOptions(),parts=String(value||'').split(/[|、/;，,+；\s]+/).map(x=>x.trim()).filter(Boolean);return parts.map(part=>{const code=cats.find(x=>x.code.toLowerCase()===part.toLowerCase());if(code)return code.code;const name=cats.find(x=>x.name===part||x.name.replace(/人群$/,'')===part);return name?name.code:null}).filter(Boolean)}
function parseImportText(text){const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return {rows:[],errors:['请至少粘贴一行客户数据'],headerSkipped:false};const first=lines[0];const delimiter=first.includes('\t')?'\t':',';let start=0,header=null;const firstCells=parseDelimitedLine(first,delimiter);if((/姓名|称呼|手机号|归属|顾问|owner|phone|salutation|audience|板块/i.test(first))&&(first.includes(',')||first.includes('\t'))){start=1;header=firstCells}const aliases={name:['姓名','客户姓名','昵称','name'],salutation:['称呼','尊称','salutation'],phone:['手机号','手机号后四位','电话','phone'],owner:['归属顾问','顾问','负责人','归属','owner'],city:['城市','地区','city'],focus:['关注方向','产品关注','关注','product_focus'],assets:['用户板块','板块','人群','分类','audience'],remark:['备注','标签','remark']};const idx=key=>header?header.findIndex(h=>aliases[key].some(a=>String(h||'').trim().toLowerCase()===a.toLowerCase())):-1;const rows=[],errors=[],seen=new Set();for(let i=start;i<lines.length;i++){const cells=parseDelimitedLine(lines[i],delimiter);let name,salutation='',phone,owner,city,product_focus,assetCells,remark;if(header){name=idx('name')>=0?(cells[idx('name')]||'').trim():'';salutation=idx('salutation')>=0?(cells[idx('salutation')]||'').trim():'';phone=idx('phone')>=0?(cells[idx('phone')]||'').trim():'';owner=idx('owner')>=0?(cells[idx('owner')]||'').trim():'';city=idx('city')>=0?(cells[idx('city')]||'').trim():'';product_focus=idx('focus')>=0?(cells[idx('focus')]||'').trim():'';assetCells=idx('assets')>=0?(cells[idx('assets')]||''):'';remark=idx('remark')>=0?(cells[idx('remark')]||'').trim():''}else if(cells.length>=8){name=(cells[0]||'').trim();salutation=(cells[1]||'').trim();phone=(cells[2]||'').trim();owner=(cells[3]||'').trim();city=(cells[4]||'').trim();product_focus=(cells[5]||'').trim();assetCells=cells[6]||'';remark=(cells[7]||'').trim()}else{name=(cells[0]||'').trim();phone=(cells[1]||'').trim();owner=(cells[2]||'').trim();city=(cells[3]||'').trim();product_focus=(cells[4]||'').trim();assetCells=cells[5]||'';remark=(cells[6]||'').trim()}if(!name||!phone||!owner){errors.push(`第 ${i+1} 行缺少：${!name?'姓名':''}${!phone?'、手机号后四位':''}${!owner?'、归属顾问':''}`);continue}const key=`${name}|${phone}`;if(seen.has(key))errors.push(`第 ${i+1} 行重复：${name} / ${phone}`);seen.add(key);rows.push({name,salutation,phone,owner,city,product_focus,assetCodes:audienceCodes(assetCells),remark})}return {rows,errors,headerSkipped:start===1}}
function renderImportPreview(){const area=$('#import-rows'),preview=$('#import-preview');if(!area||!preview)return;const parsed=parseImportText(area.value);if(parsed.headerSkipped)preview.textContent=`已识别表头，共预览 ${parsed.rows.length} 条客户数据，预计导入 ${parsed.rows.length} 位。`;else preview.textContent=`共预览 ${parsed.rows.length} 条客户数据，预计导入 ${parsed.rows.length} 位。`;if(parsed.errors.length)preview.innerHTML=`<span class="import-errors">${esc(parsed.errors.slice(0,4).join('；'))}${parsed.errors.length>4?`；另有 ${parsed.errors.length-4} 条错误`:''}</span>`;else preview.classList.remove('has-errors')}
async function loadImportFile(event){const file=event.target.files&&event.target.files[0];if(!file)return;try{const area=$('#import-rows');area.value=await file.text();if(!area.value.trim())area.value=defaultImportTemplate();renderImportPreview()}catch{toast('文件读取失败，请改为直接粘贴数据')}}
async function saveCustomerImport(e){e.preventDefault();const text=$('#import-rows').value;const parsed=parseImportText(text);if(!parsed.rows.length){toast(parsed.errors[0]||'请至少粘贴一行客户数据');return}try{const result=await api('/api/v1/private/customers/import',{method:'POST',body:JSON.stringify({rows:parsed.rows})});toast(`已批量导入 ${result.imported} 位客户，并自动归属板块`);await navigate('assets')}catch(err){const area=$('#import-rows');if(area){area.focus()}toast(err.message)}}

async function openCustomer(id){try{const c=await api(`/api/v1/private/customers/${id}`);state.customer=c;const p=c.ai_profile,u=c.persona;showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><div class="drawer-user"><div class="mini-avatar">${esc((c.salutation||c.name).slice(0,1))}</div><div><h3>${esc(c.salutation||c.name)}</h3><p>${esc(c.phone)} · ${esc(c.city)} · ${esc(c.owner)}负责</p>${c.remark?`<p class="muted-copy">备注：${esc(c.remark)}</p>`:''}</div></div><div class="drawer-actions"><button class="primary-button" onclick="closeDrawer();navigate('scripts')">打开话术中心</button><button class="secondary-button" onclick="refreshProfile(${c.id})">更新内部判断</button></div></div><div class="drawer-body"><div class="detail-metrics">${detailMetric('当前状态',c.stage)}${detailMetric('意向度',u.intention_score+' / 100')}${detailMetric('转化可能',u.conversion_probability+'%')}${detailMetric('判断置信度',u.confidence+'%')}</div><section class="profile-box internal-profile"><div class="profile-meta"><span>内部 AI 沟通判断 · 仅运营可见</span><span>置信度 ${Math.round(p.confidence*100)}% · ${fmtDate(p.generated_at)}</span></div><h4>综合用户描述</h4><p>${esc(p.summary)}</p><div>${p.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><div class="evidence-list">${p.evidence.map(e=>`<span>${esc(e.source)} · ${esc(e.label)}</span>`).join('')}</div></section><section class="detail-section persona-section"><div class="section-inline"><h4>跨场景用户判断</h4><span>含推断项，不等同用户自述</span></div><div class="persona-grid">${personaItem('年龄阶段',u.age_band,'资料/推断')}${personaItem('性别',u.gender,'称呼/资料')}${personaItem('职业',u.occupation,'行为推断')}${personaItem('生活阶段',u.life_stage,'综合推断')}${personaItem('沟通性格',u.personality,'互动推断')}${personaItem('决策方式',u.decision_style,'行为推断')}${personaItem('内容偏好',u.content_preference,'行为事实')}${personaItem('适合时间',u.available_time,'时段统计')}</div><h4>可自然延展的非产品话题</h4><div class="context-tags">${u.non_health_topics.map(x=>`<span>${esc(x)}</span>`).join('')}</div><p class="inference-note">判断来源：${esc(u.sources.join('、'))}。使用时应先通过自然对话验证，不得把推断直接告诉用户。</p></section><section class="detail-section"><h4>发送前限制</h4><ul class="guardrail-list">${p.guardrails.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section class="detail-section"><h4>相关产品记录（仅作沟通上下文）</h4>${c.purchase.length?c.purchase.map(x=>`<div class="timeline-item"><time>记录</time><p>${esc(x)}</p></div>`).join(''):'<p class="muted-copy">暂无相关记录，不能据此推定购买意向。</p>'}</section><section class="detail-section"><h4>最近互动</h4>${c.interactions.map(x=>`<div class="timeline-item"><time>${esc(x.time)}</time><p><strong>${esc(x.type)}</strong><br>${esc(x.content)} · ${esc(x.channel)}</p></div>`).join('')}</section></div>`)}catch(err){toast(err.message)}}
function personaItem(label,value,basis){return `<div class="persona-item"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(basis)}</small></div>`}
function detailMetric(label,value){return `<div class="detail-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
async function refreshProfile(id){try{await api(`/api/v1/private/customers/${id}/ai-profile/refresh`,{method:'POST',body:'{}'});toast('内部摘要已按最新事实更新');openCustomer(id)}catch(err){toast(err.message)}}

async function renderTasks(category=state.taskCategory){state.taskCategory=category;setHeader('触达任务与每日优化','触达任务');const data=await api(`/api/v1/private/tasks?category=${encodeURIComponent(category)}`);state.tasks=data.all_items;$('#task-count').textContent=data.pending;const p=data.performance,m=p.metrics,d=p.deltas;$('#main-content').innerHTML=`<section class="task-page-head"><div><p class="hero-kicker">DAILY OUTREACH ENGINE</p><h1>今天该联系谁、为什么联系、怎么开口</h1><p>任务由用户事实、授权状态、沟通阶段和昨日效果共同生成；运营人员确认后执行。</p></div><div><span>${esc(p.optimization.version)}</span><strong>${data.pending} 项待执行</strong><small>下次复盘 ${esc(p.optimization.next_review)}</small></div></section><div class="touch-metric-grid">${rateMetric('昨日完成',`${m.completed}/${m.assigned}`,'触达任务')}${rateMetric('开口率',m.opening_rate+'%',signed(d.opening_rate))}${rateMetric('回复率',m.reply_rate+'%',signed(d.reply_rate))}${rateMetric('意向率',m.intent_rate+'%',signed(d.intent_rate))}${rateMetric('转化率',m.conversion_rate+'%',signed(d.conversion_rate),d.conversion_rate<0?'down':'')}${rateMetric('关怀正向率',m.care_positive_rate+'%','购买后/生日关怀')}</div><section class="daily-optimization"><header><div><span>基于前一日触达内容自动复盘</span><h2>今日触达优化建议</h2></div><button class="secondary-button" onclick="refreshTouchOptimization()">重新生成今日建议</button></header><div class="optimization-body"><div class="optimization-column winners"><h3>昨日有效方式</h3>${p.optimization.winners.map(x=>`<p><span>↑</span>${esc(x)}</p>`).join('')}</div><div class="optimization-column adjustments"><h3>今日调整</h3>${p.optimization.adjustments.map(x=>`<p><span>→</span>${esc(x)}</p>`).join('')}</div><div class="optimization-focus"><strong>今日总体策略</strong><p>${esc(p.optimization.today_focus)}</p><small>数据口径：开口率=用户打开或形成有效会话；意向率=明确表示愿意继续了解；转化率=完成既定产品转化动作。</small></div></div><div class="category-performance">${p.by_category.map(x=>`<div><strong>${esc(x.label)}</strong><span>开口 ${x.opening_rate}%</span><span>意向 ${x.intent_rate}%</span><span>转化 ${x.conversion_rate}%</span></div>`).join('')}</div></section><div class="section-heading task-category-heading"><div><h3>触达类型</h3><p>同一用户可在不同时间进入不同任务，但暂停触达状态拥有最高优先级</p></div></div><div class="task-category-grid"><button class="task-category-card ${category==='all'?'active':''}" onclick="filterTasks('all')"><span>全</span><strong>全部任务</strong><small>${data.all_items.length} 项</small></button>${data.categories.map(x=>taskCategoryCard(x,data.all_items,category)).join('')}</div><div class="task-filter-bar"><strong>${category==='all'?'全部触达任务':esc(data.categories.find(x=>x.code===category)?.label||'触达任务')}</strong><span>${data.items.length} 项 · 已综合职业、年龄阶段、性格、生活节奏、意向与历史触达</span></div><section class="touch-task-list">${data.items.map(t=>touchTaskCard(t)).join('')||'<div class="empty-card">该类型暂无任务。</div>'}</section>`}
function signed(value){return `${value>=0?'↑':'↓'} ${Math.abs(value)}% 较前日`}
function rateMetric(label,value,note,tone=''){return `<article class="touch-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function taskCategoryCard(category,items,active){const count=items.filter(x=>x.category===category.code&&x.status==='pending').length;return `<button class="task-category-card ${active===category.code?'active':''}" onclick="filterTasks('${esc(category.code)}')"><span>${esc(category.icon)}</span><strong>${esc(category.label)}</strong><small>${count} 项 · ${esc(category.description)}</small></button>`}
function touchTaskCard(t){const c=t.customer,u=c.persona;return `<article class="touch-task ${t.status==='done'?'done':''}"><div class="task-type-mark" data-type="${esc(t.category)}"><span>${esc(t.type.slice(0,1))}</span><small>${esc(t.due)}</small></div><div class="task-user"><div class="task-user-head"><div class="mini-avatar">${esc(c.name.slice(0,1))}</div><div><h3>${esc(c.name)} ${stagePill(t.funnel)}</h3><p>${esc(u.age_band)} · ${esc(u.occupation)} · ${esc(c.city)}</p></div><div class="score-pair"><span>意向 <b>${u.intention_score}</b></span><span>转化可能 <b>${u.conversion_probability}%</b></span><small>判断置信 ${u.confidence}%</small></div></div><div class="task-persona-strip"><span>${esc(u.personality)}</span><span>${esc(u.decision_style)}</span><span>适合：${esc(u.available_time)}</span><span>话题：${esc(u.non_health_topics.slice(0,2).join(' / '))}</span></div></div><div class="task-plan"><div><span>触发原因</span><p>${esc(t.reason)}</p></div><div><span>本次目标</span><p>${esc(t.objective)}</p></div><div><span>推荐切入</span><p>${esc(t.touch_angle)}</p></div><div><span>前次触达</span><p>${esc(t.previous_touch)}</p></div><div class="optimization-hint"><span>昨日复盘应用</span><p>${esc(t.optimization_hint)}</p></div></div><div class="task-actions"><span>${esc(c.consent)}</span>${t.status==='done'?'<b class="done-label">已完成</b>':`<button class="secondary-button" onclick="openTaskDetail('${t.id}')">查看判断</button><button class="primary-button" onclick="closeDrawer();navigate(&#39;scripts&#39;)">生成本次话术</button><button class="text-button" onclick="completeTask('${t.id}')">直接完成</button>`}</div></article>`}
function filterTasks(category){renderTasks(category)}
async function openTaskDetail(id){const t=await api(`/api/v1/private/tasks/${id}`),c=t.customer,u=c.persona;showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">${esc(t.type)}</p><h3>${esc(c.name)} · ${esc(t.funnel)}</h3><p>${esc(t.reason)} · ${esc(t.due)}</p></div><div class="drawer-body"><section class="task-detail-objective"><span>本次目标</span><h3>${esc(t.objective)}</h3><p>${esc(t.touch_angle)}</p></section><div class="detail-metrics">${detailMetric('意向度',u.intention_score+'/100')}${detailMetric('转化可能',u.conversion_probability+'%')}${detailMetric('判断置信',u.confidence+'%')}${detailMetric('触达授权',c.consent)}</div><section class="detail-section"><h4>跨场景用户描述</h4><p>${esc(u.age_band)} · ${esc(u.gender)} · ${esc(u.occupation)} · ${esc(u.life_stage)}</p><p>${esc(u.personality)}；${esc(u.decision_style)}；偏好${esc(u.content_preference)}。</p><div class="context-tags">${u.non_health_topics.map(x=>`<span>${esc(x)}</span>`).join('')}</div><p class="inference-note">以上包含行为推断，置信度 ${u.confidence}%。应在自然对话中验证，不得作为确定事实告诉用户。</p></section><section class="detail-section"><h4>前一日复盘如何应用</h4><div class="optimization-callout">${esc(t.optimization_hint)}</div><p>${esc(t.previous_touch)}</p></section><section class="detail-section"><h4>任务生成依据</h4><ul class="guardrail-list"><li>${esc(t.reason)}</li><li>${esc(c.ai_profile.evidence.map(x=>x.label).join('；'))}</li><li>公共事件只使用中性、公开且与所在地匹配的信息，不判断用户政治立场。</li></ul></section><button class="primary-button full" onclick="closeDrawer();navigate(&#39;scripts&#39;)">打开话术中心生成个性化话术</button></div>`)}
async function refreshTouchOptimization(){const data=await api('/api/v1/private/tasks/optimization/refresh',{method:'POST',body:'{}'});toast(`已生成 ${data.version}，将继续结合今日结果优化`);renderTasks()}
async function completeTask(id){await api(`/api/v1/private/tasks/${id}/status`,{method:'POST',body:JSON.stringify({status:'done'})});toast('任务已完成，并进入下一次复盘');renderTasks()}

function initialPage(){const page=new URLSearchParams(location.search).get('page');return ['workbench','assets','tasks','scripts','outreach','juzi-workbench','script-templates','governance'].includes(page)?page:/^\/script-studio\/?$/.test(location.pathname)?'scripts':'workbench'}
async function renderOutreach(){
  setHeader('用户触达','用户触达 / 小蟹 AI 与句子互动');
  const version=navigationVersion;
  try{
    const account=await ensureOutreachAccount();
    if(version!==navigationVersion)return;
    if(account==='setup'){$('#main-content').innerHTML=outreachSetupForm();$('#outreach-setup-form').addEventListener('submit',event=>submitOutreachLogin(event,'setup'));return}
    if(account==='login'){$('#main-content').innerHTML=outreachLoginForm();$('#outreach-login-form').addEventListener('submit',event=>submitOutreachLogin(event,'login'));return}
    if(state.outreachUser?.role!=='admin'){$('#main-content').innerHTML='<div class="empty-card">当前账号没有用户触达权限，仅管理员可以执行主动触达。</div>';return}
    const [data,users]=await Promise.all([studioApi('/outreach'),studioApi('/users')]);
    if(version!==navigationVersion)return;
    state.outreachData=data;
    state.outreachUsers=users.items||[];
    if(shouldAutoGenerateOutreach(data)){
      state.outreachAutoStarted=true;
      state.outreachError='正在生成今日一客一策…';
      renderOutreachWorkspace(data);
      await refreshOutreachStrategies(false);
      return;
    }
    renderOutreachWorkspace(data);
  }catch(error){
    if(version!==navigationVersion)return;
    state.outreachError=error.message;
    renderOutreachWorkspace(state.outreachData);
  }
}
async function studioApi(path,options={}){
  const version=navigationVersion;
  const response=await fetch('/api/studio'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(state.outreachCsrf?{'X-Studio-CSRF':state.outreachCsrf}:{}) ,...(options.headers||{})}});
  const result=await response.json().catch(()=>({success:false,error:{message:'响应格式错误'}}));
  if(version!==navigationVersion)throw new DOMException('页面已切换','AbortError');
  if(!response.ok||!result.success){
    const error=new Error(result.error?.message||'请求失败');
    error.status=response.status;error.code=result.error?.code;throw error;
  }
  return result.data;
}
async function ensureOutreachAccount(){
  if(state.outreachUser&&state.outreachCsrf)return 'ready';
  try{
    const data=await studioApi('/me');
    state.outreachUser=data.user;state.outreachCsrf=data.csrf;state.outreachModelConfigured=!!data.model_configured;
    state.studioRole=data.user?.role;updateOutreachVisibility();return 'ready';
  }catch(error){
    if(error.status!==401)throw error;
    const status=await studioApi('/status');
    state.outreachModelConfigured=!!status.model_configured;
    return status.local_setup?'setup':'login';
  }
}
function outreachLoginForm(){return `<section class="outreach-login"><header><h3>用户触达管理员登录</h3><p>仅管理员可以同步小蟹 AI / 句子互动用户、生成每日策略并确认发送。</p></header><form id="outreach-login-form"><label class="form-label">账号<input id="outreach-username" autocomplete="username" required></label><label class="form-label">密码<input id="outreach-password" type="password" autocomplete="current-password" required></label><button class="primary-button full" type="submit">登录用户触达</button></form></section>`}
function outreachSetupForm(){return `<section class="outreach-login"><header><h3>创建首个用户触达管理员</h3><p>该账号独立于演示中台账号，用于管理句子互动、客户策略和发送留档。</p></header><form id="outreach-setup-form"><label class="form-label">管理员账号<input id="outreach-username" autocomplete="username" required></label><label class="form-label">密码<input id="outreach-password" type="password" autocomplete="new-password" required></label><button class="primary-button full" type="submit">创建管理员</button></form></section>`}
async function submitOutreachLogin(event,mode){event.preventDefault();const body={username:$('#outreach-username').value.trim(),password:$('#outreach-password').value};try{if(mode==='setup')await studioApi('/setup',{method:'POST',body:JSON.stringify(body)});const data=await studioApi('/login',{method:'POST',body:JSON.stringify(body)});const me=await studioApi('/me');applyStudioSession(me);window.DotbestDemoAuth?.set(true);state.outreachAutoStarted=false;await renderOutreach()}catch(error){toast(error.message)}}
function shouldAutoGenerateOutreach(){return false}
function renderOutreachWorkspace(data){
  if(!data){$('#main-content').innerHTML=`<div class="empty-card">${esc(state.outreachError||'用户触达暂时不可用。')}<br><button class="secondary-button" onclick="navigate('outreach')">重新加载</button></div>`;return}
  const counts=data.counts,tasks=data.tasks||[],contacts=data.contacts||[],bots=data.bots||[],messages=data.messages||[],updates=data.profile_updates||[],templates=data.templates||[];
  $('#main-content').innerHTML=`<section class="outreach-workspace">
    <header><div><span>OUTREACH CONTROL</span><h3>真实客户每日主动触达</h3><p>以句子互动同步的真实客户为主体，先同步标签、备注和 30 天对话，再生成一客一策；发送前必须人工确认。</p></div><div class="outreach-header-actions"><button class="secondary-button" type="button" data-action="outreach-refresh" onclick="refreshOutreachCache()">刷新缓存</button><button class="secondary-button" type="button" data-action="outreach-sync" onclick="syncOutreachContacts()">同步客户</button><button class="secondary-button" type="button" data-action="outreach-history" onclick="syncOutreachHistory()">同步真实对话（5 分钟一次）</button><button class="primary-button" type="button" data-action="outreach-generate" onclick="refreshOutreachStrategies(true)">生成全量策略</button></div></header>
    <div class="outreach-summary-grid">${outreachSummary('句子互动',data.configured?'已连接':'待配置',data.configured?'客户与发送 API 已连接':'请联系管理员配置')}${outreachSummary('策略模型',data.model_configured?'已接入':'未配置',data.model_configured?'策略与推荐回复共用配置':'请联系管理员配置')}${outreachSummary('真实客户',counts.contacts,'手机号仅保留后四位')}${outreachSummary('已回复',counts.replied,'回复用户置顶展示')}${outreachSummary('今日触达',counts.today,'含模板和一客一策')}${outreachSummary('已发送',counts.sentToday,'人工确认后提交上游')}</div>
    ${state.outreachError?`<div class="outreach-alert">${esc(state.outreachError)}</div>`:''}
    ${state.outreachNotice?`<div class="outreach-notice">${esc(state.outreachNotice)}</div>`:''}
    ${outreachTemplatePanel(data)}
    <section class="outreach-panel"><header><h4>真实客户 · 标签 · 画像</h4><p>点击“打开对话”查看该客户独立对话框；可对单人重新生成触达策略。</p></header><div class="outreach-contact-list">${contacts.length?contacts.map(outreachContactRow).join(''):'<div class="empty-card">尚未同步客户，请先点击同步客户。</div>'}</div></section>
    <section class="outreach-panel"><header><h4>今日一客一策</h4><p>每个策略来自真实客户标签、备注、画像和聊天历史，包含开口话术、下一步和暂停规则。</p></header><div class="outreach-task-list">${tasks.filter(t=>t.plan_day===data.plan_day).length?tasks.filter(t=>t.plan_day===data.plan_day).map(outreachTaskCard).join(''):'<div class="empty-card">今日暂无策略。同步客户和对话后，可全量生成或从单个客户生成。</div>'}</div></section>
    <section class="outreach-panel"><header><h4>执行队列</h4><p>仅管理员可入队和发送；发送前系统弹出完整内容二次确认。</p></header><div class="outreach-queue-list">${tasks.filter(t=>t.status==='queued').map(outreachQueueCard).join('')||'<div class="empty-card">队列暂无待发送任务。</div>'}${outreachBatchControls(tasks.filter(t=>t.status==='queued'))}</div></section>
    <section class="outreach-panel"><header><h4>30 天真实消息留档</h4><p>仅管理员可查看，用于复盘开口与画像更新，不用于销售自动改模型。</p></header><div class="outreach-message-archive">${messages.length?messages.map(outreachMessageRow).join(''):'<div class="empty-card">暂无留档，请先同步真实对话。</div>'}</div></section>
    <section class="outreach-panel"><header><h4>画像更新建议</h4><p>客户回复后自动沉淀建议，由管理员复核后再用于下一轮策略。</p></header><div class="outreach-profile-updates">${updates.length?updates.map(outreachProfileRow).join(''):'<div class="empty-card">暂无画像更新建议。</div>'}</div></section>
    <section class="outreach-panel"><header><h4>托管账号归属</h4><p>可选配置：给句子互动托管账号绑定营养师归属，便于按顾问筛选和跟进。</p></header><div class="outreach-bot-list">${bots.length?bots.map(bot=>`<article><strong>${esc(bot.bot_name)}</strong><span>${esc(bot.im_bot_id)}</span><select data-bot="${esc(bot.im_bot_id)}">${outreachUserOptions(state.outreachUsers,bot.owner_user_id)}</select></article>`).join(''):'<div class="empty-card">尚未同步托管账号。</div>'}</div></section>
  </section>`;
}
function outreachSummary(label,value,note){return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function outreachTemplatePanel(data){
  const templates=data.templates||[],contacts=data.contacts||[],first=contacts.find(c=>!c.replied)||contacts[0];
  const preview=templates[0]&&first?renderOutreachTemplatePreview(templates[0],first):'';
  return `<section class="outreach-panel outreach-template-panel"><header><div><h4>固定话术模板</h4><p>支持 {{称呼}}、{{昵称}}、{{姓名}}；未写变量时发送前自动补称呼。仅管理员可维护。</p></div><button class="primary-button" type="button" onclick="resetOutreachTemplateForm()">清空表单</button></header>
  <div class="outreach-template-grid">
    <form class="outreach-template-form" id="outreach-template-form" onsubmit="saveOutreachTemplate(event)">
      <input type="hidden" id="outreach-template-id">
      <label class="form-label">模板名称<input id="outreach-template-title" maxlength="40" placeholder="中秋关怀" required></label>
      <label class="form-label">模板内容<textarea id="outreach-template-content" maxlength="600" rows="4" placeholder="中秋快乐呀，祝您身体健康。" required></textarea></label>
      <div class="outreach-template-actions"><button class="primary-button" type="submit">保存模板</button><button class="secondary-button" type="button" onclick="generateOutreachTemplateTasks()">生成推荐触达队列</button></div>
      <small>推荐对象默认为未回复且未暂停的真实客户；生成后仍需入队和人工确认。</small>
    </form>
    <div class="outreach-template-list">${templates.length?templates.map(item=>`<article class="${item.active?'':'inactive'}"><div><strong>${esc(item.title)}</strong><span>${item.active?'启用中':'已停用'} · 更新于 ${esc(fmtDate(item.updated_at))}</span></div><p>${esc(item.content)}</p><footer><button class="secondary-button" type="button" onclick="editOutreachTemplate('${esc(item.id)}')">编辑</button><button class="danger-button" type="button" onclick="deleteOutreachTemplate('${esc(item.id)}')">停用</button><button class="primary-button" type="button" onclick="generateOutreachTemplateTasks('${esc(item.id)}')">生成队列</button></footer></article>`).join(''):'<div class="empty-card">暂无模板。可先创建一条节日关怀或活动通知模板。</div>'}${preview}</div>
  </div></section>`;
}
function renderOutreachTemplatePreview(template,contact){
  const messages=(state.outreachData?.messages||[]).filter(item=>item.contact_id===contact.id).slice(0,20);
  const salutation=contact.confirmed_salutation||contact.salutation||outreachFallbackSalutation(contact);
  const name=contact.local_customer_name||contact.customer_name||contact.display_name;
  const nickname=contact.display_name||name;
  const content=/\{\{\s*(称呼|昵称|姓名)\s*\}\}/.test(template.content)?template.content:`{{称呼}}，${template.content}`;
  const rendered=content.replace(/\{\{\s*称呼\s*\}\}/g,salutation).replace(/\{\{\s*昵称\s*\}\}/g,nickname).replace(/\{\{\s*姓名\s*\}\}/g,name||nickname);
  return `<article class="outreach-template-preview"><span>预览 · ${esc(contact.display_name)}</span><p>${esc(rendered)}</p><small>称呼来源优先：人工确认、最近聊天、本地档案、备注；不确定时保守处理。</small></article>`;
}
function outreachFallbackSalutation(contact){
  const name=contact.local_customer_name||contact.customer_name||contact.display_name||'';
  if(/老师|医生/.test(contact.tags||''))return `${name.slice(0,1)}${contact.tags.includes('医生')?'医生':'老师'}`;
  if(contact.gender===1)return `${name.slice(0,1)}哥`;
  if(contact.gender===2)return `${name.slice(0,1)}姐`;
  return name||'您';
}
function outreachBatchControls(queuedTasks){
  if(!queuedTasks.length)return '';
  const batch=state.outreachBatch;
  if(batch?.active)return `<div class="outreach-batch-bar"><strong>批量发送中：已发送 ${batch.sent||0}，失败 ${batch.failed||0}，剩余 ${batch.remaining?.length||0}</strong><button class="secondary-button" type="button" onclick="cancelOutreachBatchSend()">取消剩余</button></div>`;
  return `<div class="outreach-batch-bar"><strong>待人工确认发送 ${queuedTasks.length} 条</strong><button class="primary-button" type="button" onclick="startOutreachBatchSend()">一键发送队列</button></div>`;
}
function outreachUserOptions(users,selected){return `<option value="">未绑定</option>${users.map(u=>`<option value="${esc(u.id)}" ${u.id===selected?'selected':''}>${esc(u.display_name)} · ${esc(u.role==='admin'?'管理员':'营养师')}</option>`).join('')}`}
function outreachProfile(contact){try{return JSON.parse(contact.profile_json||'{}')||{}}catch{return{}}}
function outreachProfileSummary(contact){const profile=outreachProfile(contact);if(profile.should_pause)return '已按客户反馈暂停主动触达';const signals=Array.isArray(profile.conversation_signals)?profile.conversation_signals:[];const focus=profile.suggested_followup_focus||'暂未沉淀跟进重点';return signals.length?`${signals.slice(-3).join('、')} · ${focus}`:`暂未沉淀画像信号 · ${focus}`}
function outreachContactRow(contact){const local=contact.local_customer_id||'';const contactTasks=(state.outreachData?.tasks||[]).filter(task=>task.contact_id===contact.id&&task.plan_day===state.outreachData?.plan_day);const strategy=contactTasks[0];return `<article><div><strong>${esc(contact.display_name)}</strong><span>尾号 ${esc(contact.phone_suffix||'—')} · ${esc(contact.owner_name||contact.bot_name||'未设置归属')}</span></div><div class="outreach-contact-reply ${contact.replied?'replied':''}"><strong>${contact.replied?'已回复':'未回复'}</strong><span>${contact.last_reply_at?`最近回复 ${esc(fmtDate(contact.last_reply_at))}`:'暂无回复记录'}</span><button class="secondary-button" type="button" onclick="toggleOutreachReplyStatus('${esc(contact.id)}')">${contact.reply_status_override===0?'人工纠正':'恢复自动'}</button></div><div class="outreach-tag-list">${(contact.tags||'').split('、').filter(Boolean).map(tag=>`<span>${esc(tag)}</span>`).join('')||'<span>无标签</span>'}</div>${contact.remark?`<small>${esc(contact.remark)}</small>`:''}<small class="outreach-profile-line">${esc(outreachProfileSummary(contact))}</small><div class="outreach-contact-actions"><span class="tag ${strategy?.status==='sent'?'green':strategy?'blue':''}">${strategy?`今日${esc(strategy.status==='sent'?'已发送':strategy.status==='queued'?'待发送':strategy.status==='paused'?'已暂停':'已生成')}`:'今日未生成'}</span><button class="secondary-button" type="button" onclick="openOutreachContact('${esc(contact.id)}')">打开对话</button><button class="primary-button" type="button" onclick="generateOutreachStrategyForContact('${esc(contact.id)}')">${strategy?'重新生成':'生成一客一策'}</button><select data-contact="${esc(contact.id)}"><option value="">补充本地档案</option>${(state.outreachData?.local_customers||[]).map(c=>`<option value="${esc(c.id)}" ${c.id===local?'selected':''}>${esc(c.display_name)} · ${esc(c.phone_suffix)}</option>`).join('')}</select></div></article>`}
function outreachTaskCard(task){const queued=task.status==='queued',sent=task.status==='sent',paused=task.status==='paused',editable=queued||task.status==='draft';const contact=(state.outreachData?.contacts||[]).find(item=>item.id===task.contact_id);const phone=task.phone_suffix||contact?.phone_suffix||'—';return `<article class="outreach-task-card ${task.priority}"><header><div><strong>${esc(task.contact_name||task.customer_name||'客户')}</strong><span>尾号 ${esc(phone)} · ${esc(strategyName(task.strategy_type))} · ${esc(task.audience||'')} · ${esc(task.source==='template'?'固定模板':task.source==='reply'?'回复跟进':'一客一策')}</span></div><span>${esc(task.status)}</span></header>${editable?`<label class="form-label">触达内容<textarea class="outreach-task-editor" data-task="${esc(task.id)}" rows="4" maxlength="600">${esc(task.recommended_message)}</textarea></label><button class="secondary-button" type="button" onclick="updateOutreachTaskMessage('${esc(task.id)}')">保存修改内容</button>`:`<p>${esc(task.recommended_message)}</p>`}<dl><div><dt>触达理由</dt><dd>${esc(task.reason)}</dd></div><div><dt>下一步</dt><dd>${esc(task.next_action)}</dd></div><div><dt>暂停规则</dt><dd>${esc(task.stop_rule)}</dd></div><div><dt>画像沉淀</dt><dd>${esc(profileUpdateText(task.profile_updates))}</dd></div></dl><footer>${task.status==='draft'?`<button class="primary-button" type="button" data-action="outreach-queue" onclick="queueOutreachTask('${esc(task.id)}')">保存并加入队列</button>`:''}${queued?`<button class="primary-button" type="button" data-action="outreach-send" onclick="confirmOutreachSend('${esc(task.id)}')">保存并发送</button>`:''}${paused?'<span class="tag red">已暂停</span>':''}${sent?'<span class="tag green">已发送</span>':''}</footer></article>`}
function strategyName(type){return ({care:'关怀',repurchase_notice:'复购通知',education:'教育',activity:'活动',service:'服务',boundary_check:'边界确认'}[type]||'关怀')}
function profileUpdateText(value){try{const data=JSON.parse(value||'{}');return [data.observed_signal,data.next_focus].filter(Boolean).join(' / ')||'暂无'}catch{return '暂无'}}
function outreachQueueCard(task){return `<article><div><strong>${esc(task.contact_name||task.customer_name||'客户')}</strong><span>${esc(task.bot_name||'')} · 待人工确认</span></div><p>${esc(task.recommended_message)}</p><button class="primary-button" type="button" data-action="outreach-send" onclick="confirmOutreachSend('${esc(task.id)}')">确认发送</button></article>`}
function outreachMessageRow(item){return `<article><div><strong>${esc(item.contact_name||'客户')}</strong><span>${esc(item.direction==='inbound'?'客户回复':'系统发送')} · ${esc(item.status)}</span></div><p>${esc(item.content)}</p><time>${fmtDate(item.created_at)}</time></article>`}
function outreachProfileRow(item){return `<article><div><strong>${esc(item.contact_name||'客户')}</strong><span>${esc(item.created_at?fmtDate(item.created_at):'')}</span></div><p>${esc(item.updates_json||'暂无建议')}</p></article>`}
async function syncOutreachContacts(){if(state.outreachPending)return;state.outreachPending=true;toast('正在同步句子互动客户…');try{await studioApi('/outreach/sync',{method:'POST',body:'{}'});state.outreachAutoStarted=false;await renderOutreach();toast('客户同步完成')}catch(error){toast(error.message)}finally{state.outreachPending=false}}
async function refreshOutreachCache(contactId=''){if(state.outreachPending)return;state.outreachPending=true;try{await renderOutreach();if(contactId)openOutreachContact(contactId);toast('已刷新已同步数据')}catch(error){toast(error.message)}finally{state.outreachPending=false}}
async function syncOutreachHistory(){if(state.outreachPending)return;state.outreachPending=true;state.outreachError='正在同步句子互动 30 天真实对话…';state.outreachNotice='';renderOutreachWorkspace(state.outreachData);try{const result=await studioApi('/outreach/messages/sync',{method:'POST',body:'{}'});state.outreachError='';state.outreachNotice='';await renderOutreach();toast(`真实对话同步完成：新增 ${result.inserted||0} 条`)}catch(error){if(error.code==='RATE_LIMIT'){state.outreachError='';state.outreachNotice='真实对话同步间隔未到，当前展示最近一次同步的数据。';toast('同步间隔未到，已展示最近同步数据')}else{state.outreachError=error.message;state.outreachNotice='';toast(error.message)}renderOutreachWorkspace(state.outreachData)}finally{state.outreachPending=false}}
async function refreshOutreachStrategies(refresh){if(state.outreachPending)return;state.outreachPending=true;state.outreachError=refresh?'正在为全部真实客户重新生成今日策略…':'正在生成今日策略…';renderOutreachWorkspace(state.outreachData);try{const result=await studioApi('/outreach/strategies',{method:'POST',body:JSON.stringify({refresh})});state.outreachError='';await renderOutreach();toast(`今日策略已生成 ${result.created_count||0} 条`)}catch(error){state.outreachError=error.message;renderOutreachWorkspace(state.outreachData);toast(error.message)}finally{state.outreachPending=false}}
async function generateOutreachStrategyForContact(id){if(state.outreachPending)return;state.outreachPending=true;const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);state.outreachError=`正在为 ${contact?.display_name||'该客户'} 生成一客一策…`;renderOutreachWorkspace(state.outreachData);try{const result=await studioApi('/outreach/strategies',{method:'POST',body:JSON.stringify({contact_id:id})});state.outreachError='';await renderOutreach();openOutreachContact(id);toast(`已生成 ${result.created_count||result.tasks?.length||0} 条触达策略`)}catch(error){state.outreachError=error.message;renderOutreachWorkspace(state.outreachData);toast(error.message)}finally{state.outreachPending=false}}
function outreachChatMessages(messages){const items=[...messages].sort((a,b)=>a.created_at-b.created_at).slice(-100);if(!items.length)return '<div class="empty-card">暂无 30 天内真实聊天记录。请先同步真实对话。</div>';return `<div class="outreach-chat">${items.map(item=>`<article class="${item.direction==='inbound'?'inbound':'outbound'}"><p>${esc(item.content)}</p><time>${esc(fmtDate(item.created_at))} · ${esc(item.direction==='inbound'?'客户':'营养师')}</time></article>`).join('')}</div>`}
function openOutreachContact(id){const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);if(!contact)return;const messages=(state.outreachData?.messages||[]).filter(item=>item.contact_id===id);const tasks=(state.outreachData?.tasks||[]).filter(task=>task.contact_id===id&&task.plan_day===state.outreachData?.plan_day);const profile=outreachProfile(contact);showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">真实客户对话</p><h3>${esc(contact.display_name)} · 尾号 ${esc(contact.phone_suffix||'—')}</h3><p>${esc(contact.bot_name||'')} · ${esc(contact.owner_name||'未设置归属')} · ${contact.replied?'<b class="reply-badge replied">已回复</b>':'<b class="reply-badge">未回复</b>'}</p></div><div class="drawer-body outreach-drawer"><section class="outreach-drawer-grid"><div><h4>句子互动标签</h4><div class="outreach-tag-list">${(contact.tags||'').split('、').filter(Boolean).map(tag=>`<span>${esc(tag)}</span>`).join('')||'<span>无标签</span>'}</div>${contact.remark?`<p>${esc(contact.remark)}</p>`:''}</div><div><h4>画像与回复</h4><p>${esc(outreachProfileSummary(contact))}</p>${contact.last_reply_at?`<small>最近回复：${esc(fmtDate(contact.last_reply_at))}</small>`:'<small>暂无回复记录</small>'}<div class="outreach-inline-actions"><button class="secondary-button" type="button" onclick="toggleOutreachReplyStatus('${esc(id)}')">${contact.reply_status_override===0?'人工纠正回复状态':'恢复自动识别'}</button></div></div></section><section><h4>称呼确认</h4><div class="outreach-salutation-form"><input id="outreach-salutation-${esc(id)}" value="${esc(contact.confirmed_salutation||contact.salutation||outreachFallbackSalutation(contact))}" maxlength="30" placeholder="例如：张哥、徐姐、张老师"><button class="primary-button" type="button" onclick="saveOutreachSalutation('${esc(id)}')">保存称呼</button></div><small>人工确认后，固定模板和推荐回复会优先使用这个称呼。</small></section><section><h4>触达策略</h4>${tasks.length?tasks.map(outreachTaskCard).join(''):'<div class="empty-card">该客户今日暂无策略。</div>'}<button class="primary-button" type="button" onclick="generateOutreachStrategyForContact('${esc(id)}')">生成/重算一客一策</button></section><section><h4>真实对话框</h4>${outreachChatMessages(messages)}<div class="outreach-inline-actions"><button class="secondary-button" type="button" onclick="syncOutreachHistory()">同步最新对话</button><button class="primary-button" type="button" onclick="generateOutreachReply('${esc(id)}')">生成推荐回复</button></div></section></div>`)}
async function bindOutreachContact(id,customerId){try{await studioApi(`/outreach/contacts/${encodeURIComponent(id)}/bind`,{method:'PUT',body:JSON.stringify({local_customer_id:customerId})});toast(customerId?'客户绑定已更新':'已解除绑定');await renderOutreach()}catch(error){toast(error.message)}}
async function assignOutreachBot(id,userId){try{await studioApi(`/outreach/bots/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({owner_user_id:userId})});toast('托管账号归属已更新');await renderOutreach()}catch(error){toast(error.message)}}
async function saveOutreachTaskMessageFromEditor(id){
  const selector=`.outreach-task-editor[data-task="${CSS.escape(id)}"]`;
  const openDrawer=$('#drawer:not(.hidden)');
  const editor=(openDrawer&&openDrawer.querySelector(selector))||document.querySelector(selector);
  if(!editor)return null;
  const task=(state.outreachData?.tasks||[]).find(item=>item.id===id);
  if(task&&task.recommended_message===editor.value)return task;
  const result=await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/message`,{method:'PUT',body:JSON.stringify({message:editor.value})});
  if(task)task.recommended_message=result.message||editor.value;
  return task;
}
async function queueOutreachTask(id){const task=(state.outreachData?.tasks||[]).find(item=>item.id===id);const contactId=task?.contact_id;try{await saveOutreachTaskMessageFromEditor(id);await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/queue`,{method:'POST',body:'{}'});toast('已保存并加入执行队列');await renderOutreach();if(contactId)openOutreachContact(contactId)}catch(error){toast(error.message)}}
async function confirmOutreachSend(id){try{const task=await saveOutreachTaskMessageFromEditor(id)||((state.outreachData?.tasks||[]).find(item=>item.id===id));if(!task)return;const name=task.contact_name||task.customer_name||'客户';if(!confirm(`确认发送给 ${name}？\n\n${task.recommended_message}`))return;await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/send`,{method:'POST',body:'{}'});toast('已提交句子互动发送')}catch(error){toast(error.message)}finally{const task=(state.outreachData?.tasks||[]).find(item=>item.id===id);await renderOutreach();if(task?.contact_id)openOutreachContact(task.contact_id)}}
function resetOutreachTemplateForm(){const title=$('#outreach-template-title'),content=$('#outreach-template-content'),id=$('#outreach-template-id');if(!title||!content)return;id.value='';title.value='';content.value='';title.focus()}
function editOutreachTemplate(id){const template=(state.outreachData?.templates||[]).find(item=>item.id===id);if(!template)return;$('#outreach-template-id').value=template.id;$('#outreach-template-title').value=template.title;$('#outreach-template-content').value=template.content;$('#outreach-template-title').focus()}
async function saveOutreachTemplate(event){event.preventDefault();const id=$('#outreach-template-id').value.trim();const body={title:$('#outreach-template-title').value.trim(),content:$('#outreach-template-content').value.trim()};try{const result=await studioApi(id?`/outreach/templates/${encodeURIComponent(id)}`:'/outreach/templates',{method:id?'PUT':'POST',body:JSON.stringify(body)});toast('模板已保存');await renderOutreach();if(result.id)editOutreachTemplate(result.id)}catch(error){toast(error.message)}}
async function deleteOutreachTemplate(id){if(!confirm('确认停用该模板？后续可重新编辑启用。'))return;try{await studioApi(`/outreach/templates/${encodeURIComponent(id)}`,{method:'DELETE'});toast('模板已停用');await renderOutreach()}catch(error){toast(error.message)}}
async function generateOutreachTemplateTasks(templateId){
  let id=templateId||$('#outreach-template-id')?.value.trim()||'';
  try{
    if(!id){
      const saved=await saveOutreachTemplateWithoutRender();
      id=saved.id;
    }
    const result=await studioApi(`/outreach/templates/${encodeURIComponent(id)}/generate`,{method:'POST',body:JSON.stringify({})});
    toast(`已生成模板触达 ${result.created_count||0} 条，跳过 ${result.skipped_count||0} 条`);
    await renderOutreach();
  }catch(error){toast(error.message)}
}
async function saveOutreachTemplateWithoutRender(){
  const id=$('#outreach-template-id').value.trim();
  const body={title:$('#outreach-template-title').value.trim(),content:$('#outreach-template-content').value.trim()};
  const result=await studioApi(id?`/outreach/templates/${encodeURIComponent(id)}`:'/outreach/templates',{method:id?'PUT':'POST',body:JSON.stringify(body)});
  await studioApi('/outreach').then(data=>{state.outreachData=data});
  return result;
}
async function startOutreachBatchSend(){
  const queuedTasks=(state.outreachData?.tasks||[]).filter(task=>task.status==='queued');
  if(!queuedTasks.length)return toast('队列暂无待发送任务');
  if(!confirm(`确认批量发送 ${queuedTasks.length} 条消息？\n\n发送内容均需人工确认，系统将逐条提交句子互动。`))return;
  state.outreachBatch={active:true,sent:0,failed:0,remaining:[...queuedTasks.map(task=>task.id)]};
  renderOutreachWorkspace(state.outreachData);
  await sendNextOutreachBatchTask();
}
async function sendNextOutreachBatchTask(){
  const batch=state.outreachBatch;
  if(!batch?.active||!batch.remaining?.length)return;
  const id=batch.remaining[0];
  const task=(state.outreachData?.tasks||[]).find(item=>item.id===id);
  try{
    await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/send`,{method:'POST',body:'{}'});
    batch.sent++;
  }catch(error){
    batch.failed++;
    toast(error.message);
  }
  batch.remaining=batch.remaining.slice(1);
  state.outreachData=await studioApi('/outreach');
  renderOutreachWorkspace(state.outreachData);
  if(batch.remaining.length)await sendNextOutreachBatchTask();
  else{batch.active=false;toast(`批量发送完成：成功 ${batch.sent}，失败 ${batch.failed}`)}
}
async function cancelOutreachBatchSend(){const batch=state.outreachBatch;if(!batch?.active)return;batch.active=false;batch.remaining=[];toast('已取消剩余批量发送');await renderOutreach()}
async function toggleOutreachReplyStatus(id){const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);if(!contact)return;const next=contact.reply_status_override===0?!contact.replied:null;try{await studioApi(`/outreach/contacts/${encodeURIComponent(id)}/reply-status`,{method:'PUT',body:JSON.stringify(next===null?{}:{replied:next})});toast(next===null?'已恢复自动识别回复状态':next?'已标记为已回复':'已标记为未回复');await renderOutreach();openOutreachContact(id)}catch(error){toast(error.message)}}
async function saveOutreachSalutation(id){const input=$(`#outreach-salutation-${CSS.escape(id)}`);if(!input)return;const salutation=input.value.trim();if(!salutation)return toast('请填写称呼');try{await studioApi(`/outreach/contacts/${encodeURIComponent(id)}/salutation`,{method:'PUT',body:JSON.stringify({salutation})});toast('称呼已确认');await renderOutreach();openOutreachContact(id)}catch(error){toast(error.message)}}
async function updateOutreachTaskMessage(id){try{const task=await saveOutreachTaskMessageFromEditor(id);if(!task)return;toast('触达内容已更新');renderOutreachWorkspace(state.outreachData)}catch(error){toast(error.message)}}
async function generateOutreachReply(id){if(state.outreachPending)return;state.outreachPending=true;const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);state.outreachError=`正在为 ${contact?.display_name||'该客户'} 生成推荐回复…`;renderOutreachWorkspace(state.outreachData);try{await studioApi('/outreach/replies',{method:'POST',body:JSON.stringify({contact_id:id})});state.outreachError='';toast('推荐回复已生成，请编辑后入队发送');await renderOutreach();openOutreachContact(id)}catch(error){state.outreachError=error.message;renderOutreachWorkspace(state.outreachData);toast(error.message)}finally{state.outreachPending=false}}
async function renderScripts(){
  setHeader('话术中心','话术中心');
  const version=navigationVersion;
  try{
    const response=await fetch('/api/studio/status',{credentials:'same-origin'});
    const result=await response.json();
    if(version!==navigationVersion)return;
    if(!response.ok||!result.success||typeof result.data?.model_configured!=='boolean')throw new Error('unavailable');
    $('#main-content').innerHTML='<iframe id="studio-frame" class="studio-frame" src="/script-studio/index.html" title="话术中心" allow="clipboard-write" referrerpolicy="no-referrer"></iframe>';
  }catch(error){
    if(version!==navigationVersion)return;
    $('#main-content').innerHTML='<div class="empty-card">当前站点尚未接入话术生成服务。<br><button class="secondary-button" onclick="navigate(\'scripts\')">重试</button><a class="text-button" href="https://dotbest-ops-demo.regard1ee.chatgpt.site/script-studio" target="_blank" rel="noopener">打开线上中台</a></div>';
  }
}
async function renderJuziWorkbench(){
  setHeader('句子互动工作台','用户触达 / 句子互动工作台');
  const version=navigationVersion;
  if(state.studioRole!=='admin'){
    $('#main-content').innerHTML='<div class="empty-card">当前账号没有句子互动工作台权限，仅管理员可以使用 SSO 内嵌工作台。</div>';
    return;
  }
  const data=await studioApi('/juzi/sso');
  if(version!==navigationVersion)return;
  state.juziSpOrigin=data.sp_origin||'';
  $('#main-content').innerHTML=`<section class="juzi-workbench">
    <header><div><span>INTEGRATED WORKBENCH</span><h3>句子互动客户工作台</h3><p>通过中台账号完成 SSO，仅管理员可见；新消息提醒会点亮当前标签页标题。</p></div></header>
    <iframe id="juzi-frame" class="juzi-frame" src="${esc(data.iframe_url)}" title="句子互动工作台" allow="clipboard-write; fullscreen" referrerpolicy="no-referrer"></iframe>
  </section>`;
}
function stopJuziBlink(){
  if(juziBlinkTimer)clearInterval(juziBlinkTimer);
  juziBlinkTimer=null;
  if(juziOriginalTitle)document.title=juziOriginalTitle;
}
function startJuziBlink(){
  if(juziBlinkTimer)return;
  juziOriginalTitle=document.title;
  let on=false;
  juziBlinkTimer=setInterval(()=>{
    on=!on;
    document.title=on?`(●) 有新消息 - ${juziOriginalTitle}`:juziOriginalTitle;
  },900);
}
window.addEventListener('message',event=>{
  if(!state.juziSpOrigin||event.origin!==state.juziSpOrigin)return;
  const data=event.data;
  if(data?.type!=='favicon_blink')return;
  if(data.payload===true)startJuziBlink();else stopJuziBlink();
});
window.addEventListener('focus',stopJuziBlink);
window.addEventListener('pagehide',stopJuziBlink);
async function renderScriptTemplates(){setHeader('模板参考','话术中心 / 模板参考');const data=await api('/api/v1/private/scripts');state.scripts=data.items;const h=data.historical_learning,t=h.totals;$('#main-content').innerHTML=`<section class="hero script-hero"><div><p class="hero-kicker">HUMAN-TONE PLAYBOOK</p><h3>先像一个记得上下文的人，再像一个懂产品的顾问</h3><p>基于历史触达结果生成：首条只做一件事，先让用户愿意开口；用户回复后再进入教育、对比、成交或服务。</p></div><button class="primary-button" onclick="navigate(&#39;scripts&#39;)">打开话术中心 →</button></section><section class="history-learning"><header><div><span>已导入历史触达学习</span><h2>${esc(h.source)}</h2><p>${esc(h.scope)}</p></div><div class="history-total"><strong>${Number(t.touches).toLocaleString()}</strong><span>历史触达量 · ${t.records} 条汇总口径记录</span></div></header><div class="history-metrics">${rateMetric('历史回复率',t.reply_rate+'%',Number(t.replies).toLocaleString()+' 人回复')}${rateMetric('回复后转化率',t.reply_to_conversion+'%',Number(t.conversions).toLocaleString()+' 人转化')}${rateMetric('历史意向人数',Number(t.intents).toLocaleString(),'脱敏模拟汇总口径')}${rateMetric('删除人数',Number(t.deletes).toLocaleString(),'用于演示打扰风险')}</div><div class="evidence-grid">${h.evidence.map(x=>`<article class="evidence-card ${x.type==='风险信号'?'risk':''}"><span>${esc(x.type)}</span><h3>${esc(x.title)}</h3><strong>${esc(x.rate)}</strong><p>${esc(x.metric)}</p><small>${esc(x.note)}</small></article>`).join('')}</div><div class="learned-rules"><strong>已写入生成器的规则</strong>${h.rules.map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</div></section><section class="lifecycle-map">${data.lifecycle.map(x=>`<div><strong>${esc(x.customer_type)}</strong>${x.path.map((p,i)=>`<span>${i?'<i>→</i>':''}${esc(p)}</span>`).join('')}</div>`).join('')}</section><div class="script-filter">${data.scenes.map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="script-grid">${data.items.map((x,i)=>`<article class="script-card"><div class="script-meta"><span>${esc(x.customer_type)}</span><b>${esc(x.stage)}</b></div><h3>${esc(x.title)}</h3><p>${esc(x.scene)} · ${esc(x.purpose)}</p><blockquote>${esc(x.template)}</blockquote><div class="next-turn-mini"><strong>下一回合</strong>${esc(x.next_turn)}</div><div class="script-warning">避免：${esc(x.avoid)}</div><div><button class="secondary-button" onclick="copyScript(${i})">复制模板</button><button class="text-button" onclick="openScript(${i})">查看与编辑 →</button></div></article>`).join('')}</div>`}
async function copyScript(index){try{await navigator.clipboard.writeText(state.scripts[index].template);toast('模板已复制，使用前请完成个性化编辑')}catch{toast('请手动复制模板')}}
function openScript(index){const x=state.scripts[index];showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">${esc(x.customer_type)} · ${esc(x.stage)}</p><h3>${esc(x.title)}</h3><p>${esc(x.scene)} · ${esc(x.purpose)}</p></div><div class="drawer-body"><label class="form-label">可编辑话术<textarea id="script-editor" rows="9">${esc(x.template)}</textarea></label><section class="detail-section"><h4>用户回复后的下一回合</h4><p>${esc(x.next_turn)}</p></section><div class="caution-box"><strong>发送前检查</strong><p>${esc(x.avoid)}</p></div><button class="primary-button full" onclick="copyEditedScript()">复制编辑后话术</button><button class="secondary-button full" onclick="closeDrawer();navigate(&#39;scripts&#39;)">打开话术中心生成个性化版本</button></div>`)}
async function copyEditedScript(){try{await navigator.clipboard.writeText($('#script-editor').value);toast('已复制编辑后话术')}catch{toast('请手动复制话术')}}

async function renderGovernance(){setHeader('合规与权限','合规与权限');const data=await api('/api/v1/private/governance');$('#main-content').innerHTML=`<section class="permission-banner"><div><span>当前角色</span><h3>${esc(data.role)}</h3><p>权限围绕本人负责用户的触达执行配置。</p></div><strong>内部信息仅限授权人员使用</strong></section><div class="permission-grid"><article class="permission-card allowed"><h3>允许操作</h3><ul>${data.allowed.map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul></article><article class="permission-card blocked"><h3>禁止操作</h3><ul>${data.blocked.map(x=>`<li>× ${esc(x)}</li>`).join('')}</ul></article></div><section class="panel"><div class="panel-title"><h4>最近操作记录</h4><span>演示审计日志</span></div>${data.audit.map(x=>`<div class="audit-row"><time>${esc(x.time)}</time><strong>${esc(x.action)}</strong><span>${esc(x.object)}</span><b>${esc(x.result)}</b></div>`).join('')}</section>`}

Object.assign(window,{navigate,openSegment,openAudience,searchAudience,selectOwner,changeAudiencePage,openCustomerForm,saveCustomer,openImportForm,renderImportPreview,loadImportFile,saveCustomerImport,openCustomer,closeDrawer,refreshProfile,filterTasks,openTaskDetail,refreshTouchOptimization,completeTask,syncOutreachContacts,syncOutreachHistory,refreshOutreachCache,refreshOutreachStrategies,generateOutreachStrategyForContact,openOutreachContact,bindOutreachContact,assignOutreachBot,queueOutreachTask,confirmOutreachSend,resetOutreachTemplateForm,editOutreachTemplate,saveOutreachTemplate,deleteOutreachTemplate,generateOutreachTemplateTasks,startOutreachBatchSend,sendNextOutreachBatchTask,cancelOutreachBatchSend,toggleOutreachReplyStatus,saveOutreachSalutation,updateOutreachTaskMessage,generateOutreachReply,copyScript,openScript,copyEditedScript});
bootstrap();
