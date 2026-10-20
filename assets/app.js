const state={user:null,studioRole:null,page:'workbench',dashboardData:null,dashboardAssetPage:1,dashboardAssetQuery:'',dashboardAssetTag:'',dashboardAssetAudience:'',dashboardAssetReply:'all',dashboardAssetSyncPending:false,dashboardTaskPage:1,dashboardTaskQuery:'',dashboardTaskStatus:'all',dashboardTaskScope:'today',outreachUser:null,outreachCsrf:'',outreachData:null,outreachUsers:[],outreachPending:false,outreachAutoStarted:false,outreachModelConfigured:false,outreachError:'',outreachNotice:'',outreachJob:null,outreachJobContactId:'',outreachBatch:null,outreachContactPage:1,outreachContactQuery:'',outreachContactReply:'all',outreachTaskPage:1,outreachTaskQuery:'',outreachTaskStatus:'all',outreachTaskSelectionAll:false,outreachTagQuery:'',outreachTagMode:'contains',outreachExcludeTag:'',outreachBotId:'',outreachStrategyDirection:'auto',juziSpOrigin:'',passwordChangeRequired:false,passwordChangeUsername:''};
let navigationVersion=0;
let juziBlinkTimer=null,juziOriginalTitle='';
let outreachJobTimer=null;
let outreachHistorySyncTimer=null;
let dashboardRefreshTimer=null;
let dashboardSalesFormDirty=false;
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(value){if(!value)return '—';try{return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch{return value}}
function toast(message){const node=$('#toast');node.textContent=message;node.classList.remove('hidden');setTimeout(()=>node.classList.add('hidden'),2300)}
function loading(text='正在加载…'){$('#main-content').innerHTML=`<div class="loading-card">${esc(text)}</div>`}
function pageLeftSince(page){return state.page!==page}
async function api(path,options={}){const requestedPage=state.page;const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json().catch(()=>({success:false,error:{message:response.status===504?'请求超时，请稍后重试':response.status===502?'服务暂时异常，请稍后重试':'响应格式错误'}}));if(pageLeftSince(requestedPage))throw new DOMException('页面已切换','AbortError');if(response.status===401){showLogin();throw new Error('请先登录')}if(!response.ok||!result.success)throw new Error(result.error?.message||'请求失败');return result.data}
function showLogin(){$('#app').classList.add('hidden');$('#login-view').classList.remove('hidden')}
function showApp(){$('#login-view').classList.add('hidden');$('#app').classList.remove('hidden')}
function showDrawer(html){$('#drawer-content').innerHTML=html;$('#drawer').classList.remove('hidden');$('#drawer-backdrop').classList.remove('hidden')}
function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawer-backdrop').classList.add('hidden')}
function setHeader(title,crumb){$('#page-title').textContent=title;$('#breadcrumb').textContent=`私域运营中台 / ${crumb}`}
function setNav(page){state.page=page;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#main-content').classList.toggle('studio-content',page==='scripts');$('.sync-state').textContent='真实账号 · 权限受控'}

async function bootstrap(){try{const data=await studioApi('/me');applyStudioSession(data);window.DotbestDemoAuth?.set(true);applyUser();showApp();if(data.user?.must_change){renderPasswordChange();return}state.passwordChangeRequired=false;state.passwordChangeUsername='';navigate(initialPage(),'replace')}catch{showLogin()}}
function applyUser(){$('#user-name').textContent=state.user?.display_name||'未登录';$('#user-role').textContent=state.user?.role==='admin'?'管理员':state.user?.role==='sales'?'销售':'团队账号';$('#user-avatar').textContent=state.user?.display_name?.slice(0,1)||'多'}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.currentTarget);const credentials=Object.fromEntries(form);credentials.username=String(credentials.username||'').trim();try{const data=await studioApi('/login',{method:'POST',body:JSON.stringify(credentials)});applyStudioSession(data);window.DotbestDemoAuth?.set(true);applyUser();showApp();if(data.user?.must_change){state.passwordChangeRequired=true;state.passwordChangeUsername=credentials.username;renderPasswordChange();return}state.passwordChangeRequired=false;state.passwordChangeUsername='';const me=await studioApi('/me');applyStudioSession(me);window.DotbestDemoAuth?.set(true);applyUser();navigate(initialPage())}catch(err){toast(err.message)}});
$('#logout-button').addEventListener('click',async()=>{navigationVersion++;stopOutreachHistoryAutoSync();$('#main-content').replaceChildren();try{await logoutStudio();state.user=null;state.passwordChangeRequired=false;state.passwordChangeUsername='';window.DotbestDemoAuth?.set(false);showLogin()}catch{toast('退出未完成，请重试')}});
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

