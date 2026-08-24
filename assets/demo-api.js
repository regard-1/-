(() => {
  const now=()=>new Date().toISOString();
  const ago=hours=>new Date(Date.now()-hours*3600000).toISOString();
  const categories=[
    {code:'nmn',name:'NMN人群',description:'对精力、健康管理及NMN产品有明确关注',color:'#c89b5a',customer_count:4,due_count:4},
    {code:'ergothioneine',name:'麦角硫因人群',description:'关注抗氧化、精细养护及成分搭配',color:'#8e72c9',customer_count:3,due_count:2},
    {code:'coq10',name:'辅酶Q10人群',description:'关注日常活力、辅酶Q10及家庭健康',color:'#dc7064',customer_count:4,due_count:4},
    {code:'regular',name:'常规品人群',description:'关注基础营养与日常健康产品',color:'#4b9c7f',customer_count:4,due_count:4}
  ];
  const base=[
    {id:1,name:'林女士',phone:'138****8001',city:'上海',owner:'周顾问',member:'黑金会员',stage:'待回复',priority:'高',assetCodes:['nmn','coq10'],product_focus:'NMN焕活方案',last_message:'我担心长期吃会不会负担大，而且价格也要考虑。',last_time:'8分钟前',next_action:'先回应安全与周期顾虑，再给轻量体验选择',next_at:'今天 10:30',consent:'企业微信已授权',traits:['重视安全边界','倾向简单方案','价格需解释价值'],facts:['近30天查看NMN内容4次','主动咨询过使用周期','上次沟通偏好简短回复'],purchase:['NMN体验装 · 2026/07','辅酶Q10基础装 · 2026/05']},
    {id:2,name:'陈先生',phone:'139****6720',city:'杭州',owner:'周顾问',member:'铂金会员',stage:'待首次触达',priority:'中',assetCodes:['ergothioneine','regular'],product_focus:'麦角硫因体验方案',last_message:'在直播间问过麦角硫因和普通抗氧化产品有什么区别。',last_time:'昨天',next_action:'从成分差异切入，邀请其说明最关心的使用目标',next_at:'今天 11:00',consent:'企微好友可触达',traits:['成分知识较深','重视证据来源','不喜欢强推'],facts:['完整观看成分直播','收藏麦角硫因文章2篇','过去对专业解释回应更积极'],purchase:['日常营养组合 · 2026/03']},
    {id:3,name:'赵女士',phone:'136****1058',city:'苏州',owner:'李顾问',member:'黄金会员',stage:'待跟进',priority:'高',assetCodes:['coq10','regular'],product_focus:'辅酶Q10日常方案',last_message:'我先和家里人商量一下，过两天再说。',last_time:'2天前',next_action:'轻量确认家庭使用场景，不制造紧迫感',next_at:'今天 14:00',consent:'企业微信已授权',traits:['家庭决策型','需要低压力沟通','关注日常坚持'],facts:['两次询问家庭成员是否适用','回复集中在午后','对套餐信息停留时间较长'],purchase:['基础维矿组合 · 2026/04']},
    {id:4,name:'周先生',phone:'137****4436',city:'南京',owner:'张顾问',member:'白银会员',stage:'已读未回',priority:'中',assetCodes:['regular','nmn'],product_focus:'日常营养组合',last_message:'收到，我再看看。',last_time:'3天前',next_action:'发送一条可独立阅读的要点，不连续追问',next_at:'今天 16:30',consent:'企微好友可触达',traits:['回复频率低','偏好图文摘要','价格敏感'],facts:['社群内容点击3次','优惠信息有点击无咨询','晚间回复率高'],purchase:['益生菌体验装 · 2026/02']},
    {id:5,name:'吴女士',phone:'135****2916',city:'北京',owner:'周顾问',member:'铂金会员',stage:'对话中',priority:'高',assetCodes:['nmn','ergothioneine'],product_focus:'精细养护组合',last_message:'两种一起了解的话，应该先从哪个开始？',last_time:'刚刚',next_action:'先澄清目标与在用产品，再给分步体验建议',next_at:'立即回复',consent:'企业微信已授权',traits:['愿意持续沟通','关注搭配逻辑','决策前会比较'],facts:['近7天发起咨询3次','阅读专业版内容','已说明暂无特殊用药'],purchase:['NMN体验装 · 2026/06']},
    {id:6,name:'孙先生',phone:'188****3019',city:'广州',owner:'王顾问',member:'普通会员',stage:'待首次触达',priority:'低',assetCodes:['regular','coq10'],product_focus:'辅酶Q10体验装',last_message:'在问卷中选择“偶尔尝试保健品”。',last_time:'昨天',next_action:'用通俗语言介绍，不要求立即购买',next_at:'明天 10:00',consent:'站内服务消息授权',traits:['保健品新手','需要基础解释','低频触达'],facts:['首次完成需求问卷','未产生主动咨询','选择简单易懂内容'],purchase:[]},
    {id:7,name:'郑女士',phone:'186****4428',city:'成都',owner:'李顾问',member:'黄金会员',stage:'暂停触达',priority:'低',assetCodes:['ergothioneine'],product_focus:'麦角硫因单品',last_message:'最近先不要给我发消息，谢谢。',last_time:'5天前',next_action:'遵守暂停要求，30天内不主动触达',next_at:'已暂停',consent:'用户要求暂停',traits:['明确表达边界','偏好自主浏览','当前不可主动触达'],facts:['5天前要求暂停消息','已写入免打扰状态','仅允许响应式服务'],purchase:['麦角硫因体验装 · 2026/01']},
    {id:8,name:'刘先生',phone:'133****9072',city:'武汉',owner:'张顾问',member:'铂金会员',stage:'待跟进',priority:'中',assetCodes:['coq10','nmn'],product_focus:'活力管理组合',last_message:'你把主要区别和适合什么情况发我，我有空看。',last_time:'昨天',next_action:'发送结构化对比，不使用绝对功效表达',next_at:'今天 19:00',consent:'企业微信已授权',traits:['职业节奏快','偏好结构化信息','晚间阅读'],facts:['工作日白天很少回复','对对比表点击率高','曾主动要求文字总结'],purchase:['辅酶Q10基础装 · 2026/05']}
  ];
  const customers=base.map((c,index)=>({...c,
    assets:c.assetCodes.map(code=>({code,name:categories.find(x=>x.code===code).name,basis:index%2?'内容与咨询事实':'购买与互动事实'})),
    ai_profile:{summary:`${c.name}当前关注${c.product_focus}，${c.traits.join('、')}。建议围绕“${c.next_action}”展开，先解决当下疑问，再邀请用户自主选择下一步。`,tags:c.traits,confidence:Math.max(.76,.92-index*.015),generated_at:ago(index+1),evidence:c.facts.map((label,i)=>({label,source:i===0?'行为记录':i===1?'互动记录':'用户主动偏好'})),guardrails:c.stage==='暂停触达'?['禁止主动触达','仅响应用户主动咨询']:['不承诺疾病治疗效果','不输出内部标签与评分','发送前由运营人员确认']},
    interactions:[{type:'客户消息',content:c.last_message,time:c.last_time,channel:'企业微信'},{type:'系统记录',content:c.next_action,time:'待执行',channel:'运营中台'}]
  }));
  const scripts=[
    {id:'opening',scene:'首次触达',title:'从用户行为自然开场',purpose:'建立对话，不直接推产品',template:'您好，看到您之前关注过{{关注内容}}。想先了解一下，您现在更关心成分本身、日常使用，还是如何选择？我可以按您最关心的一点简要说明。',avoid:'不要直接使用“您是高意向客户”等内部判断。'},
    {id:'need',scene:'需求澄清',title:'先问清目标再推荐',purpose:'减少无效推荐',template:'为了避免信息太多，我先确认一下：您更希望解决的是{{目标A}}，还是更关注{{目标B}}？另外现在是否正在使用其他营养产品？',avoid:'不追问疾病隐私；涉及用药时提示咨询医生或药师。'},
    {id:'compare',scene:'产品比较',title:'用事实解释差异',purpose:'帮助用户形成可理解的选择',template:'这两类产品关注点不同，可以从成分定位、使用方式、信息证据和预算四方面比较。我先把主要差异列清楚，再由您判断哪种更符合当前需要。',avoid:'避免“最好、一定有效、人人适合”等表达。'},
    {id:'objection',scene:'异议处理',title:'回应价格与安全顾虑',purpose:'先处理疑虑再推进',template:'您考虑安全和长期成本很正常。我们可以先把不适合的情况、使用边界和单次体验成本说明白，不需要现在就做长期决定。',avoid:'不制造稀缺和焦虑，不用健康风险迫使成交。'},
    {id:'follow',scene:'跟进提醒',title:'低压力继续上次对话',purpose:'保持服务感，避免打扰',template:'您好，上次您提到{{上次问题}}。我把相关要点整理好了，您方便时看即可。如果暂时不需要，我也可以停止后续提醒。',avoid:'尊重免打扰和暂停状态。'},
    {id:'close',scene:'方案确认',title:'确认理解后再推进',purpose:'完成明确、自主的下一步',template:'根据刚才确认的需求，当前更匹配的是{{方案}}。我再把包含内容、使用边界和需要注意的地方发您；您确认理解后，再决定是否继续。',avoid:'不替用户做决定，不隐瞒限制条件。'}
  ];
  let tasks=[
    {id:'t1',customer_id:1,type:'回复客户',reason:'客户询问长期使用与价格',due:'今天 10:30',status:'pending'},
    {id:'t2',customer_id:2,type:'首次触达',reason:'直播后留下成分问题',due:'今天 11:00',status:'pending'},
    {id:'t3',customer_id:3,type:'温和跟进',reason:'约定两天后联系',due:'今天 14:00',status:'pending'},
    {id:'t4',customer_id:4,type:'内容跟进',reason:'已读未回，发送独立要点',due:'今天 16:30',status:'pending'},
    {id:'t5',customer_id:8,type:'发送对比',reason:'用户主动要求文字总结',due:'今天 19:00',status:'pending'},
    {id:'t6',customer_id:5,type:'即时回复',reason:'当前对话等待回复',due:'立即',status:'pending'}
  ];
  let loggedIn=false,sequence=100;
  const conversations=new Map(customers.map(c=>[c.id,{id:c.id,customer_id:c.id,scene:'consult',messages:[{role:'operator',content:`您好${c.name.slice(0,1)}老师，上次关注的内容还有哪里需要我说明吗？`,time:'前次沟通'},{role:'customer',content:c.last_message,time:c.last_time}],suggestion:null}]));
  const ok=(data,status=200)=>Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail=(message,status=404)=>Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const body=options=>{try{return JSON.parse(options?.body||'{}')}catch{return {}}};
  const customer=id=>customers.find(x=>x.id===Number(id));
  function suggestionFor(c,message,scene){
    const sensitive=/治疗|治好|药|医生|怀孕|孕期|严重|胸痛|呼吸困难/.test(message);
    const reply=sensitive
      ?`您提到的情况涉及专业医疗判断，我不能仅根据产品信息给出结论。建议先咨询医生或药师；如果您愿意，我可以只把${c.product_focus}的公开成分信息和注意事项整理给您参考。`
      :scene==='objection'
        ?`您会考虑安全和长期成本很正常。针对${c.product_focus}，我可以先把适用边界、体验周期和不同选择说明白，不需要现在就做长期决定。您更想先了解安全注意，还是预算安排？`
        :scene==='follow'
          ?`您好，上次您提到“${c.last_message.slice(0,28)}”。我把与${c.product_focus}相关的要点整理好了，您方便时看即可；如果暂时不需要，我就不继续打扰。`
          :`理解您的关注。结合您刚刚提到的情况，我们可以先围绕${c.product_focus}把使用边界、产品差异和预算逐项说明。您现在最想先确认哪一点？`;
    return {reply,alternatives:[`我先把${c.product_focus}最需要注意的三点发您，您看完再决定要不要继续了解。`,`可以先从更轻量的了解或体验开始，不急着一次做长期选择。`],reason:`基于当前消息、${c.product_focus}关注事实与“${scene}”场景生成`,policy_flags:sensitive?['触发医疗边界','禁止个体化用药建议','需要人工确认']:['不使用绝对功效','不暴露内部信息','发送前人工确认'],provider:'Dotbest Reply Agent'};
  }
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);const path=url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');const method=(options.method||'GET').toUpperCase();
    if(path==='/api/login'&&method==='POST'){loggedIn=true;return ok({display_name:'周顾问',role:'一线运营'})}
    if(path==='/api/logout'&&method==='POST'){loggedIn=false;return ok({})}
    if(path==='/api/me')return loggedIn?ok({id:1,display_name:'周顾问',role:'一线运营',permissions:['customer:read','conversation:reply','task:update']}):fail('请先登录',401);
    if(!loggedIn)return fail('请先登录',401);
    if(path==='/api/v1/private/workbench')return ok({metrics:{due:tasks.filter(x=>x.status==='pending').length,waiting:customers.filter(x=>x.stage==='待回复'||x.stage==='对话中').length,followups:customers.filter(x=>x.stage==='待跟进').length,paused:customers.filter(x=>x.stage==='暂停触达').length},categories,queue:tasks.filter(x=>x.status==='pending').slice(0,6).map(t=>({...t,customer:customer(t.customer_id)})),completed_today:3});
    if(path==='/api/v1/private/user-assets')return ok({categories,updated_at:now()});
    let m=path.match(/^\/api\/v1\/private\/user-assets\/([\w-]+)\/customers$/);
    if(m){const audience=categories.find(x=>x.code===m[1]);if(!audience)return fail('人群不存在');const q=(url.searchParams.get('q')||'').toLowerCase();let items=customers.filter(x=>x.assetCodes.includes(m[1]));if(q)items=items.filter(x=>`${x.name}${x.phone}${x.owner}${x.product_focus}${x.stage}`.toLowerCase().includes(q));return ok({audience,items,pagination:{page:1,total:items.length}})}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)$/);if(m){const c=customer(m[1]);return c?ok(c):fail('用户不存在')}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/ai-profile\/refresh$/);if(m&&method==='POST'){const c=customer(m[1]);c.ai_profile.generated_at=now();return ok(c.ai_profile)}
    if(path==='/api/v1/private/conversations')return ok({items:customers.filter(x=>x.stage!=='暂停触达').map(c=>({conversation_id:c.id,customer_id:c.id,name:c.name,stage:c.stage,product_focus:c.product_focus,last_message:c.last_message,last_time:c.last_time,priority:c.priority,unread:c.stage==='待回复'||c.stage==='对话中'}))});
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/agent-conversations$/);if(m&&method==='POST'){const c=customer(m[1]);if(!c)return fail('用户不存在');return ok(conversations.get(c.id),201)}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)$/);if(m){const conv=conversations.get(Number(m[1]));return conv?ok({conversation:conv,customer:customer(conv.customer_id)}):fail('会话不存在')}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/messages$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options),c=customer(conv.customer_id);conv.scene=data.scene||'consult';conv.messages.push({role:'customer',content:String(data.message||''),time:'刚刚'});conv.suggestion=suggestionFor(c,String(data.message||''),conv.scene);c.last_message=String(data.message||'');c.last_time='刚刚';c.stage='待回复';return ok({conversation_id:conv.id,suggestion:conv.suggestion})}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/mark-sent$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options);conv.messages.push({role:'operator',content:String(data.reply||''),time:'刚刚'});conv.suggestion=null;const c=customer(conv.customer_id);c.stage='待跟进';c.next_action='等待用户回复，避免重复触达';c.next_at='2天后';return ok({sent:true,conversation:conv})}
    if(path==='/api/v1/private/tasks'&&method==='GET')return ok({items:tasks.map(t=>({...t,customer:customer(t.customer_id)})),pending:tasks.filter(x=>x.status==='pending').length});
    m=path.match(/^\/api\/v1\/private\/tasks\/([\w-]+)\/status$/);if(m&&method==='POST'){const t=tasks.find(x=>x.id===m[1]);if(!t)return fail('任务不存在');t.status=body(options).status||'done';return ok(t)}
    if(path==='/api/v1/private/scripts')return ok({items:scripts,scenes:[...new Set(scripts.map(x=>x.scene))]});
    if(path==='/api/v1/private/governance')return ok({role:'一线运营',allowed:['查看本人负责用户的脱敏资料','查看内部辅助摘要及事实依据','生成、编辑和复制回复建议','更新本人触达任务与跟进记录'],blocked:['访问后台订单管理','查看经营决策与利润报表','导出完整手机号等敏感字段','将内部标签、评分或推断直接发送给客户'],audit:[{time:'今天 09:18',action:'生成回复建议',object:'林女士',result:'通过合规检查'},{time:'昨天 17:42',action:'暂停触达',object:'郑女士',result:'已写入免打扰'}]});
    return fail('演示接口不存在');
  };
})();