async function navigate(page,historyMode='push'){if(!page)return;if(state.passwordChangeRequired){toast('请先完成临时密码修改');return}const version=++navigationVersion;if(page!=='outreach')stopOutreachHistoryAutoSync();if(page!=='workbench')stopDashboardAutoRefresh();setNav(page);closeDrawer();loading();if(historyMode!=='none'){const url=new URL(location.href);url.searchParams.set('page',page);if(url.href!==location.href)history[historyMode==='replace'?'replaceState':'pushState']({},'',url)}try{if(page==='workbench')await renderWorkbench();else if(page==='assets')await renderAssets();else if(page==='tasks')await renderTasks();else if(page==='scripts')await renderScripts();else if(page==='outreach')await renderOutreach();else if(page==='juzi-workbench')await renderJuziWorkbench();else if(page==='script-templates')await renderScriptTemplates();else if(page==='governance')await renderGovernance()}catch(err){if(version!==navigationVersion||err.name==='AbortError')return;$('#main-content').innerHTML=`<div class="empty-card">加载失败：${esc(err.message)}<br><button class="secondary-button" onclick="navigate('${esc(page)}')">重新加载</button></div>`}}
function startOutreachHistoryAutoSync(){
  if(outreachHistorySyncTimer)return;
  outreachHistorySyncTimer=setInterval(()=>{
    if(document.hidden||state.page!=='outreach'||state.outreachUser?.role!=='admin')return;
    syncOutreachHistory({automatic:true});
  },30000);
}
function stopOutreachHistoryAutoSync(){
  if(!outreachHistorySyncTimer)return;
  clearInterval(outreachHistorySyncTimer);
  outreachHistorySyncTimer=null;
}
function startDashboardAutoRefresh(){
  if(dashboardRefreshTimer)return;
  dashboardRefreshTimer=setInterval(async()=>{
    if(document.hidden||state.page!=='workbench')return;
    if(document.activeElement&&$('#dashboard-sales-form')?.contains(document.activeElement))return;
    if(dashboardSalesFormDirty)return;
    try{
      const data=await studioApi('/dashboard');
      if(state.page==='workbench')renderDashboardWorkspace(data);
    }catch{}
  },30000);
}
function stopDashboardAutoRefresh(){
  if(!dashboardRefreshTimer)return;
  clearInterval(dashboardRefreshTimer);
  dashboardRefreshTimer=null;
}
window.addEventListener('popstate',()=>{if(state.user)navigate(initialPage(),'none')});
function metric(label,value,note,tone='') {return `<article class="metric-card execution-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function assetCard(item){return `<button class="asset-card" style="--accent:${esc(item.color)}" onclick="openAudience('${esc(item.code)}')"><div class="asset-icon">${esc(item.name.slice(0,1))}</div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p><div class="asset-stats"><div><strong>${item.customer_count}</strong><span>归属用户</span></div><div><strong>${item.due_count}</strong><span>待触达</span></div></div><b class="asset-arrow">→</b></button>`}
function segmentCard(item){const parts=(state.categories||[]).filter(c=>item.category_codes.includes(c.code)).map(c=>c.name).join('、');return `<button class="asset-card segment-card" style="--accent:${esc(item.color)}" onclick="openSegment('${esc(item.code)}')"><div class="asset-icon">${esc(item.name.slice(0,1))}</div><h4>${esc(item.name)}</h4><p>${esc(item.description)}</p><small class="segment-parts">${esc(parts)}</small><div class="asset-stats"><div><strong>${item.customer_count}</strong><span>板块用户</span></div><div><strong>${item.due_count}</strong><span>待触达</span></div></div><b class="asset-arrow">→</b></button>`}
function stagePill(stage){const cls=stage==='待回复'||stage==='对话中'?'urgent':stage==='暂停触达'?'paused':stage==='待跟进'?'follow':'';return `<span class="stage-pill ${cls}">${esc(stage)}</span>`}

async function renderWorkbench(){
  setHeader('今日私域经营与触达','今日工作台');
  const version=navigationVersion;
  const data=await studioApi('/dashboard');
  if(version!==navigationVersion)return;
  state.dashboardData=data;
  renderDashboardWorkspace(data);
  startDashboardAutoRefresh();
}
function dashboardCurrency(value){return `¥${Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function dashboardPercent(value){return value==null?'—':`${Number(value).toFixed(1)}%`}
function dashboardStatusPill(status){
  const label={draft:'未入队',queued:'待发送',sent:'已发送',failed:'异常',paused:'已暂停'}[status]||status;
  const cls=['draft','queued'].includes(status)?'pending':status==='sent'?'done':status==='paused'?'paused':'failed';
  return `<span class="dashboard-status ${cls}">${esc(label)}</span>`;
}
function renderDashboardWorkspace(data){
  state.dashboardData=data;
  $('#task-count').textContent=data.task_stats.unsent;
  const sales=data.sales,today=sales.today,yesterday=sales.yesterday,rate=data.outreach_rate,tasks=data.task_stats,contacts=data.contact_stats;
  $('#main-content').innerHTML=`<section class="dashboard-hero">
    <div><p class="hero-kicker">REAL PRIVATE OPERATION</p><h1>今日工作台</h1><p>销售目标、真实触达结果和执行队列在同一屏核对；数据来自句子互动同步链路，30 秒自动刷新。</p></div>
    <div class="dashboard-hero-side"><span>昨日 ${esc(data.yesterday)}</span><strong>${dashboardCurrency(yesterday.actual_amount)}</strong><small>有赞 ${dashboardCurrency(yesterday.youzan_actual)} + 天猫 ${dashboardCurrency(yesterday.tianmao_actual)}</small></div>
  </section>
  <div class="dashboard-metric-grid">
    ${metric('昨日私域产出',dashboardCurrency(yesterday.actual_amount),yesterday.achievement_rate==null?'未设置昨日目标':`达成率 ${dashboardPercent(yesterday.achievement_rate)}`)}
    ${metric('今日私域目标',dashboardCurrency(today.target_amount),today.achievement_rate==null?'已录产出，未设置达成率':`达成率 ${dashboardPercent(today.achievement_rate)} · 已录产出 ${dashboardCurrency(today.actual_amount)}`)}
    ${metric('昨日触达回复率',dashboardPercent(rate.rate),`${rate.replied}/${rate.touched} 人回复`,'urgent')}
    ${metric('今日触达任务',tasks.total,`未完成 ${tasks.unsent} 条`)}
    ${metric('执行队列',tasks.queued,'发送前仍需人工确认')}
    ${metric('真实客户',contacts.total,`${contacts.anti_aging} 抗衰 / ${contacts.daily_nutrition} 日常`)}
  </div>
  <section class="dashboard-two-column">
    <div>
      <div class="section-heading"><div><h3>今日销售目标与产出</h3><p>只填私域总目标；完成情况拆分有赞和天猫实际产出。</p></div></div>
      ${state.studioRole==='admin'?`<form id="dashboard-sales-form" class="dashboard-sales-form" onsubmit="saveDashboardSalesTarget(event)">
        <label>业务日期<input type="date" name="business_day" value="${esc(data.today)}" oninput="dashboardSalesFormDirty=true" required></label>
        <label>私域总目标（元）<input type="number" name="target_amount" min="0" step="0.01" value="${esc(today.target_amount||0)}" oninput="dashboardSalesFormDirty=true" required></label>
        <label>有赞实际产出（元）<input type="number" name="youzan_actual" min="0" step="0.01" value="${esc(today.youzan_actual||0)}" oninput="dashboardSalesFormDirty=true"></label>
        <label>天猫实际产出（元）<input type="number" name="tianmao_actual" min="0" step="0.01" value="${esc(today.tianmao_actual||0)}" oninput="dashboardSalesFormDirty=true"></label>
        <button class="primary-button" type="submit">保存目标与产出</button>
      </form>`:`<div class="dashboard-note">目标由管理员录入，销售账号按归属客户查看执行结果。</div>`}
      <div class="dashboard-advice-list">
        <h3>销售与运营建议</h3>
        ${data.suggestions.map(item=>`<p><span>→</span>${esc(item)}</p>`).join('')}
      </div>
    </div>
    <div>
      <div class="section-heading"><div><h3>今日优先执行队列</h3><p>来自真实一客一策任务，发送前必须逐条确认。</p></div><button class="text-button" onclick="navigate('tasks')">全部任务 →</button></div>
      <div class="dashboard-priority-list">${data.priority_tasks.map(task=>`
        <article><div><strong>${esc(task.salutation||task.contact_name)}</strong><small>${esc(task.phone||'无尾号')} · ${esc(task.owner_name)}</small></div><p>${esc(task.recommended_message||task.reason||'待生成话术')}</p><footer>${dashboardStatusPill(task.status)}<span>${esc(task.audience_label)}</span><span>${esc(task.strategy_type||'策略')}</span></footer></article>`).join('')||'<div class="empty-card">今日暂无待执行触达任务。</div>'}</div>
    </div>
  </section>
  <section class="dashboard-footer-stats">
    <div><span>已回复客户</span><strong>${contacts.replied}</strong></div>
    <div><span>未绑定档案</span><strong>${contacts.unbound}</strong></div>
    <div><span>服务风险</span><strong>${contacts.risk}</strong></div>
    <div><span>30天消息留档</span><strong>${data.message_stats.last_30_days}</strong></div>
    <div><span>标签数</span><strong>${data.tag_summary.distinct_tags}</strong></div>
  </section>`;
}
async function saveDashboardSalesTarget(event){
  event.preventDefault();
  const form=new FormData(event.target);
  try{
    const data=await studioApi('/dashboard/sales-target',{method:'POST',body:JSON.stringify(Object.fromEntries(form))});
    dashboardSalesFormDirty=false;
    toast(`${data.business_day} 销售目标已保存`);
    const snapshot=await studioApi('/dashboard');
    if(state.page==='workbench')renderDashboardWorkspace(snapshot);
  }catch(error){toast(error.message)}
}

function ownerChipsHtml(owners,selected,onClick){if(!owners||!owners.length)return '';const sorted=[...owners].sort((a,b)=>b.count-a.count);return `<div class="owner-filter"><button class="owner-chip ${selected===''?'active':''}" onclick="${onClick}('')">全部顾问</button>${sorted.map(o=>`<button class="owner-chip ${selected===o.name?'active':''}" onclick="${onClick}('${esc(o.name).replace(/'/g,"\\'")}')">${esc(o.name)} <b>${o.count||''}</b></button>`).join('')}</div>`}
function selectOwner(owner){state.audienceOwner=owner||'';state.audiencePage=1;openAudience(state.audience,state.audienceQuery,1)}

async function renderAssets(){
  setHeader('真实客户资产','用户资产');
  const version=navigationVersion;
  const params=new URLSearchParams({
    page:state.dashboardAssetPage,limit:10,q:state.dashboardAssetQuery,tag:state.dashboardAssetTag,
    audience:state.dashboardAssetAudience,reply:state.dashboardAssetReply,
  });
  const [data,snapshot]=await Promise.all([studioApi(`/dashboard/assets?${params}`),studioApi('/dashboard')]);
  if(version!==navigationVersion)return;
  renderDashboardAssets(data,snapshot);
}
function renderDashboardAssets(data,snapshot){
  const contacts=snapshot.contact_stats,pagination=data.pagination;
  $('#task-count').textContent=contacts.total;
  $('#main-content').innerHTML=`<section class="dashboard-hero compact">
    <div><p class="hero-kicker">REAL CUSTOMER ASSETS</p><h1>用户资产</h1><p>展示句子互动同步后的真实客户，按标签、人群和回复状态筛选；手机号仅显示后四位。</p></div>
    <div class="dashboard-hero-side"><span>真实客户</span><strong>${contacts.total}</strong><small>${contacts.anti_aging} 抗衰 / ${contacts.daily_nutrition} 日常</small></div>
  </section>
  <div class="dashboard-filter-bar">
    <input id="dashboard-asset-search" value="${esc(state.dashboardAssetQuery)}" placeholder="搜索姓名、称呼、尾号、标签、备注或归属">
    <select id="dashboard-asset-audience" onchange="filterDashboardAssets()">
      <option value="">全部人群</option>
      <option value="anti_aging" ${state.dashboardAssetAudience==='anti_aging'?'selected':''}>抗衰用户</option>
      <option value="daily_nutrition" ${state.dashboardAssetAudience==='daily_nutrition'?'selected':''}>日常营养补充用户</option>
    </select>
    <select id="dashboard-asset-reply" onchange="filterDashboardAssets()">
      <option value="all">全部回复状态</option>
      <option value="replied" ${state.dashboardAssetReply==='replied'?'selected':''}>已回复</option>
      <option value="unread" ${state.dashboardAssetReply==='unread'?'selected':''}>未回复</option>
    </select>
    <input id="dashboard-asset-tag" value="${esc(state.dashboardAssetTag)}" placeholder="标签筛选，支持多个词">
    <button class="primary-button" onclick="filterDashboardAssets()">筛选</button>
    ${state.studioRole==='admin'?'<button class="secondary-button" type="button" data-action="dashboard-asset-sync" onclick="syncDashboardAssetsFromJuzi()">同步句子互动客户</button>':''}
  </div>
  <div class="table-wrap"><table class="data-table dashboard-table"><thead><tr><th>客户</th><th>人群与标签</th><th>内部画像摘要</th><th>状态</th><th>归属</th></tr></thead>
    <tbody>${data.items.map(item=>`<tr><td><div class="user-cell"><div class="mini-avatar">${esc(String(item.salutation||item.name).slice(0,1))}</div><div><strong>${esc(item.salutation||item.name)}</strong><span>${esc(item.phone||'无尾号')} · ${esc(item.match_status==='bound'?'已绑定档案':item.match_status==='suggested'?'建议绑定':'未绑定')}</span></div></div></td>
      <td><strong>${esc(item.audience_label)}</strong><div>${item.tags.slice(0,4).map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')||'<span class="tag">无标签</span>'}</div></td>
      <td class="profile-cell">${esc(item.summary)}<br><small>${esc(item.purchased_products||item.interests||'暂无购买与关注线索')}</small></td>
      <td>${dashboardStatusPill(item.replied?'sent':'draft')}<small>${esc(item.lifecycle)}</small><small>${item.last_reply_at?`最近回复 ${esc(fmtDate(item.last_reply_at))}`:'暂无回复记录'}</small></td>
      <td>${esc(item.owner_name)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-table-cell">没有符合条件的客户。</td></tr>'}</tbody></table>
    <div class="pagination-note">第 ${pagination.start_index}-${pagination.end_index} / 共 ${pagination.total} 条 · 每页 10 人 · 手机号已脱敏</div>
    <div class="pagination-controls"><button class="secondary-button" onclick="changeDashboardAssetPage(-1)" ${pagination.page<=1?'disabled':''}>上一页</button><span>第 ${pagination.page} / ${pagination.pages} 页</span><button class="secondary-button" onclick="changeDashboardAssetPage(1)" ${pagination.page>=pagination.pages?'disabled':''}>下一页</button></div>
  </div>
  <section class="boundary-note"><strong>使用边界</strong><span>画像、标签和意向层级仅供内部判断；不得直接发送给客户，暂停触达与服务风险客户优先处理诉求。</span></section>`;
  const search=$('#dashboard-asset-search');
  search.addEventListener('keydown',event=>{if(event.key==='Enter')filterDashboardAssets()});
  const tag=$('#dashboard-asset-tag');
  tag.addEventListener('keydown',event=>{if(event.key==='Enter')filterDashboardAssets()});
}
function filterDashboardAssets(){
  state.dashboardAssetQuery=$('#dashboard-asset-search').value.trim();
  state.dashboardAssetTag=$('#dashboard-asset-tag').value.trim();
  state.dashboardAssetAudience=$('#dashboard-asset-audience').value;
  state.dashboardAssetReply=$('#dashboard-asset-reply').value;
  state.dashboardAssetPage=1;
  renderAssets().catch(error=>toast(error.message));
}
function changeDashboardAssetPage(delta){
  state.dashboardAssetPage=Math.max(1,state.dashboardAssetPage+delta);
  renderAssets().catch(error=>toast(error.message));
}
async function syncDashboardAssetsFromJuzi(){
  if(state.dashboardAssetSyncPending)return;
  state.dashboardAssetSyncPending=true;
  toast('正在同步句子互动客户…');
  try{
    await studioApi('/outreach/sync',{method:'POST',body:'{}'});
    await renderAssets();
    toast('客户同步完成，列表已按最近回复刷新');
  }catch(error){
    toast(error.message);
  }finally{
    state.dashboardAssetSyncPending=false;
  }
}
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

async function renderTasks(){
  setHeader('真实触达任务','触达任务');
  const version=navigationVersion;
  const params=new URLSearchParams({
    page:state.dashboardTaskPage,limit:10,q:state.dashboardTaskQuery,status:state.dashboardTaskStatus,scope:state.dashboardTaskScope,
  });
  const [data,snapshot]=await Promise.all([studioApi(`/dashboard/tasks?${params}`),studioApi('/dashboard')]);
  if(version!==navigationVersion)return;
  renderDashboardTasks(data,snapshot);
}
function renderDashboardTasks(data,snapshot){
  const stats=snapshot.task_stats,pagination=data.pagination;
  $('#task-count').textContent=stats.unsent;
  const admin=state.studioRole==='admin';
  $('#main-content').innerHTML=`<section class="dashboard-hero compact">
    <div><p class="hero-kicker">REAL OUTREACH TASKS</p><h1>触达任务</h1><p>展示真实一客一策任务、执行状态和失败原因；管理员可入队、发送或删除未发送内容。</p></div>
    <div class="dashboard-hero-side"><span>${data.scope==='today'?'今日任务':'全部任务'}</span><strong>${pagination.total}</strong><small>未完成 ${stats.unsent} 条 · 队列 ${stats.queued} 条</small></div>
  </section>
  <div class="dashboard-filter-bar">
    <input id="dashboard-task-search" value="${esc(state.dashboardTaskQuery)}" placeholder="搜索客户、话术、策略或归属">
    <select id="dashboard-task-status" onchange="filterDashboardTasks()">
      <option value="all">全部状态</option>
      <option value="unsent" ${state.dashboardTaskStatus==='unsent'?'selected':''}>未发送</option>
      <option value="sent" ${state.dashboardTaskStatus==='sent'?'selected':''}>已发送</option>
      <option value="failed" ${state.dashboardTaskStatus==='failed'?'selected':''}>异常或暂停</option>
    </select>
    <select id="dashboard-task-scope" onchange="filterDashboardTasks()">
      <option value="today" ${state.dashboardTaskScope==='today'?'selected':''}>今日任务</option>
      <option value="all" ${state.dashboardTaskScope==='all'?'selected':''}>全部任务</option>
    </select>
    <button class="primary-button" onclick="filterDashboardTasks()">筛选</button>
  </div>
  <div class="table-wrap"><table class="data-table dashboard-table"><thead><tr><th>客户</th><th>策略依据</th><th>待确认话术</th><th>状态</th>${admin?'<th>操作</th>':''}</tr></thead>
    <tbody>${data.items.map(task=>`<tr><td><div class="user-cell"><div class="mini-avatar">${esc(String(task.salutation||task.contact_name).slice(0,1))}</div><div><strong>${esc(task.salutation||task.contact_name)}</strong><span>${esc(task.phone||'无尾号')} · ${esc(task.owner_name)}</span><small>${task.tags.slice(0,3).map(tag=>esc(tag)).join('、')||'无标签'}</small></div></div></td>
      <td class="profile-cell"><strong>${esc(task.strategy_type||'一客一策')}</strong><br>${esc(task.reason||'暂无策略依据')}<br><small>${esc(task.next_action||'')}</small></td>
      <td class="profile-cell">${esc(task.recommended_message||'待生成话术')}</td>
      <td>${dashboardStatusPill(task.status)}<small>${esc(task.plan_day)}</small></td>
      ${admin?`<td class="dashboard-task-actions">${task.status==='draft'?`<button class="primary-button" onclick="queueDashboardTask('${esc(task.id)}')">加入队列</button>`:''}${task.status==='queued'?`<button class="primary-button" onclick="sendDashboardTask('${esc(task.id)}')">确认发送</button>`:''}${['draft','queued'].includes(task.status)?`<button class="secondary-button" onclick="deleteDashboardTask('${esc(task.id)}')">删除</button>`:''}</td>`:''}</tr>`).join('')||`<tr><td colspan="${admin?5:4}" class="empty-table-cell">没有符合条件的触达任务。</td></tr>`}</tbody></table>
    <div class="pagination-note">第 ${pagination.start_index}-${pagination.end_index} / 共 ${pagination.total} 条 · 每页 10 条 · 发送前需人工确认</div>
    <div class="pagination-controls"><button class="secondary-button" onclick="changeDashboardTaskPage(-1)" ${pagination.page<=1?'disabled':''}>上一页</button><span>第 ${pagination.page} / ${pagination.pages} 页</span><button class="secondary-button" onclick="changeDashboardTaskPage(1)" ${pagination.page>=pagination.pages?'disabled':''}>下一页</button></div>
  </div>`;
  const search=$('#dashboard-task-search');
  search.addEventListener('keydown',event=>{if(event.key==='Enter')filterDashboardTasks()});
}
function filterDashboardTasks(){
  state.dashboardTaskQuery=$('#dashboard-task-search').value.trim();
  state.dashboardTaskStatus=$('#dashboard-task-status').value;
  state.dashboardTaskScope=$('#dashboard-task-scope').value;
  state.dashboardTaskPage=1;
  renderTasks().catch(error=>toast(error.message));
}
function changeDashboardTaskPage(delta){
  state.dashboardTaskPage=Math.max(1,state.dashboardTaskPage+delta);
  renderTasks().catch(error=>toast(error.message));
}
async function queueDashboardTask(id){
  try{await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/queue`,{method:'POST',body:'{}'});toast('已加入真实执行队列');await renderTasks()}catch(error){toast(error.message)}
}
async function sendDashboardTask(id){
  const task=(state.dashboardData?.priority_tasks||[]).find(item=>item.id===id);
  if(!confirm('确认发送该触达内容？发送前请再次核对称呼、事实和活动信息。'))return;
  try{await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/send`,{method:'POST',body:'{}'});toast('已提交句子互动发送');await renderTasks()}catch(error){toast(error.message)}
}
async function deleteDashboardTask(id){
  if(!confirm('确认删除这条未发送触达内容？已发送真实消息留档不会删除。'))return;
  try{await studioApi(`/outreach/tasks/${encodeURIComponent(id)}`,{method:'DELETE'});toast('未发送触达内容已删除');await renderTasks()}catch(error){toast(error.message)}
}
function signed(value){return `${value>=0?'↑':'↓'} ${Math.abs(value)}% 较前日`}
function rateMetric(label,value,note,tone=''){return `<article class="touch-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function taskCategoryCard(category,items,active){const count=items.filter(x=>x.category===category.code&&x.status==='pending').length;return `<button class="task-category-card ${active===category.code?'active':''}" onclick="filterTasks('${esc(category.code)}')"><span>${esc(category.icon)}</span><strong>${esc(category.label)}</strong><small>${count} 项 · ${esc(category.description)}</small></button>`}
function touchTaskCard(t){const c=t.customer,u=c.persona;return `<article class="touch-task ${t.status==='done'?'done':''}"><div class="task-type-mark" data-type="${esc(t.category)}"><span>${esc(t.type.slice(0,1))}</span><small>${esc(t.due)}</small></div><div class="task-user"><div class="task-user-head"><div class="mini-avatar">${esc(c.name.slice(0,1))}</div><div><h3>${esc(c.name)} ${stagePill(t.funnel)}</h3><p>${esc(u.age_band)} · ${esc(u.occupation)} · ${esc(c.city)}</p></div><div class="score-pair"><span>意向 <b>${u.intention_score}</b></span><span>转化可能 <b>${u.conversion_probability}%</b></span><small>判断置信 ${u.confidence}%</small></div></div><div class="task-persona-strip"><span>${esc(u.personality)}</span><span>${esc(u.decision_style)}</span><span>适合：${esc(u.available_time)}</span><span>话题：${esc(u.non_health_topics.slice(0,2).join(' / '))}</span></div></div><div class="task-plan"><div><span>触发原因</span><p>${esc(t.reason)}</p></div><div><span>本次目标</span><p>${esc(t.objective)}</p></div><div><span>推荐切入</span><p>${esc(t.touch_angle)}</p></div><div><span>前次触达</span><p>${esc(t.previous_touch)}</p></div><div class="optimization-hint"><span>昨日复盘应用</span><p>${esc(t.optimization_hint)}</p></div></div><div class="task-actions"><span>${esc(c.consent)}</span>${t.status==='done'?'<b class="done-label">已完成</b>':`<button class="secondary-button" onclick="openTaskDetail('${t.id}')">查看判断</button><button class="primary-button" onclick="closeDrawer();navigate(&#39;scripts&#39;)">生成本次话术</button><button class="text-button" onclick="completeTask('${t.id}')">直接完成</button>`}</div></article>`}
function filterTasks(category){renderTasks(category)}
async function openTaskDetail(id){const t=await api(`/api/v1/private/tasks/${id}`),c=t.customer,u=c.persona;showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">${esc(t.type)}</p><h3>${esc(c.name)} · ${esc(t.funnel)}</h3><p>${esc(t.reason)} · ${esc(t.due)}</p></div><div class="drawer-body"><section class="task-detail-objective"><span>本次目标</span><h3>${esc(t.objective)}</h3><p>${esc(t.touch_angle)}</p></section><div class="detail-metrics">${detailMetric('意向度',u.intention_score+'/100')}${detailMetric('转化可能',u.conversion_probability+'%')}${detailMetric('判断置信',u.confidence+'%')}${detailMetric('触达授权',c.consent)}</div><section class="detail-section"><h4>跨场景用户描述</h4><p>${esc(u.age_band)} · ${esc(u.gender)} · ${esc(u.occupation)} · ${esc(u.life_stage)}</p><p>${esc(u.personality)}；${esc(u.decision_style)}；偏好${esc(u.content_preference)}。</p><div class="context-tags">${u.non_health_topics.map(x=>`<span>${esc(x)}</span>`).join('')}</div><p class="inference-note">以上包含行为推断，置信度 ${u.confidence}%。应在自然对话中验证，不得作为确定事实告诉用户。</p></section><section class="detail-section"><h4>前一日复盘如何应用</h4><div class="optimization-callout">${esc(t.optimization_hint)}</div><p>${esc(t.previous_touch)}</p></section><section class="detail-section"><h4>任务生成依据</h4><ul class="guardrail-list"><li>${esc(t.reason)}</li><li>${esc(c.ai_profile.evidence.map(x=>x.label).join('；'))}</li><li>公共事件只使用中性、公开且与所在地匹配的信息，不判断用户政治立场。</li></ul></section><button class="primary-button full" onclick="closeDrawer();navigate(&#39;scripts&#39;)">打开话术中心生成个性化话术</button></div>`)}
async function refreshTouchOptimization(){const data=await api('/api/v1/private/tasks/optimization/refresh',{method:'POST',body:'{}'});toast(`已生成 ${data.version}，将继续结合今日结果优化`);renderTasks()}
async function completeTask(id){await api(`/api/v1/private/tasks/${id}/status`,{method:'POST',body:JSON.stringify({status:'done'})});toast('任务已完成，并进入下一次复盘');renderTasks()}

function initialPage(){const page=new URLSearchParams(location.search).get('page');return ['workbench','assets','tasks','scripts','outreach','juzi-workbench','script-templates','governance'].includes(page)?page:/^\/script-studio\/?$/.test(location.pathname)?'scripts':'workbench'}
function outreachSnapshotParams(){return new URLSearchParams({page:state.outreachContactPage,limit:10,q:state.outreachContactQuery,reply:state.outreachContactReply,tag:state.outreachTagQuery,tag_mode:state.outreachTagMode,exclude_tag:state.outreachExcludeTag,bot_id:state.outreachBotId,task_page:state.outreachTaskPage,task_limit:5,task_q:state.outreachTaskQuery,task_status:state.outreachTaskStatus})}
function loadOutreachSnapshot(){return studioApi(`/outreach?${outreachSnapshotParams().toString()}`)}
function outreachVisibleTasks(data=state.outreachData){
  const map=new Map();
  for(const key of ['tasks','today_tasks','contact_tasks','queued_tasks']){
    for(const task of data?.[key]||[])map.set(task.id,task);
  }
  return [...map.values()];
}
async function renderOutreach(){
  setHeader('用户触达','用户触达 / 小蟹 AI 与句子互动');
  state.outreachTaskSelectionAll=false;
  const version=navigationVersion;
  try{
    const account=await ensureOutreachAccount();
    if(version!==navigationVersion)return;
    if(account==='setup'){stopOutreachHistoryAutoSync();$('#main-content').innerHTML=outreachSetupForm();$('#outreach-setup-form').addEventListener('submit',event=>submitOutreachLogin(event,'setup'));return}
    if(account==='login'){stopOutreachHistoryAutoSync();$('#main-content').innerHTML=outreachLoginForm();$('#outreach-login-form').addEventListener('submit',event=>submitOutreachLogin(event,'login'));return}
    if(state.outreachUser?.role!=='admin'){stopOutreachHistoryAutoSync();$('#main-content').innerHTML='<div class="empty-card">当前账号没有用户触达权限，仅管理员可以执行主动触达。</div>';return}
    const [data,users]=await Promise.all([loadOutreachSnapshot(),studioApi('/users')]);
    if(version!==navigationVersion)return;
    state.outreachData=data;
    state.outreachUsers=users.items||[];
    startOutreachHistoryAutoSync();
    if(state.outreachJob&&['pending','running'].includes(state.outreachJob.status)&&!outreachJobTimer){
      startOutreachJobPolling(state.outreachJob.job_id,state.outreachJobContactId);
    }
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
    stopOutreachHistoryAutoSync();
    state.outreachError=error.message;
    renderOutreachWorkspace(state.outreachData);
  }
}
async function studioApi(path,options={}){
  const requestedPage=state.page;
  const response=await fetch('/api/studio'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(state.outreachCsrf?{'X-Studio-CSRF':state.outreachCsrf}:{}) ,...(options.headers||{})}});
  const result=await response.json().catch(()=>({success:false,error:{message:response.status===504?'请求超时，请稍后重试':response.status===502?'服务暂时异常，请稍后重试':'响应格式错误'}}));
  if(pageLeftSince(requestedPage))throw new DOMException('页面已切换','AbortError');
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
  const counts=data.counts,tasks=outreachVisibleTasks(data),queuedTasks=data.queued_tasks||tasks.filter(t=>t.status==='queued'),contacts=data.contacts||[],bots=data.bots||[],messages=data.messages||[],updates=data.profile_updates||[],templates=data.templates||[];
  const pagination=data.contact_pagination||{page:1,pages:1,total:0,total_contacts:0,start_index:0,end_index:0,query:'',reply_filter:'all'};
  const tagSummary=data.tag_summary||{distinct_tags:0,top:[],related:[]};
  const todayTasks=data.today_tasks||tasks.filter(t=>t.plan_day===data.plan_day);
  const taskPagination=data.task_pagination||{page:1,limit:5,total:todayTasks.length,pages:1,start_index:0,end_index:todayTasks.length,query:'',status_filter:'all'};
  const unsentTodayCount=counts.unsentToday??todayTasks.filter(t=>['draft','queued'].includes(t.status)).length;
  $('#main-content').innerHTML=`<section class="outreach-workspace">
    <header><div><span>OUTREACH CONTROL</span><h3>真实客户每日主动触达</h3><p>以句子互动同步的真实客户为主体，先同步标签、备注和 30 天对话，再生成一客一策；本板块每 30 秒自动同步真实对话，发送前必须人工确认。</p></div><div class="outreach-header-actions"><button class="secondary-button" type="button" data-action="outreach-refresh" onclick="refreshOutreachCache()">刷新缓存</button><button class="secondary-button" type="button" data-action="outreach-sync" onclick="syncOutreachContacts()">同步客户</button><button class="secondary-button" type="button" data-action="outreach-history" onclick="syncOutreachHistory()">同步真实对话（30 秒一次）</button><button class="primary-button" type="button" data-action="outreach-generate" onclick="refreshOutreachStrategies(true)">生成全量策略</button></div></header>
    <div class="outreach-summary-grid">${outreachSummary('句子互动',data.configured?'已连接':'待配置',data.configured?'客户与发送 API 已连接':'请联系管理员配置')}${outreachSummary('策略模型',data.model_configured?'已接入':'未配置',data.model_configured?'策略与推荐回复共用配置':'请联系管理员配置')}${outreachSummary('真实客户',counts.contacts,'手机号仅保留后四位')}${outreachSummary('已回复',counts.replied,'回复用户置顶展示')}${outreachSummary('今日触达',counts.today,'含模板和一客一策')}${outreachSummary('已发送',counts.sentToday,'人工确认后提交上游')}</div>
    ${state.outreachError?`<div class="outreach-alert">${esc(state.outreachError)}</div>`:''}
    ${state.outreachNotice?`<div class="outreach-notice">${esc(state.outreachNotice)}</div>`:''}
    ${outreachJobProgressHtml(state.outreachJob)}
    ${outreachTemplatePanel(data)}
    ${outreachAccountSummaryPanel(data)}
    <section class="outreach-panel"><header><div><h4>真实客户 · 标签 · 画像</h4><p>点击“打开对话”查看该客户独立对话框；可对单人重新生成触达策略。</p></div><span class="outreach-count-pill">${pagination.total_contacts} 位已同步 · 当前 ${pagination.start_index}-${pagination.end_index} / ${pagination.total}</span></header><form class="outreach-contact-controls" data-action="outreach-search" onsubmit="submitOutreachContactSearch(event)"><div class="outreach-contact-search"><input id="outreach-contact-query" value="${esc(pagination.query||state.outreachContactQuery)}" maxlength="80" placeholder="搜索昵称、尾号、标签、备注、归属"><button class="primary-button" type="submit">搜索</button></div><div class="outreach-contact-filters"><button type="button" class="secondary-button ${pagination.reply_filter==='all'?'active':''}" onclick="setOutreachContactReply('all')">全部</button><button type="button" class="secondary-button ${pagination.reply_filter==='replied'?'active':''}" onclick="setOutreachContactReply('replied')">已回复</button><button type="button" class="secondary-button ${pagination.reply_filter==='unread'?'active':''}" onclick="setOutreachContactReply('unread')">未回复</button>${outreachAccountFilterControl(bots)}</div></form>
    <section class="outreach-tag-filter" aria-label="标签人群筛选">
      <form class="outreach-tag-filter-form" onsubmit="submitOutreachTagFilter(event)">
        <label class="form-label">标签关键词<input id="outreach-tag-query" value="${esc(state.outreachTagQuery)}" maxlength="200" placeholder="输入“全量”代表全部客户，或 NMN、复购"></label>
        <label class="form-label">匹配方式<select id="outreach-tag-mode" onchange="setOutreachTagMode(this.value)"><option value="contains" ${state.outreachTagMode==='contains'?'selected':''}>包含任一关键词</option><option value="and" ${state.outreachTagMode==='and'?'selected':''}>同时满足</option><option value="or" ${state.outreachTagMode==='or'?'selected':''}>任一完整标签</option></select></label>
        <label class="form-label">排除标签<input id="outreach-exclude-tag" value="${esc(state.outreachExcludeTag)}" maxlength="200" placeholder="例如：已退订、投诉"></label>
        <label class="form-label">策略方向<input id="outreach-strategy-direction" list="outreach-strategy-directions" value="${esc(state.outreachStrategyDirection==='auto'?'':state.outreachStrategyDirection)}" maxlength="40" placeholder="可自由输入，留空则 AI 自动推荐" oninput="setOutreachStrategyDirection(this.value)"><datalist id="outreach-strategy-directions"><option value="老客关怀"></option><option value="双11活动"></option><option value="复购提醒"></option><option value="新品介绍"></option><option value="售后关怀"></option><option value="节日问候"></option><option value="会员权益"></option><option value="睡眠精力关怀"></option></datalist></label>
        <div class="outreach-tag-filter-actions"><button class="primary-button" type="submit">按标签筛选</button><button class="secondary-button" type="button" onclick="clearOutreachTagFilter()">清除标签筛选</button><button class="primary-button" type="button" onclick="generateOutreachTagStrategies()">一键生成筛选人群策略</button></div>
      </form>
      <div class="outreach-tag-summary"><strong>${pagination.total} 位匹配 · ${tagSummary.distinct_tags||0} 个标签</strong>${tagSummary.related?.length?`<div class="outreach-related-tags">${tagSummary.related.map(item=>`<button type="button" onclick="${isOutreachAllTagQuery(state.outreachTagQuery)?`addOutreachExcludedTag('${encodeURIComponent(item.name)}')`:`applyOutreachRelatedTag('${encodeURIComponent(item.name)}')`}">${esc(item.name)} · ${item.count}${isOutreachAllTagQuery(state.outreachTagQuery)?' · 排除':''}</button>`).join('')}</div>`:'<small>输入关键词后会推荐相关标签；“全量”模式会推荐可排除标签。</small>'}<small>同一客户 3 天内已有待发送或已发送触达时，生成策略会自动跳过。</small></div>
    </section>
    <div class="outreach-contact-list">${contacts.length?contacts.map(outreachContactRow).join(''):'<div class="empty-card">当前筛选没有客户，可调整搜索或筛选条件。</div>'}</div><div class="outreach-pagination"><button class="secondary-button" type="button" onclick="changeOutreachContactPage(-1)" ${pagination.page<=1?'disabled':''}>上一页</button><span>第 ${pagination.page} / ${pagination.pages} 页</span><button class="secondary-button" type="button" onclick="changeOutreachContactPage(1)" ${pagination.page>=pagination.pages?'disabled':''}>下一页</button></div></section>
    <section class="outreach-panel"><header><div><h4>今日一客一策</h4><p>每个策略来自真实客户标签、备注、画像和聊天历史，包含开口话术、下一步和暂停规则。</p></div><div class="outreach-header-actions"><span class="outreach-count-pill">第 ${taskPagination.start_index}-${taskPagination.end_index} / ${taskPagination.total} 条</span><button class="danger-button" type="button" onclick="clearTodayOutreachStrategies()" ${unsentTodayCount?'':'disabled'}>一键删除今日未发送策略</button></div></header><form class="outreach-task-bulk" data-action="outreach-bulk"><div class="outreach-task-scope-controls" role="radiogroup" aria-label="批量入队范围"><label class="outreach-task-select-all"><input type="radio" id="outreach-task-select-all" name="outreach-task-scope" checked onchange="setOutreachTaskSelectionScope('page')" ${todayTasks.some(task=>task.status==='draft')?'':'disabled'}><span>全选本页可入队策略</span></label><label class="outreach-task-select-all"><input type="radio" id="outreach-task-select-today" name="outreach-task-scope" onchange="setOutreachTaskSelectionScope('today')" ${counts.draftToday?'':'disabled'}><span>全选今日所有可入队策略（${counts.draftToday} 条）</span></label></div><span class="outreach-task-selected-count" id="outreach-task-selected-count">已选 0 条</span><button class="primary-button" type="button" id="outreach-batch-queue-button" onclick="queueSelectedOutreachTasks()" disabled>一键保存并加入队列</button></form><form class="outreach-task-controls" data-action="outreach-task-search" onsubmit="submitOutreachTaskSearch(event)"><div class="outreach-contact-search"><input id="outreach-task-query" value="${esc(taskPagination.query||state.outreachTaskQuery)}" maxlength="80" placeholder="搜索客户、话术、状态、理由、托管账号"><button class="primary-button" type="submit">搜索策略</button></div><div class="outreach-contact-filters"><button type="button" class="secondary-button ${taskPagination.status_filter==='all'?'active':''}" onclick="setOutreachTaskStatus('all')">全部</button><button type="button" class="secondary-button ${taskPagination.status_filter==='sent'?'active':''}" onclick="setOutreachTaskStatus('sent')">已发送</button><button type="button" class="secondary-button ${taskPagination.status_filter==='unsent'?'active':''}" onclick="setOutreachTaskStatus('unsent')">未发送</button></div></form><div class="outreach-task-list">${todayTasks.length?todayTasks.map(task=>outreachTaskCard(task,true)).join(''):'<div class="empty-card">今日暂无匹配策略。可调整状态筛选，或重新生成。</div>'}</div><div class="outreach-pagination"><button class="secondary-button" type="button" onclick="changeOutreachTaskPage(-1)" ${taskPagination.page<=1?'disabled':''}>上一页</button><span>第 ${taskPagination.page} / ${taskPagination.pages} 页 · 每页 5 条</span><button class="secondary-button" type="button" onclick="changeOutreachTaskPage(1)" ${taskPagination.page>=taskPagination.pages?'disabled':''}>下一页</button></div></section>
    <section class="outreach-panel"><header><h4>执行队列</h4><p>仅管理员可入队和发送；发送前系统弹出完整内容二次确认。</p></header><div class="outreach-queue-list">${queuedTasks.map(outreachQueueCard).join('')||'<div class="empty-card">队列暂无待发送任务。</div>'}${outreachBatchControls(queuedTasks)}</div></section>
    <details class="outreach-panel outreach-archive"><summary><span>30 天真实消息留档</span><strong>${messages.length} 条</strong><small>仅管理员可查看，默认折叠</small></summary><div class="outreach-message-archive">${messages.length?messages.map(outreachMessageRow).join(''):'<div class="empty-card">暂无留档，请先同步真实对话。</div>'}</div></details>
    <details class="outreach-panel outreach-archive"><summary><span>画像更新建议</span><strong>${updates.length} 条</strong><small>客户回复后自动沉淀，由管理员复核后再用于下一轮策略。</small></summary><div class="outreach-profile-updates">${updates.length?updates.map(outreachProfileRow).join(''):'<div class="empty-card">暂无画像更新建议。</div>'}</div></details>
    <section class="outreach-panel"><header><h4>托管账号归属</h4><p>可选配置：给句子互动托管账号绑定营养师归属，便于按顾问筛选和跟进。</p></header><div class="outreach-bot-list">${bots.length?bots.map(bot=>`<article><strong>${esc(bot.bot_name)}</strong><span>${esc(bot.im_bot_id)}</span><select data-bot="${esc(bot.im_bot_id)}">${outreachUserOptions(state.outreachUsers,bot.owner_user_id)}</select></article>`).join(''):'<div class="empty-card">尚未同步托管账号。</div>'}</div></section>
  </section>`;
}
function outreachSummary(label,value,note){return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`}
function outreachAccountFilterControl(bots){
  return `<label class="outreach-account-filter"><span>托管账号</span><select onchange="setOutreachBot(this.value)"><option value="">全部账号</option>${bots.map(bot=>`<option value="${esc(bot.im_bot_id)}" ${bot.im_bot_id===state.outreachBotId?'selected':''}>${esc(bot.bot_name||bot.im_bot_id)}</option>`).join('')}</select></label>`;
}
function outreachAccountSummaryPanel(data){
  const bots=data.bots||[],summaries=data.account_summary||[];
  if(!bots.length)return '';
  return `<section class="outreach-panel outreach-account-panel"><header><div><h4>托管账号客户分类</h4><p>按句子互动账号查看客户分布；筛选某个账号后，标签策略生成也只处理该账号客户。</p></div><button class="secondary-button" type="button" onclick="setOutreachBot('')">清除账号筛选</button></header><div class="outreach-account-summary-grid">${bots.map(bot=>{
    const summary=summaries.find(item=>item.im_bot_id===bot.im_bot_id)||{total:0,anti_aging:0,daily_nutrition:0,replied:0,today_tasks:0,queued:0,sent_today:0};
    const active=state.outreachBotId===bot.im_bot_id;
    return `<article class="${active?'active':''}"><div><strong>${esc(bot.bot_name||bot.im_bot_id)}</strong><span>${esc(bot.owner_name||'未绑定营养师')} · ${esc(bot.im_bot_id)}</span></div><dl><div><dt>客户</dt><dd>${summary.total||0}</dd></div><div><dt>抗衰</dt><dd>${summary.anti_aging||0}</dd></div><div><dt>日常营养</dt><dd>${summary.daily_nutrition||0}</dd></div><div><dt>已回复</dt><dd>${summary.replied||0}</dd></div><div><dt>今日策略</dt><dd>${summary.today_tasks||0}</dd></div><div><dt>待发送</dt><dd>${summary.queued||0}</dd></div><div><dt>已发送</dt><dd>${summary.sent_today||0}</dd></div></dl><footer><button class="secondary-button" type="button" onclick="setOutreachBot('${esc(bot.im_bot_id)}')">${active?'查看当前筛选':'筛选该账号'}</button></footer></article>`;
  }).join('')}</div></section>`;
}
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
function outreachProfileSummary(contact){if(contact.initial_profile?.summary)return contact.initial_profile.summary;const profile=outreachProfile(contact);if(profile.should_pause)return '已按客户反馈暂停主动触达';const signals=Array.isArray(profile.conversation_signals)?profile.conversation_signals:[];const focus=profile.suggested_followup_focus||'暂未沉淀跟进重点';return signals.length?`${signals.slice(-3).join('、')} · ${focus}`:`暂未沉淀画像信号 · ${focus}`}
function outreachInitialProfileGrid(contact){
  const profile=contact.initial_profile;
  if(!profile)return '';
  const intent=({high:'较高',medium:'中等',low:'待确认'}[profile.intent]||profile.intent);
  const activity=({high:'较敏感',medium:'可能关注',low:'暂未识别'}[profile.activity_sensitivity]||profile.activity_sensitivity);
  const risk=profile.risk==='high'?'需先处理服务或沟通风险':'正常';
  return `<div class="outreach-profile-grid">${outreachProfilePill('人群',profile.audience_label||'待确认')}${outreachProfilePill('生命周期',profile.lifecycle||'待确认')}${outreachProfilePill('意向',intent)}${outreachProfilePill('活动敏感度',activity)}${outreachProfilePill('风险',risk)}</div>${profile.evidence?.length?`<small>依据：${profile.evidence.map(esc).join('；')}</small>`:'<small>暂无画像依据</small>'}`;
}
function outreachProfilePill(label,value){return `<span><b>${esc(label)}</b><strong>${esc(value)}</strong></span>`}
function outreachContactRow(contact){const local=contact.local_customer_id||'';const contactTasks=outreachVisibleTasks().filter(task=>task.contact_id===contact.id&&task.plan_day===state.outreachData?.plan_day);const strategy=contactTasks[0];return `<article><div><strong>${esc(contact.display_name)}</strong><span>尾号 ${esc(contact.phone_suffix||'—')} · ${esc(contact.owner_name||contact.bot_name||'未设置归属')}</span></div><div class="outreach-contact-reply ${contact.replied?'replied':''}"><strong>${contact.replied?'已回复':'未回复'}</strong><span>${contact.last_reply_at?`最近回复 ${esc(fmtDate(contact.last_reply_at))}`:'暂无回复记录'}</span><button class="secondary-button" type="button" onclick="toggleOutreachReplyStatus('${esc(contact.id)}')">${contact.reply_status_override===0?'人工纠正':'恢复自动'}</button></div><div class="outreach-tag-list">${(contact.tags||'').split('、').filter(Boolean).map(tag=>`<span>${esc(tag)}</span>`).join('')||'<span>无标签</span>'}</div>${contact.remark?`<small>${esc(contact.remark)}</small>`:''}<small class="outreach-profile-line">${esc(outreachProfileSummary(contact))}</small><div class="outreach-contact-actions"><span class="tag ${strategy?.status==='sent'?'green':strategy?'blue':''}">${strategy?`今日${esc(strategy.status==='sent'?'已发送':strategy.status==='queued'?'待发送':strategy.status==='paused'?'已暂停':'已生成')}`:'今日未生成'}</span><button class="secondary-button" type="button" onclick="openOutreachContact('${esc(contact.id)}')">打开对话</button><button class="primary-button" type="button" onclick="generateOutreachStrategyForContact('${esc(contact.id)}')">${strategy?'重新生成':'生成一客一策'}</button><select data-contact="${esc(contact.id)}"><option value="">补充本地档案</option>${(state.outreachData?.local_customers||[]).map(c=>`<option value="${esc(c.id)}" ${c.id===local?'selected':''}>${esc(c.display_name)} · ${esc(c.phone_suffix)}</option>`).join('')}</select></div></article>`}
function outreachTaskCard(task,selectable=false){const queued=task.status==='queued',sent=task.status==='sent',paused=task.status==='paused',editable=queued||task.status==='draft';const contact=(state.outreachData?.contacts||[]).find(item=>item.id===task.contact_id);const phone=task.phone_suffix||contact?.phone_suffix||'—';const select=selectable?`<label class="outreach-task-select"><input type="checkbox" data-task-select="${esc(task.id)}" onchange="handleOutreachTaskSelectionChange()" ${task.status==='draft'?'':'disabled'}><span>选择</span></label>`:'';return `<article class="outreach-task-card ${task.priority}"><header><div>${select}<div><strong>${esc(task.contact_name||task.customer_name||'客户')}</strong><span>尾号 ${esc(phone)} · ${esc(strategyName(task.strategy_type))} · ${esc(task.audience||'')} · ${esc(task.source==='template'?'固定模板':task.source==='reply'?'回复跟进':'一客一策')}</span></div></div><span>${esc(task.status)}</span></header>${editable?`<label class="form-label">触达内容<textarea class="outreach-task-editor" data-task="${esc(task.id)}" rows="4" maxlength="600">${esc(task.recommended_message)}</textarea></label><button class="secondary-button" type="button" onclick="updateOutreachTaskMessage('${esc(task.id)}')">保存修改内容</button>`:`<p>${esc(task.recommended_message)}</p>`}<dl><div><dt>触达理由</dt><dd>${esc(task.reason)}</dd></div><div><dt>下一步</dt><dd>${esc(task.next_action)}</dd></div><div><dt>暂停规则</dt><dd>${esc(task.stop_rule)}</dd></div><div><dt>画像沉淀</dt><dd>${esc(profileUpdateText(task.profile_updates))}</dd></div></dl><footer>${task.status==='draft'?`<button class="primary-button" type="button" data-action="outreach-queue" onclick="queueOutreachTask('${esc(task.id)}')">保存并加入队列</button>`:''}${queued?`<button class="primary-button" type="button" data-action="outreach-send" onclick="confirmOutreachSend('${esc(task.id)}')">保存并发送</button>`:''}${editable?`<button class="danger-button" type="button" onclick="deleteOutreachTask('${esc(task.id)}')">删除</button>`:''}${paused?'<span class="tag red">已暂停</span>':''}${sent?'<span class="tag green">已发送</span>':''}</footer></article>`}
function strategyName(type){return ({care:'关怀',repurchase_notice:'复购通知',education:'教育',activity:'活动',service:'服务',boundary_check:'边界确认'}[type]||'关怀')}
function profileUpdateText(value){try{const data=JSON.parse(value||'{}');return [data.observed_signal,data.next_focus].filter(Boolean).join(' / ')||'暂无'}catch{return '暂无'}}
function outreachQueueCard(task){return `<article><div><strong>${esc(task.contact_name||task.customer_name||'客户')}</strong><span>${esc(task.bot_name||'')} · 待人工确认</span></div><p>${esc(task.recommended_message)}</p><footer><button class="primary-button" type="button" data-action="outreach-send" onclick="confirmOutreachSend('${esc(task.id)}')">确认发送</button><button class="danger-button" type="button" onclick="deleteOutreachTask('${esc(task.id)}')">删除</button></footer></article>`}
function outreachMessageRow(item){return `<article><div><strong>${esc(item.contact_name||'客户')}</strong><span>${esc(item.direction==='inbound'?'客户回复':'系统发送')} · ${esc(item.status)}</span></div><p>${esc(item.content)}</p><time>${fmtDate(item.created_at)}</time></article>`}
function outreachProfileRow(item){return `<article><div><strong>${esc(item.contact_name||'客户')}</strong><span>${esc(item.created_at?fmtDate(item.created_at):'')}</span></div><p>${esc(item.updates_json||'暂无建议')}</p></article>`}
function submitOutreachContactSearch(event){event.preventDefault();const input=$('#outreach-contact-query');state.outreachContactQuery=(input?.value||'').trim();state.outreachContactPage=1;renderOutreach()}
function submitOutreachTaskSearch(event){event.preventDefault();const input=$('#outreach-task-query');state.outreachTaskQuery=(input?.value||'').trim();state.outreachTaskPage=1;renderOutreach()}
function submitOutreachTagFilter(event){event.preventDefault();state.outreachTagQuery=($('#outreach-tag-query')?.value||'').trim();state.outreachTagMode=$('#outreach-tag-mode')?.value||state.outreachTagMode;state.outreachExcludeTag=($('#outreach-exclude-tag')?.value||'').trim();state.outreachContactPage=1;renderOutreach()}
function setOutreachTagMode(mode){state.outreachTagMode=['contains','and','or'].includes(mode)?mode:'contains';state.outreachContactPage=1;renderOutreach()}
function clearOutreachTagFilter(){state.outreachTagQuery='';state.outreachTagMode='contains';state.outreachExcludeTag='';state.outreachContactPage=1;renderOutreach()}
function normalizeOutreachStrategyDirection(direction){const value=String(direction||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,40);return value&&value!=='AI自动推荐'?value:'auto'}
function setOutreachStrategyDirection(direction){state.outreachStrategyDirection=normalizeOutreachStrategyDirection(direction)}
function isOutreachAllTagQuery(value){const term=String(value||'').trim().toLowerCase();return term==='全量'||term==='全部'||term==='all'}
function applyOutreachRelatedTag(tag){if(!tag)return;state.outreachTagQuery=decodeURIComponent(String(tag));state.outreachContactPage=1;renderOutreach()}
function addOutreachExcludedTag(tag){
  const value=decodeURIComponent(String(tag||'')).trim();
  if(!value)return;
  const terms=String(state.outreachExcludeTag||'').split(/[,，、;；\s]+/).map(item=>item.trim()).filter(Boolean);
  if(terms.some(item=>item.toLowerCase()===value.toLowerCase()))return toast('该标签已在排除列表中');
  state.outreachExcludeTag=[...terms,value].slice(0,10).join('、');
  const input=$('#outreach-exclude-tag');
  if(input)input.value=state.outreachExcludeTag;
  state.outreachContactPage=1;
  renderOutreach();
}
function setOutreachContactReply(reply){state.outreachContactReply=reply;state.outreachContactPage=1;renderOutreach()}
function setOutreachBot(botId){state.outreachBotId=String(botId||'');state.outreachContactPage=1;renderOutreach()}
function setOutreachTaskStatus(status){state.outreachTaskStatus=['all','sent','unsent'].includes(status)?status:'all';state.outreachTaskPage=1;renderOutreach()}
function changeOutreachContactPage(delta){const pagination=state.outreachData?.contact_pagination;if(!pagination)return;const next=(pagination.page||1)+Number(delta);if(next<1||next>pagination.pages)return;state.outreachContactPage=next;renderOutreach()}
function changeOutreachTaskPage(delta){const pagination=state.outreachData?.task_pagination;if(!pagination)return;const next=(pagination.page||1)+Number(delta);if(next<1||next>pagination.pages)return;state.outreachTaskPage=next;renderOutreach()}
async function syncOutreachContacts(){if(state.outreachPending)return;state.outreachPending=true;toast('正在同步句子互动客户…');try{await studioApi('/outreach/sync',{method:'POST',body:'{}'});state.outreachAutoStarted=false;await renderOutreach();toast('客户同步完成')}catch(error){toast(error.message)}finally{state.outreachPending=false}}
async function refreshOutreachCache(contactId=''){if(state.outreachPending)return;state.outreachPending=true;try{await renderOutreach();if(contactId)openOutreachContact(contactId);toast('已刷新已同步数据')}catch(error){toast(error.message)}finally{state.outreachPending=false}}
function outreachInputKey(element){
  return element.id||element.dataset.taskSelect||element.name||'';
}
function snapshotOutreachInputs(){
  return $$('#main-content input, #main-content textarea, #main-content select')
    .filter(element=>outreachInputKey(element))
    .map(element=>({key:outreachInputKey(element),value:element.value,checked:element.checked}));
}
function restoreOutreachInputs(snapshot){
  for(const item of snapshot){
    const element=$(`#main-content [name="${CSS.escape(item.key)}"], #main-content [data-task-select="${CSS.escape(item.key)}"], #main-content #${CSS.escape(item.key)}`);
    if(element){element.value=item.value;element.checked=item.checked}
  }
}
async function syncOutreachHistory({automatic=false}={}){
  if(state.outreachPending)return;
  if(automatic&&document.activeElement&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  state.outreachPending=true;
  if(!automatic){
    state.outreachError='正在同步句子互动 30 天真实对话…';
    state.outreachNotice='';
    renderOutreachWorkspace(state.outreachData);
  }
  try{
    const result=await studioApi('/outreach/messages/sync',{method:'POST',body:'{}'});
    state.outreachError='';
    state.outreachNotice='';
    if(automatic){
      if(Number(result.inserted||0)>0){
        const snapshot=snapshotOutreachInputs();
        const data=await loadOutreachSnapshot();
        if(state.page!=='outreach')return;
        state.outreachData=data;
        renderOutreachWorkspace(data);
        restoreOutreachInputs(snapshot);
      }
    }else{
      await renderOutreach();
      stopOutreachHistoryAutoSync();
      startOutreachHistoryAutoSync();
      toast(`真实对话同步完成：新增 ${result.inserted||0} 条`);
    }
  }catch(error){
    if(error.name==='AbortError')return;
    if(error.code==='RATE_LIMIT'){
      state.outreachError='';
      state.outreachNotice='真实对话同步间隔未到，当前展示最近一次同步的数据。';
      if(!automatic)toast('同步间隔未到，已展示最近同步数据');
      if(automatic)return;
    }else{
      state.outreachError=automatic?'':error.message;
      state.outreachNotice=automatic?`真实对话自动同步失败：${error.message}`:'';
      if(!automatic)toast(error.message);
    }
    if(state.page==='outreach'){
      const snapshot=snapshotOutreachInputs();
      renderOutreachWorkspace(state.outreachData);
      restoreOutreachInputs(snapshot);
    }
  }finally{
    state.outreachPending=false;
  }
}
async function refreshOutreachStrategies(refresh){
  await startOutreachStrategyJob({
    refresh:refresh===true,limit:2000,direction:state.outreachStrategyDirection,
    bot_id:state.outreachBotId
  },{label:refresh?'全量策略':'今日策略'});
}
async function generateOutreachTagStrategies(){
  const tag=($('#outreach-tag-query')?.value||state.outreachTagQuery||'').trim();
  if(!tag)return toast('请先填写标签关键词');
  state.outreachTagQuery=tag;
  state.outreachTagMode=$('#outreach-tag-mode')?.value||state.outreachTagMode;
  state.outreachExcludeTag=($('#outreach-exclude-tag')?.value||'').trim();
  state.outreachStrategyDirection=normalizeOutreachStrategyDirection($('#outreach-strategy-direction')?.value||state.outreachStrategyDirection);
  state.outreachContactPage=1;
  await startOutreachStrategyJob({
    tag,tag_mode:state.outreachTagMode,exclude_tag:state.outreachExcludeTag,bot_id:state.outreachBotId,
    direction:state.outreachStrategyDirection,refresh:false,limit:2000
  },{label:'标签人群策略'});
}
async function generateOutreachStrategyForContact(id){
  const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);
  state.outreachStrategyDirection=normalizeOutreachStrategyDirection($('#outreach-strategy-direction')?.value||state.outreachStrategyDirection);
  await startOutreachStrategyJob({contact_id:id,direction:state.outreachStrategyDirection},
    {label:contact?.display_name||'一客一策',contactId:id});
}
function outreachJobProgressHtml(job){
  if(!job||['completed','partial','failed'].includes(job.status))return '';
  const total=Number(job.total_count||0),done=Number(job.created_count||0);
  const percent=total?Math.max(2,Math.round(done/total*100)):8;
  const batchText=Number(job.batches_total||0)?`第 ${job.batches_completed||0}/${job.batches_total} 批`:null;
  const startedAt=Number(job.started_at||job.created_at||0);
  const elapsedMinutes=startedAt?Math.max(0,Math.floor((Date.now()-startedAt)/60000)):0;
  const elapsedText=elapsedMinutes?` · 已运行 ${elapsedMinutes} 分钟`:'';
  return `<section class="outreach-job-progress" id="outreach-job-progress" aria-live="polite">
    <header><strong>后台生成${job.tag?' · '+esc(job.tag):''}</strong><span>${esc(batchText||'正在准备批次')}</span></header>
    <div class="outreach-job-progress-track"><i style="width:${percent}%"></i></div>
    <p>已生成 ${done}/${total||'—'} 条${Number(job.failed_count||0)?` · 失败 ${job.failed_count}`:''}${esc(elapsedText)} · 大批量会分批返回，切换页面不会中断，回到本板块自动恢复进度。</p>
  </section>`;
}
function updateOutreachJobProgress(){
  const node=$('#outreach-job-progress');
  if(node)node.outerHTML=outreachJobProgressHtml(state.outreachJob);
}
async function startOutreachStrategyJob(body,{label='',contactId=''}={}){
  if(['pending','running'].includes(state.outreachJob?.status))return toast('已有策略任务在后台生成中');
  state.outreachError='';
  state.outreachNotice=`已发起${label||'触达策略'}后台生成，可继续查看其他内容。`;
  try{
    const job=await studioApi('/outreach/strategies/jobs',{method:'POST',body:JSON.stringify(body)});
    state.outreachJob=job;
    state.outreachJobContactId=contactId;
    if(state.page==='outreach'){
      renderOutreachWorkspace(state.outreachData);
      startOutreachJobPolling(job.job_id,contactId);
    }
  }catch(error){
    state.outreachError=error.message;state.outreachNotice='';
    if(state.page==='outreach')renderOutreachWorkspace(state.outreachData);
    toast(error.message);
  }
}
function startOutreachJobPolling(jobId,contactId=''){
  if(outreachJobTimer)clearTimeout(outreachJobTimer);
  const poll=async()=>{
    if(state.page!=='outreach'){outreachJobTimer=null;return}
    try{
      const job=await studioApi(`/outreach/strategies/jobs/${encodeURIComponent(jobId)}`);
      state.outreachJob=job;
      if(['completed','partial','failed'].includes(job.status)){
        outreachJobTimer=null;
        state.outreachJobContactId='';
        state.outreachNotice=job.status==='failed'
          ?(job.errors?.[0]?.message||'触达策略生成失败')
          :outreachJobCompletionMessage(job,contactId);
        state.outreachError=job.status==='failed'?state.outreachNotice:'';
        await renderOutreach();
        if(contactId)openOutreachContact(contactId);
        toast(state.outreachError||state.outreachNotice);
        return;
      }
      updateOutreachJobProgress();
      outreachJobTimer=setTimeout(poll,2000);
    }catch(error){
      if(state.page!=='outreach'){outreachJobTimer=null;return}
      outreachJobTimer=null;state.outreachError=error.message;state.outreachNotice='';
      renderOutreachWorkspace(state.outreachData);toast(error.message);
    }
  };
  outreachJobTimer=setTimeout(poll,1000);
}
function outreachJobCompletionMessage(job,contactId=''){
  const skipped=Number(job.skipped_count||0);
  if(contactId&&!Number(job.created_count||0)&&!Number(job.existing_count||0)){
    return skipped
      ?'未生成新策略：该客户已暂停触达、今日已有策略或 3 天内已触达，系统为避免打扰暂不重复生成。'
      :'未生成新策略，请稍后重试。';
  }
  return `触达策略生成完成：新增 ${job.created_count||0} 条，已有 ${job.existing_count||0} 条，失败 ${job.failed_count||0} 条${skipped?`，跳过 ${skipped} 条（避免重复打扰）`:''}。`;
}
function outreachReplySourceText(contact){
  if(contact.reply_status_override===1)return '人工标记';
  if(contact.reply_source==='message')return '真实消息';
  if(contact.reply_source==='profile')return '画像沉淀';
  return '';
}
function outreachChatMessages(messages,loadError=''){const items=[...messages].sort((a,b)=>a.created_at-b.created_at).slice(-100);if(!items.length)return `<div class="empty-card">${loadError?`真实对话加载失败：${esc(loadError)}`:'暂无 30 天内真实聊天记录。请先同步真实对话。'}</div>`;return `<div class="outreach-chat">${items.map(item=>`<article class="${item.direction==='inbound'?'inbound':'outbound'}"><p>${esc(item.content)}</p><time>${esc(fmtDate(item.created_at))} · ${esc(item.direction==='inbound'?'客户':'营养师')}</time></article>`).join('')}</div>`}
async function openOutreachContact(id){const contact=(state.outreachData?.contacts||[]).find(item=>item.id===id);if(!contact)return;let messages=(state.outreachData?.messages||[]).filter(item=>item.contact_id===id);let messageError='';try{const result=await studioApi(`/outreach/messages?contact_id=${encodeURIComponent(id)}`);messages=result.items||[]}catch(error){messageError=error.message}const tasks=outreachVisibleTasks().filter(task=>task.contact_id===id&&task.plan_day===state.outreachData?.plan_day);const profile=outreachProfile(contact);const replySource=outreachReplySourceText(contact);showDrawer(`<div class="drawer-header"><button class="drawer-close" onclick="closeDrawer()">×</button><p class="hero-kicker">真实客户对话</p><h3>${esc(contact.display_name)} · 尾号 ${esc(contact.phone_suffix||'—')}</h3><p>${esc(contact.bot_name||'')} · ${esc(contact.owner_name||'未设置归属')} · ${contact.replied?'<b class="reply-badge replied">已回复</b>':'<b class="reply-badge">未回复</b>'}${replySource?`<small>来源：${esc(replySource)}</small>`:''}</p></div><div class="drawer-body outreach-drawer"><section class="outreach-drawer-grid"><div><h4>句子互动标签</h4><div class="outreach-tag-list">${(contact.tags||'').split('、').filter(Boolean).map(tag=>`<span>${esc(tag)}</span>`).join('')||'<span>无标签</span>'}</div>${contact.remark?`<p>${esc(contact.remark)}</p>`:''}</div><div><h4>画像与回复</h4><p>${esc(outreachProfileSummary(contact))}</p>${contact.last_reply_at?`<small>最近回复：${esc(fmtDate(contact.last_reply_at))}${replySource?` · ${esc(replySource)}`:''}</small>`:'<small>暂无回复记录</small>'}<div class="outreach-inline-actions"><button class="secondary-button" type="button" onclick="toggleOutreachReplyStatus('${esc(id)}')">${contact.reply_status_override===0?'人工纠正回复状态':'恢复自动识别'}</button></div></div></section><section><h4>称呼确认</h4><div class="outreach-salutation-form"><input id="outreach-salutation-${esc(id)}" value="${esc(contact.confirmed_salutation||contact.salutation||outreachFallbackSalutation(contact))}" maxlength="30" placeholder="例如：张哥、徐姐、张老师"><button class="primary-button" type="button" onclick="saveOutreachSalutation('${esc(id)}')">保存称呼</button></div><small>人工确认后，固定模板和推荐回复会优先使用这个称呼。</small></section><section><h4>触达策略</h4>${tasks.length?tasks.map(outreachTaskCard).join(''):'<div class="empty-card">该客户今日暂无策略。</div>'}<button class="primary-button" type="button" onclick="generateOutreachStrategyForContact('${esc(id)}')">生成/重算一客一策</button></section><section><h4>真实对话框</h4>${outreachChatMessages(messages,messageError)}<div class="outreach-inline-actions"><button class="secondary-button" type="button" onclick="syncOutreachHistory()">同步最新对话</button><button class="primary-button" type="button" onclick="generateOutreachReply('${esc(id)}')">生成推荐回复</button></div></section></div>`)}
async function bindOutreachContact(id,customerId){try{await studioApi(`/outreach/contacts/${encodeURIComponent(id)}/bind`,{method:'PUT',body:JSON.stringify({local_customer_id:customerId})});toast(customerId?'客户绑定已更新':'已解除绑定');await renderOutreach()}catch(error){toast(error.message)}}
async function assignOutreachBot(id,userId){try{await studioApi(`/outreach/bots/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({owner_user_id:userId})});toast('托管账号归属已更新');await renderOutreach()}catch(error){toast(error.message)}}
async function saveOutreachTaskMessageFromEditor(id){
  const selector=`.outreach-task-editor[data-task="${CSS.escape(id)}"]`;
  const openDrawer=$('#drawer:not(.hidden)');
  const editor=(openDrawer&&openDrawer.querySelector(selector))||document.querySelector(selector);
  if(!editor)return null;
  const task=outreachVisibleTasks().find(item=>item.id===id);
  if(task&&task.recommended_message===editor.value)return task;
  const result=await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/message`,{method:'PUT',body:JSON.stringify({message:editor.value})});
  if(task)task.recommended_message=result.message||editor.value;
  return task;
}
async function queueOutreachTask(id){const task=outreachVisibleTasks().find(item=>item.id===id);const contactId=task?.contact_id;try{await saveOutreachTaskMessageFromEditor(id);await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/queue`,{method:'POST',body:'{}'});toast('已保存并加入执行队列');await renderOutreach();if(contactId)openOutreachContact(contactId)}catch(error){toast(error.message)}}
function outreachQueueableTaskBoxes(){
  return [...document.querySelectorAll('.outreach-workspace [data-task-select]')].filter(box=>!box.disabled);
}
function updateOutreachTaskSelection(){
  const boxes=outreachQueueableTaskBoxes();
  const selected=boxes.filter(box=>box.checked);
  const count=document.querySelector('#outreach-task-selected-count');
  const button=document.querySelector('#outreach-batch-queue-button');
  const pageScope=document.querySelector('#outreach-task-select-all');
  const todayScope=document.querySelector('#outreach-task-select-today');
  const todayCount=Number(state.outreachData?.counts?.draftToday||0);
  if(state.outreachTaskSelectionAll){
    if(count)count.textContent=`已选今日全部 ${todayCount} 条`;
    if(button&&!state.outreachPending)button.disabled=!todayCount;
    if(pageScope)pageScope.checked=false;
    if(todayScope)todayScope.checked=true;
    return;
  }
  if(count)count.textContent=`已选 ${selected.length} 条`;
  if(button&&!state.outreachPending)button.disabled=!selected.length;
  if(pageScope)pageScope.checked=boxes.length>0&&selected.length===boxes.length;
  if(todayScope)todayScope.checked=false;
}
function setOutreachTaskSelectionScope(scope){
  const boxes=outreachQueueableTaskBoxes();
  if(scope==='today'){
    state.outreachTaskSelectionAll=true;
    for(const box of boxes)box.checked=true;
  }else{
    state.outreachTaskSelectionAll=false;
    for(const box of boxes)box.checked=true;
  }
  updateOutreachTaskSelection();
}
function handleOutreachTaskSelectionChange(){
  const boxes=outreachQueueableTaskBoxes();
  if(state.outreachTaskSelectionAll&&boxes.some(box=>!box.checked)){
    state.outreachTaskSelectionAll=false;
    const pageScope=document.querySelector('#outreach-task-select-all');
    if(pageScope)pageScope.checked=true;
  }
  updateOutreachTaskSelection();
}
function toggleAllOutreachTasks(checked){
  if(checked)state.outreachTaskSelectionAll=false;
  for(const box of outreachQueueableTaskBoxes())box.checked=checked;
  updateOutreachTaskSelection();
}
async function saveOutreachTaskMessageFromWorkspace(id){
  const editor=document.querySelector(`.outreach-workspace .outreach-task-editor[data-task="${CSS.escape(id)}"]`);
  if(!editor)return null;
  const task=outreachVisibleTasks().find(item=>item.id===id);
  if(task&&task.recommended_message===editor.value)return task;
  const result=await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/message`,{method:'PUT',body:JSON.stringify({message:editor.value})});
  if(task)task.recommended_message=result.message||editor.value;
  return task;
}
async function queueSelectedOutreachTasks(){
  if(state.outreachPending)return;
  if(state.outreachTaskSelectionAll){
    const count=Number(state.outreachData?.counts?.draftToday||0);
    if(!count)return toast('今日没有可加入队列的草稿策略');
    const boxes=outreachQueueableTaskBoxes();
    if(!confirm(`确认将今日全部 ${count} 条草稿策略保存并加入执行队列？\n\n系统会先保存当前页编辑框里的最新话术；已入队、已发送和已暂停的策略不会重复处理。加入队列后仍需人工确认才会发送。`))return;
    state.outreachPending=true;
    state.outreachError='';
    const progress=document.querySelector('#outreach-task-selected-count');
    const button=document.querySelector('#outreach-batch-queue-button');
    if(button)button.disabled=true;
    if(progress)progress.textContent=`正在保存当前页修改：0/${boxes.length}`;
    let saved=0;
    try{
      for(const box of boxes){
        const id=box.dataset.taskSelect;
        await saveOutreachTaskMessageFromWorkspace(id);
        saved++;
        if(progress)progress.textContent=`正在保存当前页修改：${saved}/${boxes.length}`;
      }
      if(progress)progress.textContent=`正在加入今日执行队列：${count} 条`;
      const result=await studioApi('/outreach/tasks/queue-today',{method:'POST',body:JSON.stringify({scope:'today',confirm:true})});
      await renderOutreach();
      toast(`已保存并加入 ${result.queued_count} 条策略`);
    }catch(error){
      const message=`当前页修改已保存 ${saved}/${boxes.length} 条，批量入队失败：${error.message}`;
      state.outreachError=message;
      if(progress)progress.textContent=message;
      toast(message);
    }finally{
      state.outreachPending=false;
      updateOutreachTaskSelection();
      if(state.outreachError&&progress)progress.textContent=state.outreachError;
    }
    return;
  }
  const boxes=outreachQueueableTaskBoxes().filter(box=>box.checked);
  const ids=boxes.map(box=>box.dataset.taskSelect);
  if(!ids.length)return toast('请先勾选要加入队列的策略');
  if(!confirm(`确认将 ${ids.length} 条策略保存并加入执行队列？\n\n系统会先保存每条策略编辑框里的最新话术；加入队列后仍需人工确认才会发送。`))return;
  state.outreachPending=true;
  state.outreachError='';
  const progress=document.querySelector('#outreach-task-selected-count');
  const button=document.querySelector('#outreach-batch-queue-button');
  if(button)button.disabled=true;
  if(progress)progress.textContent=`正在保存并加入队列：0/${ids.length}`;
  let queued=0;
  try{
    for(const id of ids){
      await saveOutreachTaskMessageFromWorkspace(id);
      await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/queue`,{method:'POST',body:'{}'});
      queued++;
      const task=outreachVisibleTasks().find(item=>item.id===id);
      if(task)task.status='queued';
      const box=document.querySelector(`.outreach-workspace [data-task-select="${CSS.escape(id)}"]`);
      if(box){box.checked=false;box.disabled=true}
      updateOutreachTaskSelection();
      if(progress)progress.textContent=`正在保存并加入队列：${queued}/${ids.length}`;
    }
    await renderOutreach();
    toast(`已保存并加入 ${queued} 条策略`);
  }catch(error){
    const message=`已加入 ${queued}/${ids.length} 条，失败原因：${error.message}`;
    state.outreachError=message;
    if(progress)progress.textContent=message;
    toast(message);
  }finally{
    state.outreachPending=false;
    updateOutreachTaskSelection();
    if(state.outreachError&&progress)progress.textContent=state.outreachError;
  }
}
async function deleteOutreachTask(id){if(!confirm('确认删除这条未发送触达内容？已发送的真实消息留档不会被删除。'))return;try{await studioApi(`/outreach/tasks/${encodeURIComponent(id)}`,{method:'DELETE'});toast('未发送触达内容已删除');await renderOutreach()}catch(error){toast(error.message)}}
async function clearTodayOutreachStrategies(){
  if(state.outreachPending)return;
  const count=state.outreachData?.task_pagination?.unsent ?? outreachVisibleTasks().filter(task=>task.plan_day===state.outreachData?.plan_day&&['draft','queued'].includes(task.status)).length;
  if(!count)return toast('今日没有可删除的未发送策略');
  if(!confirm(`确认删除今日 ${count} 条未发送一客一策？\n\n已发送的真实消息留档不会被删除。`))return;
  state.outreachPending=true;
  try{
    const result=await studioApi('/outreach/tasks',{method:'DELETE',body:JSON.stringify({scope:'today',confirm:true})});
    state.outreachNotice=`已删除今日 ${result.deleted_count||0} 条未发送策略。`;
    await renderOutreach();
    toast(`已删除 ${result.deleted_count||0} 条未发送策略`);
  }catch(error){toast(error.message)}finally{state.outreachPending=false}
}
async function confirmOutreachSend(id){try{const task=await saveOutreachTaskMessageFromEditor(id)||outreachVisibleTasks().find(item=>item.id===id);if(!task)return;const name=task.contact_name||task.customer_name||'客户';if(!confirm(`确认发送给 ${name}？\n\n${task.recommended_message}`))return;await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/send`,{method:'POST',body:'{}'});toast('已提交句子互动发送')}catch(error){toast(error.message)}finally{const task=outreachVisibleTasks().find(item=>item.id===id);await renderOutreach();if(task?.contact_id)openOutreachContact(task.contact_id)}}
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
  await loadOutreachSnapshot().then(data=>{state.outreachData=data});
  return result;
}
async function startOutreachBatchSend(){
  const queuedTasks=state.outreachData?.queued_tasks||outreachVisibleTasks().filter(task=>task.status==='queued');
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
  const task=outreachVisibleTasks().find(item=>item.id===id);
  try{
    await studioApi(`/outreach/tasks/${encodeURIComponent(id)}/send`,{method:'POST',body:'{}'});
    batch.sent++;
  }catch(error){
    batch.failed++;
    toast(error.message);
  }
  batch.remaining=batch.remaining.slice(1);
  state.outreachData=await loadOutreachSnapshot();
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

Object.assign(window,{navigate,openSegment,openAudience,searchAudience,selectOwner,changeAudiencePage,openCustomerForm,saveCustomer,openImportForm,renderImportPreview,loadImportFile,saveCustomerImport,openCustomer,closeDrawer,refreshProfile,filterTasks,openTaskDetail,refreshTouchOptimization,completeTask,syncDashboardAssetsFromJuzi,syncOutreachContacts,syncOutreachHistory,refreshOutreachCache,refreshOutreachStrategies,generateOutreachTagStrategies,generateOutreachStrategyForContact,openOutreachContact,bindOutreachContact,assignOutreachBot,queueOutreachTask,deleteOutreachTask,clearTodayOutreachStrategies,confirmOutreachSend,resetOutreachTemplateForm,editOutreachTemplate,saveOutreachTemplate,deleteOutreachTemplate,generateOutreachTemplateTasks,startOutreachBatchSend,sendNextOutreachBatchTask,cancelOutreachBatchSend,toggleOutreachReplyStatus,saveOutreachSalutation,updateOutreachTaskMessage,generateOutreachReply,copyScript,openScript,copyEditedScript,submitOutreachContactSearch,submitOutreachTaskSearch,submitOutreachTagFilter,clearOutreachTagFilter,setOutreachTagMode,setOutreachStrategyDirection,applyOutreachRelatedTag,addOutreachExcludedTag,setOutreachContactReply,setOutreachTaskStatus,changeOutreachContactPage,changeOutreachTaskPage});
Object.assign(window,{toggleAllOutreachTasks,updateOutreachTaskSelection,queueSelectedOutreachTasks,setOutreachTaskSelectionScope,handleOutreachTaskSelectionChange});
bootstrap();
