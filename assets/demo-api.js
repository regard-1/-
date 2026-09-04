(() => {
  const now=()=>new Date().toISOString();
  const ago=hours=>new Date(Date.now()-hours*3600000).toISOString();
  const categories=[
    {code:'nmn',name:'NMN人群',description:'对精力、健康管理及NMN产品有明确关注',color:'#c89b5a',segment_code:'anti-aging',customer_count:4,due_count:4},
    {code:'ergothioneine',name:'麦角硫因人群',description:'关注抗氧化、精细养护及成分搭配',color:'#8e72c9',segment_code:'anti-aging',customer_count:3,due_count:2},
    {code:'coq10',name:'辅酶Q10人群',description:'关注日常活力、辅酶Q10及家庭健康',color:'#dc7064',segment_code:'basic-nutrition',customer_count:4,due_count:4},
    {code:'regular',name:'常规品人群',description:'关注基础营养与日常健康产品',color:'#4b9c7f',segment_code:'basic-nutrition',customer_count:4,due_count:4}
  ];
  const segments=[
    {code:'anti-aging',name:'抗衰人群',description:'以 NMN、麦角硫因为核心的高价值抗衰用户，优先完成精细化运营',color:'#2f7165',category_codes:['nmn','ergothioneine'],purchase_keywords:['NMN','麦角硫因'],customer_count:0,due_count:0},
    {code:'basic-nutrition',name:'基础营养补充人群',description:'以辅酶 Q10、常规营养品为核心的日常健康用户，覆盖家庭营养需求',color:'#b07b3d',category_codes:['coq10','regular'],purchase_keywords:['辅酶','日常营养','益生菌','维矿'],customer_count:0,due_count:0}
  ];
  const customers=[];
  const nmnSeed=(typeof window!=='undefined'&&Array.isArray(window.NMN_DEMO_SEED))?window.NMN_DEMO_SEED:[];
  const personaSeed=(typeof window!=='undefined'&&Array.isArray(window.CHAT_PERSONA_SEED))?window.CHAT_PERSONA_SEED:[];
  const personaByPhone=new Map(personaSeed.map(x=>[x.p,x]));
  const nmnCategory=categories.find(x=>x.code==='nmn');
  const tierMap={
    '已购活跃':{stage:'待跟进',intent:85,conversion:62,confidence:76,purchase:['NMN产品 · 历史购买信号（脱敏）']},
    '高价值':{stage:'待跟进',intent:88,conversion:68,confidence:74,purchase:[]},
    '沉睡':{stage:'已读未回',intent:30,conversion:18,confidence:70,purchase:[]},
    '待培育':{stage:'待跟进',intent:45,conversion:30,confidence:68,purchase:[]}
  };
  const normalizePhone=value=>String(value||'').replace(/\D/g,'').slice(-4);
  const cleanRemark=value=>String(value||'').replace(/\*/g,' ').replace(/\s+/g,' ').trim();
  const parseDateToken=value=>{
    const raw=String(value||'');
    const m=raw.match(/\b(2\d{5})\b/);
    if(!m)return null;
    const s=m[1],mm=Number(s.slice(2,4)),dd=Number(s.slice(4,6));
    if(mm<1||mm>12||dd<1||dd>31)return null;
    return `20${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
  };
  const productTokenMap=[
    {re:/麦角硫因/,label:'麦角硫因'},
    {re:/麦角/,label:'麦角硫因'},
    {re:/辅酶\s*Q10|辅酶/,label:'辅酶Q10'},
    {re:/NMN|nmn/,label:'NMN'},
    {re:/小仙弹/,label:'小仙弹'},
    {re:/叶黄素/,label:'叶黄素'},
    {re:/DHA|鱼油/,label:'鱼油/DHA'},
    {re:/PQQ/,label:'PQQ'},
    {re:/维矿|维生素/,label:'维生素/维矿'},
    {re:/氨糖/,label:'氨糖'},
    {re:/益生菌/,label:'益生菌'}
  ];
  const normalizePurchase=p=>{
    if(!p)return null;
    const date=String(p.date||'').trim();
    const product=String(p.product||'').trim()||null;
    return {date,product,quantity:null,amount:null,note:'上次购买（脱敏）',hasPurchase:Boolean(date||product)};
  };
  const cleanDisplayName=(raw,phone)=>{
    const s=String(raw||'').trim();
    if(!s||s==='.'||/^[._\-—…·*#@?！!，,、；;:：~～]+$/.test(s))return `用户${phone}`;
    return s;
  };
  const stripDecorations=value=>String(value||'').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g,'');
  const inferSalutation=(name,remark)=>{
    const text=`${name||''} ${remark||''}`;
    const female=/女|女士|小姐|姐|姐姐|妈|嫂|姨|妹|奶|姑|公主|阿姨/.test(text);
    const male=/男|先生|哥|哥哥|叔|伯|爷|弟|兄|大哥|帅哥/.test(text);
    const suffix=female?'姐':(male?'哥':'');
    let clean=stripDecorations(name);
    if(!clean)clean=String(name||'').trim().replace(/\s+/g,'');
    if(!suffix)return clean;
    let base=clean.replace(/先生|女士|小姐|姐姐|哥哥|哥|姐|男|女/g,'');
    const cjk=base.match(/[\u4e00-\u9fff]/g);
    base=cjk&&cjk.length?cjk[cjk.length-1]:base||clean;
    return `${base}${suffix}`;
  };
  const RESOURCES_KEY='dotbest_resources_v2';
  const defaultResources=()=>({activity:'',plan:'',knowledge:''});
  let resources=defaultResources();
  try{
    const saved=window.localStorage&&window.localStorage.getItem(RESOURCES_KEY);
    if(saved){const parsed=JSON.parse(saved);resources={...defaultResources(),...parsed};}
  }catch{}
  const persistResources=()=>{try{window.localStorage&&window.localStorage.setItem(RESOURCES_KEY,JSON.stringify(resources));}catch{}};
  const activityBrief=()=>String(resources.activity||'').split(/\r?\n/)[0].trim().slice(0,48);
  const activityLineFor=()=>{const a=activityBrief();return a?`另外，这个月有个「${a}」的活动，您有空我再简短说说，不着急。`:'';};
  const parsePurchaseRemark=value=>{
    const raw=String(value||'').trim();
    const note=cleanRemark(raw);
    const date=parseDateToken(raw);
    let product=null;
    for(const token of productTokenMap){if(token.re.test(raw)){product=token.label;break;}}
    const quantityMatch=raw.match(/(\d+)\s*(?:瓶|盒|袋)/);
    const amountMatch=raw.replace(/\b2\d{5}\b/g,' ').match(/(?<!\d)(\d{4,6})(?!\d)/);
    return {
      date,
      product,
      quantity:quantityMatch?`${quantityMatch[1]}${quantityMatch[0].match(/瓶|盒|袋/)[0]}`:null,
      amount:amountMatch?amountMatch[1]:null,
      note:note||'暂无备注',
      hasPurchase:Boolean(product||date||quantityMatch||amountMatch)
    };
  };
  const phoneCount=new Map();
  nmnSeed.forEach(record=>{const ph=normalizePhone(record?.phone);phoneCount.set(ph,(phoneCount.get(ph)||0)+1);});
  nmnSeed.forEach(record=>{
    const phone=normalizePhone(record?.phone);
    const px=personaByPhone.get(phone);
    if(!px||phoneCount.get(phone)!==1)return;
    const name=cleanDisplayName(record?.name,phone);
    const owner=String(record?.owner||'').trim()||'NMN项目';
    const remark=String(record?.remark||'').trim();
    const lpRaw=px.last_purchase||{};
    const purchaseInsight=(lpRaw.date||lpRaw.product)?normalizePurchase(lpRaw):parsePurchaseRemark(remark);
    if(purchaseInsight.hasPurchase&&!purchaseInsight.product)purchaseInsight.product='未标注品类';
    const tier=tierMap[px.value_tier]||{stage:'待首次触达',intent:0,conversion:0,confidence:0,purchase:[]};
    const warmNote=px.warmth==='高'?'关系亲近、回应积极':px.warmth==='中'?'有一定互动基础':px.warmth==='需挽回'?'关系趋冷，需谨慎挽回':'互动较少，需重建连接';
    const engNote=px.engagement==='高频'?'互动高频':px.engagement==='中频'?'互动中频':'互动低频';
    const concernNote=px.concerns||'使用与复购';
    const follow=px.follow_angle||px.next_step||'先做一次低压力确认，采集当前需求与授权边界';
    const baseEvidence=[
      {label:`近一年脱敏互动 ${px.messages} 条`,source:'聊天记录脱敏统计'},
      {label:`活跃 ${px.active_months} 个月 · ${warmNote}`,source:'聊天记录脱敏统计'},
      {label:`${px.value_tier} · ${px.loyalty}忠诚度 · ${engNote}`,source:'聊天记录脱敏统计'},
      {label:`关注点：${concernNote}`,source:'聊天记录脱敏统计'}
    ];
    const purchaseEvidence=purchaseInsight.hasPurchase?{label:formatPurchaseInsight(purchaseInsight),source:'备注解析'}:null;
    const evidence=purchaseEvidence?baseEvidence.concat(purchaseEvidence):baseEvidence;
    const purchaseItems=[];
    if(purchaseInsight.hasPurchase){
      purchaseItems.push(formatPurchaseInsight(purchaseInsight));
    }else{
      purchaseItems.push(...tier.purchase);
    }
    const productFocus=px.product_focus||'NMN焕活方案';
    const traitList=(px.tags&&px.tags.length)?px.tags.slice(0,5):[px.value_tier,engNote];
    const recencyLabel=px.recency_days<=7?'近7天活跃':px.recency_days<=30?'近30天活跃':`已约${Math.max(1,Math.round(px.recency_days/30))}个月未有效互动`;
    const persona={age_band:'待确认',gender:'未标注',occupation:'待确认（暂无推断依据）',life_stage:'待确认',personality:'待观察',decision_style:'暂无足够依据，先以用户自述为准',content_preference:'待观察',available_time:'待首次触达后确认',non_health_topics:[],intention_score:tier.intent,conversion_probability:tier.conversion,confidence:tier.confidence,sources:['NMN名单导入','近一年聊天互动脱敏统计'],value_tier:px.value_tier,loyalty:px.loyalty,engagement:px.engagement,warmth:px.warmth,recency_days:px.recency_days,messages:px.messages,active_months:px.active_months,concerns:concernNote,recency_label:recencyLabel};
    const c={
      id:customers.length+1,name,salutation:inferSalutation(name,remark),phone,city:'待补充',owner,remark,member:'未绑定会员',stage:tier.stage,priority:px.priority||'中',assetCodes:['nmn'],product_focus:productFocus,last_message:`该客户近一年互动${px.messages}条，关注${concernNote}（已脱敏汇总）`,last_time:px.last_active||'近期',next_action:follow,next_at:px.recency_days<=7?'今天':px.recency_days<=30?'近期安排':'唤醒后安排',consent:'历史沟通渠道（需确认当前授权）',traits:traitList,facts:evidence.map(e=>e.label),purchase:purchaseItems,last_purchase:purchaseInsight,
      persona,
      assets:[{code:'nmn',name:nmnCategory.name,basis:'名单归属与聊天匹配'}],
      ai_profile:{summary:buildProfileSummary(name,px,concernNote,productFocus,follow,purchaseInsight),tags:[...traitList,px.value_tier,recencyLabel,`关系温度${px.warmth}`,`忠诚度${px.loyalty}`,purchaseInsight.hasPurchase?`上次购买${purchaseInsight.product||'记录'}`:'暂无购买记录'],confidence:tier.confidence/100,generated_at:now(),evidence,guardrails:['不承诺疾病治疗效果','不把推断描述成用户事实','不按政治立场或敏感属性定向沟通','发送前由运营人员确认'].concat(px.avoid?[px.avoid]:[])},
      interactions:[
        {type:'画像记录',content:`${px.value_tier} · ${px.engagement} · 关注${concernNote}。跟进建议：${follow}`,time:px.last_active||'近期',channel:'聊天记录（脱敏）'},
        {type:'购买记录',content:purchaseInsight.hasPurchase?formatPurchaseInsight(purchaseInsight):'备注未提供明确购买信息',time:purchaseInsight.date||'时间未注明',channel:'备注标签'},
        {type:'系统记录',content:follow,time:'待执行',channel:'运营中台'}
      ]
    };
    Object.assign(c.persona,{
      personality:`${warmNote}、忠诚度${px.loyalty}、${engNote}、近一年${px.messages}条互动`,
      decision_style:`价值层级为${px.value_tier}；${px.warmth==='高'?'关系较熟、回应积极':px.warmth==='中'?'已有一定互动基础':'关系尚未建立'}；主要关注${concernNote}。建议先把已知事实说清楚，再用一个二选一的问题推进，避免一次给多个卖点。`,
      content_preference:px.value_tier==='已购活跃'?'关心使用体验与复购，先服务、后方案':px.value_tier==='高价值'?'愿意看结构化对比，但反感强推':'偏好低压力、简短、可随时退出的沟通',
      available_time:px.recency_days<=7?'近一周活跃，适合及时回应':px.recency_days<=30?'近一月活跃，按用户方便时段安排':'长期未活跃，先做一次低打扰唤醒'
    });
    customers.push(c);
  });
  function formatPurchaseInsight(p){
    const qty=p.quantity?` ${p.quantity}`:'';
    const date=p.date||'历史购买线索待确认';
    return `${p.product||'未标注品类'}${qty} · ${date}`;
  }
  function tierLabel(tier){
    return tier==='高价值'?'高价值（客单与转化潜力较高）':tier==='已购活跃'?'已购活跃（已有购买且近期仍活跃）':tier==='沉睡'?'沉睡老客（有过互动但近期沉寂）':'待培育（新进入，需先建立信任）';
  }
  function recencyText(days){
    return days<=7?'近7天仍有互动':days<=30?'近30天有过互动':`已约${Math.max(1,Math.round(days/30))}个月未形成有效互动`;
  }
  function buildProfileSummary(name,px,concern,productFocus,follow,purchase){
    const concernOut=concern&&String(concern).trim()&&!String(concern).includes('使用与复购')?`主要顾虑集中在「${concern}」`:'未显性提及具体顾虑，需在沟通中先采集';
    const purchaseLine=purchase.hasPurchase?`最近一次购买记录为${formatPurchaseInsight(purchase)}，可沿产品使用进度做续购与关怀。`:'暂无明确最近购买记录，需先核对使用情况与库存。';
    return `${name}近一年有${px.messages}条脱敏互动、活跃${px.active_months}个月，${recencyText(px.recency_days)}。分层为${tierLabel(px.value_tier)}，关系温度${px.warmth}、忠诚度${px.loyalty}。${concernOut}，产品方向为${productFocus}。${purchaseLine}建议下一步：${follow}`;
  }
  function refreshCategoryCounts(){
    categories.forEach(category=>{
      category.customer_count=customers.filter(c=>c.assetCodes.includes(category.code)).length;
      category.due_count=customers.filter(c=>c.assetCodes.includes(category.code)&&c.stage==='待首次触达').length;
    });
  }
  function refreshSegmentCounts(){
    segments.forEach(segment=>{
      const matched=customers.filter(c=>c.assetCodes.some(code=>segment.category_codes.includes(code)));
      segment.customer_count=matched.length;
      segment.due_count=matched.filter(c=>c.stage==='待首次触达').length;
    });
  }
  refreshCategoryCounts();
  refreshSegmentCounts();
  function ownerSummaries(list=customers){
    const map=new Map();
    list.forEach(c=>map.set(c.owner,(map.get(c.owner)||0)+1));
    return [...map.entries()].map(([name,count])=>({name,count}));
  }
  function segmentMembers(segment){
    const codes=segment.category_codes||[];
    return customers.filter(c=>c.assetCodes.some(code=>codes.includes(code)));
  }
  function segmentOverview(segment){
    const kw=segment.purchase_keywords||[];
    const members=segmentMembers(segment);
    const paused=[],silent=[],repurchase=[],core=[],nurture=[],fresh=[];
    members.forEach(c=>{
      if(c.stage==='暂停触达'){paused.push(c);return}
      if(c.stage==='已读未回'){silent.push(c);return}
      const purchased=(c.purchase||[]).some(p=>kw.some(k=>String(p).includes(k)));
      if(purchased){repurchase.push(c);return}
      const score=c.persona?.intention_score||0;
      if(score>=80){core.push(c);return}
      if(score>=40){nurture.push(c);return}
      fresh.push(c);
    });
    const tiers=[
      {key:'repurchase',name:'已购待复购',description:'已有该板块购买记录，按使用周期做关怀与复购',count:repurchase.length,action:'先核对使用情况与库存，再判断是否续购或调整方案',tone:'服务优先，不虚构断档',accent:'#2f7165'},
      {key:'core',name:'高意向核心',description:'意向明确且尚未购买，是本周转化重点',count:core.length,action:'当天聚焦顾虑，给二选一的明确下一步',tone:'减少泛化介绍，多轮推进',accent:'#c89b5a'},
      {key:'nurture',name:'观望培育',description:'有初步意向，需要低压力信息与耐心培育',count:nurture.length,action:'一次只给一个信息点，结尾留一个易答问题',tone:'不催促，允许退出',accent:'#8e72c9'},
      {key:'fresh',name:'待首次触达',description:'名单已导入，尚未形成真实沟通事实',count:fresh.length,action:'完成首次触达，采集需求、使用场景与授权边界',tone:'先建联，再判断',accent:'#4b7fae'},
      {key:'silent',name:'沉默唤醒',description:'已读未回，需低打扰度确认是否继续',count:silent.length,action:'发送单条可独立阅读要点，明确无回复即降低频次',tone:'不连续追问',accent:'#b07b3d'}
    ];
    const actionable=['待回复','对话中','待跟进','待首次触达'];
    const dueSample=members.filter(c=>actionable.includes(c.stage)).slice(0,6).map(c=>({id:c.id,name:c.name,phone:c.phone,stage:c.stage,product_focus:c.product_focus,next_action:c.next_action}));
    return {
      segment,
      metrics:{total:members.length,due:members.filter(c=>actionable.includes(c.stage)).length,repurchase:repurchase.length,core:core.length,nurture:nurture.length,fresh:fresh.length,silent:silent.length,paused:paused.length},
      tiers,
      due_sample:dueSample,
      positioning:'该板块由运营负责人设定为当前最高优先级，先完成一人一策分层与精细化落地'
    };
  }
  const scripts=[
    {id:'new-icebreak',customer_type:'新客',stage:'触达激活',scene:'破冰建联',title:'接住来源，只问一个问题',purpose:'让用户愿意开口',template:'{{称呼}}，我是之前在{{来源场景}}和您联系过的{{顾问名}}。看到您当时留意了{{内容}}，我先不发一大段介绍——您现在是想简单了解一下，还是已经有具体问题？',next_turn:'用户回复后复述其原话，再采集一个必要标签。',avoid:'不使用空泛“亲，在吗”；不在首条塞价格、链接和多个卖点。'},
    {id:'new-tag',customer_type:'新客',stage:'触达激活',scene:'标签采集',title:'用选择题了解需求',purpose:'完成低压力标签采集',template:'明白。那我只确认一个方向：您现在更在意{{方向A}}，还是{{方向B}}？我按您选的方向说，省得信息太多。',next_turn:'记录用户自述标签；不要把系统推断当成答案。',avoid:'一次只问一个问题，不连续盘问年龄、职业、疾病史。'},
    {id:'new-discovery',customer_type:'新客',stage:'需求转化',scene:'挖需',title:'承接用户原话继续问',purpose:'找到真实使用场景',template:'您刚才说“{{用户原话}}”，我理解您主要卡在{{已确认问题}}。这个情况大概持续多久了？我先把场景弄清楚，再看有没有必要继续了解。',next_turn:'追问使用场景、既往体验或预算中的一项。',avoid:'不替用户定义需求；不从普通困扰推断疾病。'},
    {id:'new-education',customer_type:'新客',stage:'需求转化',scene:'教育说明',title:'先给结论，再问是否展开',purpose:'降低理解成本',template:'先说简单结论：{{一句话结论}}。它主要解决的是{{作用边界}}，并不等于{{常见误解}}。如果您愿意，我再把依据和注意事项用三点发您。',next_turn:'用户同意后再发送三点说明，不一次性倾倒全部资料。',avoid:'不承诺治疗、逆转、必然有效；不使用无法核验的倍数话术。'},
    {id:'new-compare',customer_type:'新客',stage:'需求转化',scene:'产品对比',title:'按用户在意点做对比',purpose:'帮助用户自主选择',template:'按您最在意的{{比较维度}}看：A更偏{{A特点}}，B更偏{{B特点}}；使用方式和预算分别是{{简要差异}}。如果只先选一个，您更倾向哪种节奏？',next_turn:'根据选择进入顾虑处理，不立刻追加促销。',avoid:'不贬低竞品，不用“最好、顶级、人人适合”。'},
    {id:'new-close',customer_type:'新客',stage:'需求转化',scene:'轻量促单',title:'总结共识后给小步选择',purpose:'把意向变成明确下一步',template:'按咱们刚确认的{{需求}}，先从{{轻量方案}}更稳妥。包含{{内容}}，需要注意{{边界}}。您想先看具体明细，还是今天先考虑一下？',next_turn:'用户选择看明细后再发送价格/链接；选择考虑则约定时间。',avoid:'不虚构库存、截止时间或替用户锁单。'},
    {id:'new-order-confirm',customer_type:'新客',stage:'成交转化',scene:'信息确认',title:'确认信息，不制造催促',purpose:'减少沟通差错',template:'我把刚才确认的内容再对一遍：{{方案与数量}}，{{权益或注意项}}。您看有没有哪一项需要改？确认无误后我再发下一步。',next_turn:'仅执行沟通确认；不在中台承载后台订单决策。',avoid:'不在聊天里暴露完整地址、证件或内部订单信息。'},
    {id:'new-payment',customer_type:'新客',stage:'成交转化',scene:'支付跟进',title:'先排查卡点',purpose:'帮助用户完成自主操作',template:'刚才那一步如果没走完，可能是页面或支付方式卡住了。您看到的是“不会操作”、 “页面没找到”，还是“还想再考虑”？告诉我哪一种，我只帮您处理那一步。',next_turn:'按操作困难、信任顾虑、仍在考虑分别回复。',avoid:'不默认用户嫌贵；不连续催付。'},
    {id:'new-logistics',customer_type:'新客',stage:'成交转化',scene:'物流通知',title:'简短告知并留下服务入口',purpose:'完成交付沟通',template:'{{称呼}}，给您同步一下：{{包裹状态}}。您收到后先别急着一起用，拍一下外包装或把到货情况告诉我，我再按您这次的内容逐项说明。',next_turn:'到货后转入服用指导。',avoid:'不把物流消息夹带复购促销。'},
    {id:'new-usage',customer_type:'新客',stage:'售后复购',scene:'服用指导',title:'结合实际内容给一步指导',purpose:'帮助正确开始使用',template:'{{称呼}}，您这次收到的是{{产品}}。先记一个最重要的点：{{核心用法}}。您准备从今天开始，还是明天开始？我按您的时间提醒一次就好。',next_turn:'记录开始日期，设置一次关怀节点。',avoid:'不一次发送冗长说明；涉及用药或特殊人群先提示专业咨询。'},
    {id:'new-effect',customer_type:'新客',stage:'售后复购',scene:'效果追踪',title:'问实际情况，不暗示效果',purpose:'了解执行和体验',template:'上次您说从{{开始日期}}开始用，我来问一句：最近是基本按计划在用，还是中间有几天忘了？有不舒服或不清楚的地方也直接告诉我。',next_turn:'先处理执行或疑问，再讨论周期。',avoid:'不问“效果是不是特别好”；不把主观感受包装成疗效。'},
    {id:'new-repurchase',customer_type:'新客',stage:'售后复购',scene:'周期复购/增购',title:'从库存和真实需求判断',purpose:'自然进入复购或增购',template:'{{称呼}}，想跟您确认一件事：手上现在大概还剩多少？如果还够用就先不急；如果快接不上，我再按原方案和调整方案各算一版。',next_turn:'有需要才提供方案，先问库存再谈活动。',avoid:'不先发促销长图，不用虚假断档焦虑。'},
    {id:'new-referral',customer_type:'新客',stage:'相关裂变',scene:'转介绍邀请',title:'基于满意反馈征得同意',purpose:'自然发起转介绍',template:'您刚才这句反馈我挺开心的，谢谢愿意告诉我。如果身边刚好有人也在了解{{主题}}，您愿意的话可以把我推给他；不方便也完全没关系。',next_turn:'用户同意后再介绍真实权益和参与方式。',avoid:'不让用户群发，不用人情压力换转介绍。'},
    {id:'old-wakeup',customer_type:'存量老客',stage:'沉睡唤醒',scene:'沉睡唤醒',title:'带着记忆回来，不假装熟络',purpose:'确认服务是否仍有价值',template:'{{称呼}}，前阵子您提过{{历史事实}}，我刚整理记录时看到，想问一句：这件事后来解决了吗？如果暂时不需要，我就不继续提醒。',next_turn:'有回复则进入关怀或需求确认；无回复则降低频次。',avoid:'不以“好久没买”开场，不直接发活动。'},
    {id:'old-care',customer_type:'存量老客',stage:'用户关怀',scene:'定期维护',title:'从已知生活节奏自然关怀',purpose:'维持真实关系',template:'{{称呼}}，上次您说{{具体生活/使用情境}}，最近这段时间还顺利吗？我就是顺手问一句，不急着回复。',next_turn:'先聊用户回应的内容，不立即转产品。',avoid:'不使用无法确认的职业、年龄或性格推断作为开场事实。'},
    {id:'old-repurchase',customer_type:'存量老客',stage:'复购增购',scene:'复购增购',title:'先核对库存与变化',purpose:'识别真实复购时点',template:'{{称呼}}，您之前一直在用{{方案}}，我帮您看一眼现在的节奏：家里大概还剩多少？最近需求有没有变化？我先按实际情况判断要不要续，不一定非得照原来买。',next_turn:'确认库存、需求变化后再给原方案/调整方案。',avoid:'不把历史购买直接等同于当前意向。'},
    {id:'old-maintain',customer_type:'存量老客',stage:'定期维护',scene:'节点维护',title:'一次联系只做一件事',purpose:'形成可持续关系节奏',template:'{{称呼}}，今天只来确认一件事：{{明确事项}}。您回我“正常 / 有问题 / 暂停”都可以，我按您的情况处理。',next_turn:'根据三类回复进入服务、答疑或免打扰。',avoid:'不把关怀、调查、促销和裂变塞在同一条消息里。'},
    {id:'old-referral',customer_type:'存量老客',stage:'裂变转介',scene:'权益维护',title:'先感谢，再透明说明权益',purpose:'维护转介关系',template:'谢谢您愿意介绍朋友给我。权益我先说清楚：您这边是{{老客权益}}，朋友是{{新客权益}}，没有隐藏条件。需要我整理一段您方便转发的简短说明吗？',next_turn:'只在用户确认后提供可转发内容。',avoid:'不夸大权益，不泄露被推荐人的购买或咨询信息。'}
  ];
  const historicalLearning={
    source:'脱敏历史触达样本（演示）',scope:'完全模拟的触达汇总，仅用于演示生成规则，不代表真实用户或经营结果',
    totals:{records:120,touches:12000,replies:720,reply_rate:6,conversions:54,reply_to_conversion:7.5,intents:180,deletes:36},
    evidence:[
      {type:'有效信号',title:'具体来由 + 单一低门槛问题',metric:'200触达 / 24回复 / 5成交',rate:'回复率 12%',note:'模拟样本显示单一问题更容易开启对话；数据仅供功能演示。'},
      {type:'有效信号',title:'先问真实使用情况',metric:'240触达 / 18回复',rate:'回复率 7.5%',note:'模拟样本显示使用回访比多轮硬促销更像延续服务。'},
      {type:'有效信号',title:'基于历史记录的个别跟进',metric:'80触达 / 12回复 / 3成交',rate:'回复率 15%',note:'模拟样本显示上下文越具体，越容易形成真实对话。'},
      {type:'风险信号',title:'全量长清单 + 多卖点促销',metric:'800触达 / 12回复',rate:'回复率 1.5%',note:'模拟样本用于展示内容过长时的打扰风险。'},
      {type:'风险信号',title:'稀缺催促式群发',metric:'600触达 / 0回复',rate:'回复率 0%',note:'模拟样本用于展示虚假紧迫感的沟通风险。'}
    ],
    rules:['一句话只承担一个沟通目标','先承接已知事实，再问一个容易回答的问题','用户回复后复述关键词，再进入下一回合','促销、链接和产品长介绍延后到用户明确愿意了解之后','称呼统一采用更亲切的“X哥/X姐”，运营可修改并避免“老师”等生疏称呼','话术中不提及具体购买日期与“多久之前购买”等生疏表达','结合当月活动与知识库内容自然穿插，但不虚构活动','最多使用一个自然表情，专业或谨慎型用户默认不用','不虚构库存、优惠、历史效果或客户关系']
  };
  const taskCategories=[
    {code:'daily',label:'每日用户触达',icon:'日',description:'新用户与日常服务触达'},
    {code:'intent',label:'意向逐层跟进',icon:'阶',description:'按低、中、高意向推进下一步'},
    {code:'purchase_care',label:'购买后定期关怀',icon:'护',description:'围绕实际使用、节奏与疑问关怀'},
    {code:'birthday',label:'生日关怀',icon:'生',description:'先祝福，再由用户决定是否继续沟通'},
    {code:'public_event',label:'公共事件关怀',icon:'讯',description:'天气、交通、节假日等中性公共信息'},
    {code:'reactivation',label:'沉默用户唤醒',icon:'醒',description:'低压力确认是否仍需要服务'},
    {code:'reply',label:'客户消息回复',icon:'回',description:'优先处理当前客户消息'}
  ];
  const ofTier=tier=>customers.filter(c=>c.persona.value_tier===tier);
  const pick=(arr,i)=>arr[Math.min(i,arr.length-1)]||customers[0];
  const focus=c=>c.product_focus||'NMN焕活方案';
  const concern=c=>String(c.persona.concerns||'').trim()||'使用节奏与可见变化';
  const buyer1=pick(ofTier('已购活跃'),0),buyer2=pick(ofTier('已购活跃'),1),buyer3=pick(ofTier('已购活跃'),2);
  const high1=pick(ofTier('高价值'),0),high2=pick(ofTier('高价值'),1),high3=pick(ofTier('高价值'),2),high4=pick(ofTier('高价值'),3);
  const novice1=pick(ofTier('待培育'),0),novice2=pick(ofTier('待培育'),1);
  const sleeper1=pick(ofTier('沉睡'),0),sleeper2=pick(ofTier('沉睡'),1);
  let tasks=[
    {id:'t1',customer_id:high1.id,category:'reply',type:'回复客户',funnel:'高意向·顾虑处理',reason:`客户在关注${focus(high1)}时提出追问`,objective:'获得对安全或预算重点的明确反馈',touch_angle:'先认可谨慎，再给一个二选一问题',prompt:`客户当前关注${concern(high1)}，希望得到简短、可信的解释。`,previous_touch:high1.persona.recency_label,recommended_scene:'objection',optimization_hint:'长段解释开口率偏低，本轮控制在八十字内并只留一个二选一问题',due:'今天 10:30',status:'pending'},
    {id:'t2',customer_id:novice1.id,category:'daily',type:'首次触达',funnel:'新线索·建立对话',reason:'名单已同步，尚未建立有效沟通',objective:'完成首次有效开口并采集需求',touch_angle:`从${focus(novice1)}的自然使用场景开场，不直接推荐产品`,prompt:`用户为待培育层级、互动${novice1.persona.engagement}，先完成一次低压力建联。`,previous_touch:'尚未人工触达',recommended_scene:'ice_break',optimization_hint:'低意向新客用一个易答问题开场，不直接问购买计划',due:'今天 11:00',status:'pending'},
    {id:'t3',customer_id:high2.id,category:'intent',type:'意向二次跟进',funnel:'中高意向·顾虑确认',reason:`用户此前关注${focus(high2)}后暂未推进`,objective:'确认暂未推进的真实卡点',touch_angle:'延续关注点，只确认一个卡点并保留退出选项',prompt:`用户价值层级较高，此前关注${concern(high2)}，适合今天做一次温和跟进。`,previous_touch:high2.persona.recency_label,recommended_scene:'follow',optimization_hint:'承接其关注点，只确认一个卡点，并保留退出选项',due:'今天 14:00',status:'pending'},
    {id:'t4',customer_id:sleeper1.id,category:'reactivation',type:'沉默用户唤醒',funnel:'沉睡·已读未回',reason:'近期互动减少，处于沉睡层级',objective:'确认是否仍需要继续提供信息',touch_angle:'只发一条独立可读要点，明确可暂停',prompt:`用户互动${sleeper1.persona.engagement}、关系温度${sleeper1.persona.warmth}，先做低打扰确认。`,previous_touch:sleeper1.persona.recency_label,recommended_scene:'follow',optimization_hint:'沉睡用户不连续追问；使用一句价值信息加明确退出选项',due:'今天 20:10',status:'pending'},
    {id:'t5',customer_id:high3.id,category:'intent',type:'发送结构化对比',funnel:'中意向·信息比较',reason:`用户主动了解${focus(high3)}的主要区别`,objective:'帮助用户完成比较并确认下一问题',touch_angle:'只围绕用户关心的维度做对比，结尾留一个问题',prompt:`用户愿意看结构化信息，关注${concern(high3)}，需要一版清晰但不过长的对比。`,previous_touch:high3.persona.recency_label,recommended_scene:'consult',optimization_hint:'长清单群发开口率较低；本次只围绕用户关心的维度比较，结尾保留一个问题',due:'今天 19:00',status:'pending'},
    {id:'t6',customer_id:high4.id,category:'reply',type:'即时回复',funnel:'高意向·方案比较',reason:'当前对话等待回复',objective:'澄清优先目标并给出分步选择',touch_angle:'认可其比较习惯，先问目标再谈搭配',prompt:`用户在比较方案，关注${concern(high4)}，愿意多轮沟通，不需要催促。`,previous_touch:high4.persona.recency_label,recommended_scene:'consult',optimization_hint:'高意向用户减少泛化介绍，直接围绕其问题给下一步',due:'立即',status:'pending'},
    {id:'t7',customer_id:buyer1.id,category:'purchase_care',type:'第14天使用关怀',funnel:'已购买·使用中',reason:'购买记录进入近期使用关怀节点',objective:'确认实际使用节奏、疑问与是否需要服务',touch_angle:'先问实际感受和执行情况，不预设效果',prompt:`用户有购买记录，本轮中性询问使用情况和遇到的问题。`,previous_touch:'上次完成过使用方式确认',recommended_scene:'follow',optimization_hint:'关怀消息避免暗示必然效果，先问是否按计划使用',due:'今天 17:30',status:'pending'},
    {id:'t8',customer_id:buyer2.id,category:'purchase_care',type:'第30天定期关怀',funnel:'已购买·周期复盘',reason:'购买记录进入周期复盘节点',objective:'了解实际体验并提供必要说明',touch_angle:'先问执行情况，再按用户回复复盘',prompt:`用户有购买记录、互动${buyer2.persona.engagement}，偏好事实与结构化复盘。`,previous_touch:'此前曾询问使用节奏',recommended_scene:'follow',optimization_hint:'使用回访比多卖点群发更容易形成回复；本轮先只问是否按计划使用',due:'明天 10:20',status:'pending'},
    {id:'t9',customer_id:buyer3.id,category:'birthday',type:'生日关怀',funnel:'会员服务·非销售优先',reason:'进入会员服务关怀节点',objective:'完成真诚祝福并确认服务偏好',touch_angle:'结合已知资料表达祝福，不在首条消息附产品链接',prompt:'用户进入关怀节点，首要目标是服务关怀，不做强销售。',previous_touch:'此前有正常服务互动',recommended_scene:'ice_break',optimization_hint:'本轮按单一沟通目标原则仅送祝福，不夹带促销',due:'今天 09:40',status:'pending'},
    {id:'t10',customer_id:sleeper2.id,category:'public_event',type:'公共事件关怀',funnel:'服务关系·中性关怀',reason:'进入公共信息关怀节点',objective:'确认出行或生活是否受影响，不绑定产品销售',touch_angle:'发送简短中性提醒，不附营销信息',prompt:'仅基于公开天气或交通信息进行中性问候，不讨论政治立场，不附营销信息。',previous_touch:'近30天无公共事件类关怀',recommended_scene:'ice_break',optimization_hint:'公共事件触达只在信息与所在地匹配且授权有效时执行',due:'今天 08:50',status:'pending'},
    {id:'t11',customer_id:novice2.id,category:'daily',type:'新用户基础触达',funnel:'低意向·初步了解',reason:'名单已进入首次问卷后24小时',objective:'让用户选一个最容易回答的问题',touch_angle:'跳出产品介绍，从日常节奏与信息偏好切入',prompt:`用户互动${novice2.persona.engagement}，先从一个低门槛生活问题自然开口。`,previous_touch:'尚未进行人工触达',recommended_scene:'ice_break',optimization_hint:'低意向新客使用生活场景问题，不直接问购买计划',due:'明天 18:30',status:'pending'}
  ];
  let optimizationVersion=3;
  const performance=()=>({date_label:'演示昨日',is_demo:true,metrics:{assigned:100,completed:88,opening_rate:62,reply_rate:35,intent_rate:22,conversion_rate:8,care_positive_rate:70},deltas:{opening_rate:4,reply_rate:2,intent_rate:1,conversion_rate:-1},by_category:[{label:'客户消息回复',opening_rate:90,intent_rate:45,conversion_rate:16},{label:'意向逐层跟进',opening_rate:70,intent_rate:32,conversion_rate:12},{label:'购买后定期关怀',opening_rate:75,intent_rate:20,conversion_rate:7},{label:'生日关怀',opening_rate:82,intent_rate:12,conversion_rate:4},{label:'沉默用户唤醒',opening_rate:30,intent_rate:8,conversion_rate:2}],optimization:{version:`D+1 V${optimizationVersion}`,generated_at:now(),winners:['具体来由 + 单一问题：模拟样本200触达、24回复','基于模拟记录的个别跟进：80触达、12回复、3成交','模拟使用回访：240触达、18回复，优先于直接推活动'],adjustments:['模拟长清单样本800触达仅12回复，今日拆成单问题','模拟催促批次600触达0回复，默认禁用虚假紧迫感','称呼统一采用更亲切的“X哥/X姐”，并移除购买日期等生疏表达'],today_focus:'先开口、再判断、后推进：承接演示上下文，每条消息只留一个容易回答的问题，收到回复后再进入下一回合。',next_review:'今日 18:30 自动复盘'}});
  let loggedIn=false,sequence=100;
  const conversations=new Map(customers.map(c=>[c.id,{id:c.id,customer_id:c.id,scene:'consult',messages:[{role:'operator',content:`您好${c.name.slice(0,1)}老师，上次关注的内容还有哪里需要我说明吗？`,time:'前次沟通'},{role:'customer',content:c.last_message,time:c.last_time}],suggestion:null}]));
  const ok=(data,status=200)=>Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail=(message,status=404)=>Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const body=options=>{try{return JSON.parse(options?.body||'{}')}catch{return {}}};
  const customer=id=>customers.find(x=>x.id===Number(id));
  const maskPhone=v=>String(v||'').replace(/\D/g,'').slice(-4);
  function newCustomer(p){
    const name=String(p.name||'').trim(),phone=maskPhone(p.phone),owner=String(p.owner||'').trim(),remark=String(p.remark||'').trim();
    if(!name)return fail('客户姓名不能为空',400);
    if(phone.length!==4)return fail('手机号后四位必须为 4 位数字，请勿上传完整手机号',400);
    if(!owner)return fail('归属顾问不能为空',400);
    const salutation=String(p.salutation||'').trim()||inferSalutation(name,remark);
    const city=String(p.city||'').trim()||'待补充';
    const product_focus=String(p.product_focus||'').trim()||'待确认';
    const categoryNames=Object.fromEntries(categories.map(x=>[x.code,x.name]));
    const assetCodes=[...(Array.isArray(p.assetCodes)?p.assetCodes:[])].filter(code=>categoryNames[code]);
    const codes=assetCodes.length?assetCodes:['regular'];
    const id=customers.reduce((m,c)=>Math.max(m,c.id),0)+1;
    const persona={age_band:'待确认',gender:'未标注',occupation:'待确认（暂无推断依据）',life_stage:'待确认',personality:'待观察',decision_style:'暂无足够依据，先以用户自述为准',content_preference:'待观察',available_time:'待确认',non_health_topics:[],intention_score:0,conversion_probability:0,confidence:0,sources:['人工录入基础信息']};
    const c={id,name,salutation,phone,city,owner,remark,member:'未绑定会员',stage:'待首次触达',priority:'中',assetCodes:codes,product_focus,last_message:'新录入客户，尚未产生沟通记录',last_time:'刚刚录入',next_action:'完成首次真实沟通，采集明确需求与授权边界',next_at:'待安排',consent:'待确认授权',traits:['新录入','待采集'],facts:['录入时仅确认基础归属信息'],purchase:[],persona,assets:codes.map(code=>({code,name:categoryNames[code],basis:'人工归属'})),ai_profile:{summary:`${salutation||name}刚刚录入，暂无足够事实用于生成内部判断。请先通过首次真实沟通采集需求与授权边界，再生成辅助摘要。`,tags:['新录入','待采集需求','未生成推断'],confidence:0,generated_at:now(),evidence:[{label:'仅确认客户姓名、基础归属与授权状态',source:'人工录入'}],guardrails:['不承诺疾病治疗效果','不把推断描述成用户事实','不按政治立场或敏感属性定向沟通','发送前由运营人员确认']},interactions:[{type:'系统记录',content:'客户由运营人员新录入，尚未开始触达',time:'刚刚',channel:'运营中台'}]};
    customers.push(c);
    conversations.set(id,{id,customer_id:id,scene:'consult',messages:[{role:'operator',content:`${salutation||name}您好，我是负责您的顾问${owner}，先和您确认一下目前最想了解的内容。`,time:'待发送'}],suggestion:null});
    refreshCategoryCounts();
    refreshSegmentCounts();
    return ok(c,201);
  }
  async function importCustomers(p){
    const rows=Array.isArray(p.rows)?p.rows:[];
    if(!rows.length)return fail('至少需要一行客户数据',400);
    if(rows.length>500)return fail('单次最多导入 500 位客户',400);
    const seen=new Set(),errors=[];
    rows.forEach((row,index)=>{
      if(!row||typeof row!=='object'){errors.push(`第 ${index+1} 行不是有效客户记录`);return}
      const name=String(row.name||'').trim(),phone=maskPhone(row.phone),owner=String(row.owner||'').trim();
      const missing=['姓名','手机号','归属顾问'].filter((label,i)=>![name,phone,owner][i]);
      if(missing.length)errors.push(`第 ${index+1} 行缺少：${missing.join('、')}`);
      if(phone&&phone.length!==4)errors.push(`第 ${index+1} 行手机号后四位必须为 4 位数字`);
      const key=`${name}|${phone}`;
      if(seen.has(key))errors.push(`第 ${index+1} 行与前面记录重复：${name} / ${phone}`);
      seen.add(key);
    });
    if(errors.length)return fail(errors.slice(0,5).join('；')+(errors.length>5?`；另有 ${errors.length-5} 条错误`:''),400);
    const created=[];
    for(const row of rows){
      const response=await newCustomer(row);
      const json=await response.json();
      created.push(json.data);
    }
    return ok({imported:created.length,customers:created,ids:created.map(c=>c.id)},201);
  }
  const openingName=c=>{
    const raw=String(c.salutation||c.name||'').trim().replace(/\s+/g,'').replace(/\d{7,}/g,'');
    if(!raw)return '您好';
    if(/哥|姐/.test(raw))return raw;
    if(/先生/.test(raw))return raw.replace('先生','哥');
    if(/女士|小姐/.test(raw))return raw.replace(/女士|小姐/,'姐');
    return raw;
  };
  const openingOwner=c=>String(c.owner||'').replace(/^营养师/,'').trim()||'您的顾问';
  const openingPurchase=c=>{
    const lp=c.last_purchase||{};
    const remark=parsePurchaseRemark(c.remark);
    const source=String(lp.product||remark.product||String(c.product_focus||'').split('、')[0]||'').trim();
    const token=productTokenMap.find(x=>x.re.test(source));
    const product=token?token.label:(source?source.replace(/产品|方案/g,'').trim()||'产品':'产品');
    return {
      product,
      quantity:lp.quantity||remark.quantity||null,
      purchased:Boolean(lp.hasPurchase||remark.hasPurchase||(c.purchase||[]).some(x=>/购买/.test(String(x))))
    };
  };
  const openingContactPaused=c=>/不触|不要发|勿扰|别发|暂停|拒绝/.test(`${c.remark||''}${c.consent||''}`)||String(c.stage).includes('暂停');
  const openingConcernKind=concern=>{
    if(/效果|作用|成分|来源|安全/.test(concern))return 'effect';
    if(/价格|预算|费用|花费/.test(concern))return 'price';
    if(/物流|发货|快递|售后/.test(concern))return 'logistics';
    if(/复购|库存|补货/.test(concern))return 'repurchase';
    if(/睡眠|精力|状态/.test(concern))return 'daily_state';
    return 'general';
  };
  const openingActivityClause=(kind,brief)=>{
    if(!brief||['sleep_wakeup','fresh_start','logistics_service','safety_boundary'].includes(kind))return '';
    if(kind==='repurchase_inventory')return `这个月「${brief}」有安排，需要的话我一并帮您看。`;
    if(kind==='usage_care')return `这个月「${brief}」有安排，我先不展开，等您方便我再补。`;
    if(kind==='concern_solution')return `这个月「${brief}」也有搭配，我按您关心的那一点先筛。`;
    if(kind==='high_intent_plan')return `这个月「${brief}」有安排，我看看哪一种贴合您的节奏。`;
    return '';
  };
  const openingHash=value=>{const text=String(value||'');let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return Math.abs(h)};
  const openingPick=(list,c,seed='')=>list[openingHash(`${c.id}|${c.name}|${c.remark||''}|${c.owner||''}|${seed}`)%list.length]||list[0];
  const openingOwnerShort=c=>String(c.owner||'').replace(/^营养师/,'').trim()||'您的顾问';
  const openingIdentity=c=>{
    const p=c.persona||{},stage=String(c.stage||''),channel=String(c.consent||'');
    const warmth=String(p.warmth||''),engagement=String(p.engagement||''),loyalty=String(p.loyalty||''),tier=String(p.value_tier||'');
    return {
      owner:openingOwnerShort(c),city:String(c.city||'').trim(),stage,warmth,engagement,loyalty,tier,channel,
      familiar:warmth==='高'||['对话中','待回复','待跟进'].includes(stage),
      active:/近一周|近一月/.test(String(p.available_time||'')),
      silent:/长期未活跃|沉睡/.test(String(p.available_time||''))||stage==='已读未回',
      consentConfirmed:/确认|有效|授权/.test(channel)&&!/需确认|待确认|拒绝/.test(channel)
    };
  };
  const openingContext=c=>{
    const p=c.persona||{};
    const product=openingPurchase(c).product;
    const items=String(c.product_focus||'').split(/[、，,]/).map(x=>x.trim()).filter(Boolean);
    const altProduct=items.find(x=>x!==product&&/NMN|麦角硫因|辅酶|PQQ|小仙弹|维生素|叶黄素/.test(x));
    const note=String(c.remark||'').trim();
    const tokens=[
      ...note.match(/包裹卡|药盒|礼盒|会员|朋友|推荐|活动|半价/g)||[],
      ...note.match(/(?:三|四|五|六|七|八|九|十|\d+)瓶/g)||[]
    ];
    return {...openingIdentity(c),concern:String(p.concerns||'').trim(),product,altProduct,note,tokens:[...new Set(tokens)].slice(0,2)};
  };
  function openingScriptTrio(c,kind,seed,make){
    const variants=[0,1,2].map(make);
    const direct=openingPick(variants,c,`${kind}|${seed}|first`);
    const rest=variants.filter(x=>x!==direct);
    const restrained=openingPick(rest,c,`${kind}|${seed}|second`);
    const consultant=rest.find(x=>x!==restrained)||variants[1]||direct;
    return {direct,restrained,consultant};
  }
  function openingAngle(c){
    const ctx=openingContext(c);
    const tokens=ctx.tokens||[];
    if(tokens.includes('半价'))return '先不把优惠当成承诺，我帮您核对适不适合';
    if(tokens.includes('药盒')||tokens.includes('包裹卡'))return '我先帮您把收货、收纳和使用提醒理顺';
    if(tokens.includes('朋友')||tokens.includes('推荐'))return '不把推荐关系当成压力，先看您自己的节奏';
    const bottle=tokens.find(x=>/瓶/.test(x));
    if(bottle)return `我先按${bottle}的量帮您看节奏`;
    if(ctx.altProduct)return `我先帮您把${ctx.product}和${ctx.altProduct}的顺序分开安排`;
    if(/效果|成分|安全/.test(ctx.concern))return '先把您最关心的作用边界说清楚，再谈别的';
    if(/价格|预算|花费/.test(ctx.concern))return '先把必要项和预算边界分开，不做多余推荐';
    if(/物流|售后/.test(ctx.concern))return '先把服务和收货这件事处理顺';
    if(/睡眠|精力|状态/.test(ctx.concern))return '先看当前节奏，再决定要不要调整';
    if(ctx.familiar)return '先承接您最近的状态，再决定下一步';
    if(ctx.silent)return '只留一个很轻的入口，方便您选继续或暂停';
    if(ctx.engagement==='高频')return '我尽量一句说清楚，不占用您太多时间';
    return '先用一个容易回答的问题确认方向';
  }
  function openingPersonalBit(c){
    const ctx=openingContext(c);
    if(ctx.loyalty==='高')return '我按您原来的习惯先整理。';
    if(ctx.familiar)return '我先按您熟悉的方式记下来。';
    if(ctx.active)return '您看到消息时回我就行。';
    if(ctx.silent)return '不用马上回，我先登记这个方向。';
    if(/价格|预算|花费/.test(ctx.concern))return '花费这边我先帮您卡住。';
    if(/物流|售后/.test(ctx.concern))return '服务这边我先盯住。';
    if(/效果|成分|安全/.test(ctx.concern))return '成分和用法我先分开讲。';
    return '我先按您方便的节奏安排。';
  }
  function openingReplyRoutes(kind,product){
    const commonNoReply={type:'本轮未回复',advisor_next:'登记本次尝试，7天内不重复同一入口，下次换更轻的服务问题。',profile_value:'记录有效开场方式和沉默边界。',conversion_value:'避免连续追问压低后续回复率。'};
    if(kind==='repurchase_inventory'){
      return [
        {type:'愿意回复',advisor_next:'先确认剩余量和当前节奏；用户确认后再谈是否补，不先报活动。',profile_value:'沉淀产品剩余量、使用节奏和复购周期。',conversion_value:'把复购判断放在库存事实之后，减少被误解成催单。'},
        {type:'犹豫或提问',advisor_next:'只回答用户问的那一点，再问是否需要把用法和搭配一起核一遍。',profile_value:'沉淀具体卡点，例如效果预期、花费或用法。',conversion_value:'把“要不要买”转成“现在适不适合”。'},
        {type:'拒绝或暂停',advisor_next:'接受边界，停止库存提醒，只保留用户主动咨询入口。',profile_value:'记录暂停范围和不催复购偏好。',conversion_value:'保住长期信任，等下一次自然需求出现。'},
        commonNoReply
      ];
    }
    if(kind==='usage_care'){
      return [
        {type:'愿意回复',advisor_next:'先承接用户的实际体验，再确认是否需要调整用法；不先追加推荐。',profile_value:'沉淀当前使用节奏、体感表述和关注点。',conversion_value:'从服务确认进入下一轮精准复购或搭配。'},
        {type:'犹豫或提问',advisor_next:'用知识库回应使用方式、成分边界或搭配，再问是否合适。',profile_value:'沉淀关心点和决策方式。',conversion_value:'把模糊回应变成可跟进的具体需求。'},
        {type:'拒绝或暂停',advisor_next:'停止关怀触达，记录免打扰范围；用户主动咨询时再恢复。',profile_value:'沉淀打扰信号和暂停授权。',conversion_value:'减少流失风险，保留高价值用户关系。'},
        commonNoReply
      ];
    }
    if(kind==='sleep_wakeup'){
      return [
        {type:'愿意回复',advisor_next:'根据“继续看”或“先停停”给一个轻量下一步，不立刻发长资料。',profile_value:'沉淀当前意愿和偏好入口。',conversion_value:'先恢复对话，再筛选值得投入的用户。'},
        {type:'犹豫或提问',advisor_next:'回应一个问题后，把话题收缩成单点确认。',profile_value:'沉淀仍存在的兴趣和具体顾虑。',conversion_value:'把沉默用户转回可判断的漏斗阶段。'},
        {type:'拒绝或暂停',advisor_next:'立即停止同类唤醒，转人工确认暂停范围。',profile_value:'记录明确拒绝和免打扰要求。',conversion_value:'避免不可逆打扰，保留主动找回机会。'},
        commonNoReply
      ];
    }
    if(kind==='logistics_service'){
      return [
        {type:'愿意回复',advisor_next:'先处理物流或售后事实，完成后再确认是否需要使用安排。',profile_value:'沉淀售后事件、处理结果和响应偏好。',conversion_value:'用服务修复关系，提高下一次开口回复率。'},
        {type:'犹豫或提问',advisor_next:'按用户描述确认单点，不扩散到产品推荐。',profile_value:'沉淀真实阻塞和沟通渠道偏好。',conversion_value:'先把阻塞解除，再进入正常运营节奏。'},
        {type:'拒绝或暂停',advisor_next:'尊重边界，但保留“有事找我”的服务入口。',profile_value:'记录当前沟通边界和原因。',conversion_value:'防止售后问题被继续推销放大。'},
        commonNoReply
      ];
    }
    if(kind==='concern_solution'){
      return [
        {type:'愿意回复',advisor_next:'按用户选中的单点给一页式解释，结尾确认是否符合其情况。',profile_value:'沉淀优先顾虑和接受的信息颗粒度。',conversion_value:'把解释成本降低，方便下一步自然推进。'},
        {type:'犹豫或提问',advisor_next:'不连续补内容，先让用户挑最想解决的一点。',profile_value:'沉淀决策顺序和顾虑强度。',conversion_value:'防止多卖点同时推进导致犹豫。'},
        {type:'拒绝或暂停',advisor_next:'接受暂停，把未解决的顾虑写入画像，不追加优惠。',profile_value:'记录未解决卡点和暂停授权。',conversion_value:'保留未来用新信息恢复沟通的机会。'},
        commonNoReply
      ];
    }
    if(kind==='high_intent_plan'){
      return [
        {type:'愿意回复',advisor_next:'先确认适用范围和预算边界，再给一条不夸张的下一步。',profile_value:'沉淀准备阶段、预算范围和方案偏好。',conversion_value:'让用户自己确认推进节奏，降低成交阻力。'},
        {type:'犹豫或提问',advisor_next:'只补充一个关键事实，再问是否进入明细。',profile_value:'沉淀犹豫原因和信息偏好。',conversion_value:'把高意向转成可核对的方案步骤。'},
        {type:'拒绝或暂停',advisor_next:'停止推进，登记“暂不安排”和时间。',profile_value:'记录推迟原因和下次复核时间。',conversion_value:'避免高意向用户因催促流失。'},
        commonNoReply
      ];
    }
    if(kind==='fresh_start'){
      return [
        {type:'愿意回复',advisor_next:'先承接用户选择，再问一个具体使用场景。',profile_value:'沉淀当前阶段、兴趣方向和沟通入口。',conversion_value:'首次回复是分层依据，决定后续投入强度。'},
        {type:'犹豫或提问',advisor_next:'只回答一个基础知识问题，不发送长介绍。',profile_value:'沉淀认知水平和优先关注点。',conversion_value:'降低首次决策压力，建立顾问身份。'},
        {type:'拒绝或暂停',advisor_next:'停止主动建联，只保留用户主动咨询入口。',profile_value:'记录首次触达结果和边界。',conversion_value:'避免名单资源被低质量触达消耗。'},
        commonNoReply
      ];
    }
    return [
      {type:'愿意回复',advisor_next:`承接回复中的关键词，再确认${product}相关的下一步。`,profile_value:'沉淀本次有效话题和回复偏好。',conversion_value:'让对话继续向服务或需求确认推进。'},
      {type:'犹豫或提问',advisor_next:'用知识库回应单点，再把话题收缩成二选一。',profile_value:'沉淀具体问题和信息偏好。',conversion_value:'减少信息过载，提高可跟进度。'},
      {type:'拒绝或暂停',advisor_next:'接受边界并停止同类触达。',profile_value:'记录拒绝原因和暂停授权。',conversion_value:'保护长期关系，等待自然需求。'},
      commonNoReply
    ];
  }
  function buildOpeningStrategy(c,task,scene,sensitive){
    const p=c.persona||{};
    const displayName=openingName(c);
    const ownerShort=openingOwner(c);
    const purchase=openingPurchase(c);
    const product=purchase.product;
    const concern=String(p.concerns||'').trim();
    const concernKind=openingConcernKind(concern);
    const recency=Number(p.recency_days);
    const warmth=p.warmth;
    const contactPaused=openingContactPaused(c);
    const act=activityBrief();
    const variation=(Number(c.id)||1)%3;
    let kind='fresh_start',name='新客破冰',hook='名单已归属，但缺少真实需求事实，先用低压力选择建立联系。';
    let direct='',restrained='',consultant='';
    if(contactPaused){
      kind='paused_review';name='暂停复核';hook='备注或状态包含不触达、暂停或拒绝信号；本轮只做人工复核，不发送营销开口。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,'pause',i=>[
        `${displayName}，我先不主动发产品内容。您方便的时候回个“继续”或“先停”，我按您说的登记。`,
        `${displayName}，备注里这边需要复核一下。我先不打扰，您想继续或暂停时说一声就好。`,
        `${displayName}，我先停掉这类消息。后面您愿意继续看，还是保持暂停？回一个词就行。`
      ][i]));
    }else if(sensitive){
      kind='safety_boundary';name='专业边界';hook='用户消息涉及医疗判断，先守住专业边界，再提供公开资料。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,'safety',i=>[
        `${displayName}，这件事建议先问医生或药师。我可以把${product}的公开成分和注意事项整理给您，方便您带去确认。`,
        `${displayName}，这个我不替您下结论。您问医生或药师会更稳妥，要不要我整理一份${product}的成分和注意要点，您带着去确认。`,
        `${displayName}，先以医生或药师的意见为准。我先帮您准备${product}的公开资料，您确认后我再把适合带去咨询的部分发您。`
      ][i]));
    }else if(task?.category==='birthday'){
      kind='birthday_touch';name='生日关怀';hook='只送祝福，不夹带产品；关系较熟时才留一个低压力问候。';
      if(warmth==='高'){
        direct=`${displayName}，提前祝您生日快乐。今天就是来送祝福，家里和最近状态都顺顺利利。`;
        restrained=`${displayName}，生日快乐。今天不用特意回我，等您方便我再联系。`;
        consultant=`${displayName}，生日快乐。最近有没有好好休息？有需要我安排的地方直接说。`;
      }else{
        direct=`${displayName}，提前祝您生日快乐，愿新的一岁顺心顺利。`;
        restrained=`${displayName}，生日快乐。我就不打扰了，后续有需要随时找我。`;
        consultant=`${displayName}，祝您生日快乐。如果最近有想安排的事，我也可以帮您提前确认。`;
      }
    }else if(task?.category==='public_event'){
      kind='public_service';name='中性提醒';hook='公共信息只做服务提醒，不加入营销和购买建议。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,'public',i=>[
        `${displayName}，最近${c.city||'您所在地'}天气变化比较大，出门多留一点时间，注意安全。`,
        `${displayName}，顺手提醒一下天气和出行。不用特意回我。`,
        `${displayName}，${c.city||'您所在地'}出行可能有影响。需要我帮您整理一份简短注意事项吗？`
      ][i]));
    }else if(task?.category==='purchase_care'||(purchase.purchased&&concernKind==='repurchase')){
      kind='repurchase_inventory';name='库存确认';hook=`已购线索是${product}；不提购买间隔，直接用剩余量让用户易答。`;
      if(concernKind==='price'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|price`,i=>[
          `${displayName}，您的${product}大概还剩多少？只回“有”或“没有”就行，我帮您判断要不要补，不做多余推荐。`,
          `${displayName}，${product}还剩多少？您方便时说一声就好，我先不推方案。`,
          `${displayName}，您的${product}用到现在，剩余量大概是什么情况？我先帮您把补或不补算清楚。`
        ][i]));
      }else if(concernKind==='effect'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|effect`,i=>[
          `${displayName}，您的${product}用得还顺吗？如果顺手，我再帮您看剩余量；如果没达预期，我先帮您调整用法。`,
          `${displayName}，${product}还剩多少？方便时回一下就行，不顺的地方我等您说。`,
          `${displayName}，您的${product}现在还剩多少？我先按这个和您的用法一起看，不给您乱加搭配。`
        ][i]));
      }else{
        const q=purchase.quantity?`我看线索里记到${purchase.quantity}，`:'';
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|${q}`,i=>[
          `${displayName}，您的${product}大概还剩多少？您回个数字就行，我按节奏帮您看。`,
          `${displayName}，${q}您的${product}还剩几瓶？方便时回一下，我帮您确认要不要安排。`,
          `${displayName}，您的${product}还剩多少？如果快见底了，我先帮您核对；不着急也告诉我。`,
          `${displayName}，${q}我帮您看${product}的量。回“够”或“不够”就行，我按您的选择处理。`,
          `${displayName}，${product}这边的量还好吗？够用我先不安排，接不上我再帮您排。`
        ][i]));
      }
    }else if(task?.category==='purchase_care'||purchase.purchased){
      kind='usage_care';name='使用关怀';hook=`已知${product}购买线索；先关心使用体验，不先提复购。`;
      if(concernKind==='logistics'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|logistics`,i=>[
          `${displayName}，您的${product}和物流都还好吧？如果都收到了，回一下就行。`,
          `${displayName}，${product}这边有没有需要我处理的？没有的话我就不打扰了。`,
          `${displayName}，我先确认${product}和服务有没有卡点。方便的话告诉我目前状态。`
        ][i]));
      }else if(concernKind==='price'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|price-care`,i=>[
          `${displayName}，您现在的${product}用得顺吗？我先不聊加购，只确认节奏。`,
          `${displayName}，${product}用着怎么样？您方便时回一句就好。`,
          `${displayName}，您的${product}目前怎么安排的？我按实际情况帮您看，不额外增加花费。`
        ][i]));
      }else if(warmth==='高'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|warm`,i=>[
          `${displayName}，最近还好吗？您的${product}用得顺不顺手？`,
          `${displayName}，最近忙不忙？${product}的节奏有没有需要我帮您调一下？`,
          `${displayName}，先问一句，您现在的${product}用着还习惯吗？`,
          `${displayName}，我是${ownerShort}，顺手问一下${product}最近用得怎么样？`,
          `${displayName}，最近状态还好吧？${product}那边需要我帮您微调吗？`
        ][i]));
      }else{
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|care`,i=>[
          `${displayName}，先不聊别的，您的${product}用得顺不顺手？`,
          `${displayName}，${product}这边方便时回一下就好，不顺的地方也可以直接说。`,
          `${displayName}，您的${product}现在用得怎么样？我按实际情况帮您看。`,
          `${displayName}，我是${ownerShort}。${product}用起来有疑问的话，直接丢给我就行。`,
          `${displayName}，${product}按现在的节奏还行吗？我先帮您看要不要调整。`
        ][i]));
      }
    }else if(task?.category==='reactivation'||String(c.stage).includes('已读未回')||(Number.isFinite(recency)&&recency>45&&p.messages<=6)){
      kind='sleep_wakeup';name='沉睡唤醒';hook='长期沉默用户只给“继续/暂停”二选一，降低回复成本。';
      if(concernKind==='price'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'sleep-price',i=>[
          `${displayName}，我不推新品。您是想先暂停，还是只看一版更省的搭配？`,
          `${displayName}，回“停”或“看”两个字就行，我按您的选择来。`,
          `${displayName}，咱们可以先只看预算这一件事：继续了解，还是先暂停？`,
          `${displayName}，我不给您加东西。您看是先停一停，还是只核一个更省的安排？`
        ][i]));
      }else if(warmth==='高'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'sleep-warm',i=>[
          `${displayName}，最近忙吗？一句“继续看”或“先停停”就行。`,
          `${displayName}，最近还好吗？不用长回，一个字我就明白。`,
          `${displayName}，您现在想继续了解，还是先放一放？我按您说的安排。`,
          `${displayName}，我是${ownerShort}。您方便时说“继续”或“暂停”，我就不再追问。`
        ][i]));
      }else{
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'sleep-quiet',i=>[
          `${displayName}，您还想继续了解吗？回“看”或“停”两个字就好。`,
          `${displayName}，如果您暂时不需要，我就不再发；想继续了解时回“看”。`,
          `${displayName}，我这边先不推内容。您看是继续了解，还是先暂停？`,
          `${displayName}，我先不占时间。您想让我继续陪您看，还是先安静下来？`
        ][i]));
      }
    }else if(concernKind==='logistics'){
      kind='logistics_service';name='售后先行';hook='已有售后物流信号；先处理服务事实，不混入推荐。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,'logistics',i=>[
        `${displayName}，您之前关心的物流我先跟一下：现在还有没落实的地方吗？`,
        `${displayName}，物流那边还有问题吗？没有我就先不打扰。`,
        `${displayName}，我先确认物流或售后有没有卡点。您方便时告诉我，我先处理这一件事。`,
        `${displayName}，我先只处理服务这一件事。物流、收货或使用里哪个还没顺？`
      ][i]));
    }else if(['effect','price'].includes(concernKind)||(concern&&concern!=='使用与复购')){
      kind='concern_solution';name='顾虑拆解';hook=`画像里有「${concern}」；把多个顾虑压成一个可答选择。`;
      if(concernKind==='effect'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'concern-effect',i=>[
          `${displayName}，关于${product}，您最想先弄清楚成分来源、使用方式，还是适合范围？`,
          `${displayName}，咱们先不推进。您想先看哪一点，还是先放一放？`,
          `${displayName}，我先把${product}里您最关心的“是否适合”讲清楚。您想从成分还是用法开始？`,
          `${displayName}，${product}这件事我不做判断。您想先看来源、用法，还是适合边界？`
        ][i]));
      }else if(concernKind==='price'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'concern-price',i=>[
          `${displayName}，咱们先不推方案。您更想先算一个周期的预算，还是先看哪些搭配可以先不买？`,
          `${displayName}，预算这件事我会帮您卡住。您想先看基础安排，还是先暂停？`,
          `${displayName}，我先把${product}的费用和必要项分开。您想先看哪一块？`,
          `${displayName}，我先不推荐加购。您想让我帮您算基础项，还是先看必买项？`
        ][i]));
      }else{
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,`concern-${concern}`,i=>[
          `${displayName}，您之前更在意${concern}。咱们先解决一个：您想先看方式，还是先看适合范围？`,
          `${displayName}，关于${concern}，您想继续了解还是先放一放？`,
          `${displayName}，我把${concern}拆成一个小问题。您希望我先帮您核对哪一点？`,
          `${displayName}，${concern}这件事我先不展开。您想让我帮您核对方式，还是先确认适不适合？`
        ][i]));
      }
    }else if(task?.category==='intent'||Number(p.intention_score)>=80||warmth==='高'){
      kind='high_intent_plan';name='方案推进';hook='意向或关系温度足够，用推进型问题确认准备阶段。';
      if(concernKind==='repurchase'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'intent-repurchase',i=>[
          `${displayName}，您现在打算继续安排，还是想先对比一下搭配？`,
          `${displayName}，您看是继续了解，还是先放着？我按您的节奏来。`,
          `${displayName}，咱们可以把${product}的下一步定清楚。您想先看安排方式，还是先核对适用情况？`,
          `${displayName}，我不催决定。您想先看${product}的当前安排，还是先看搭配边界？`
        ][i]));
      }else if(warmth==='高'){
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'intent-warm',i=>[
          `${displayName}，您准备先安排，还是想我再核一遍适合情况？`,
          `${displayName}，您方便时定一下方向就行，我不催。`,
          `${displayName}，咱们下一步看安排方式还是适用情况？您选一个，我先核。`,
          `${displayName}，我不着急要答案。您想让我先核安排，还是先核适合情况？`
        ][i]));
      }else{
        ({direct,restrained,consultant}=openingScriptTrio(c,kind,'intent-plan',i=>[
          `${displayName}，关于${product}，您现在更想先看安排方式，还是先确认适用范围？`,
          `${displayName}，您可以先看要点，也可以先放着，方便时告诉我。`,
          `${displayName}，我先不催决定。您想先核对哪一点，我再往下走。`,
          `${displayName}，我是${ownerShort}。${product}这边您想先定节奏，还是先定适用范围？`
        ][i]));
      }
    }else if(scene==='proactive'||scene==='ice_break'||task?.category==='daily'){
      kind='fresh_start';name='低压建联';hook='缺少明确购买和顾虑事实，先用两个方向降低首次回复门槛。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|fresh`,i=>[
        `${displayName}，我是${ownerShort}。关于${product}，您想先看怎么用，还是先看适合范围？`,
        `${displayName}，关于${product}，您是刚开始了解，还是已经对比过一些？`,
        `${displayName}，我是${ownerShort}。我先不发资料，您更想先看基础用法还是注意事项？`,
        `${displayName}，关于${product}，您想让我帮您核对适合边界，还是先聊日常怎么安排？`,
        `${displayName}，${product}这边我先不推。您更想先弄清楚用法，还是先看它和别的怎么配合？`,
        `${displayName}，我是${ownerShort}。您可以先说一个最想解决的问题，我按这个帮您筛。`
      ][i]));
    }else{
      kind='usage_care';name='节奏确认';hook='没有足够转化信号，先确认当前使用或了解节奏。';
      ({direct,restrained,consultant}=openingScriptTrio(c,kind,`${product}|rhythm`,i=>[
        `${displayName}，您现在${product}的节奏还好吗？需要调整的地方告诉我。`,
        `${displayName}，您方便时回一下当前情况就好，我先不打扰。`,
        `${displayName}，我先确认您的当前节奏，再决定要不要给下一步。`,
        `${displayName}，${product}是按原来的方式用着，还是最近有变化？我按实际情况帮您看。`
      ][i]));
    }
    const clause=openingActivityClause(kind,act);
    if(clause){
      if(kind==='repurchase_inventory')direct+=` ${clause}`;
      else if(kind==='high_intent_plan')consultant+=` ${clause}`;
      else if(kind==='concern_solution')consultant+=` ${clause}`;
      else if(kind==='usage_care')consultant+=` ${clause}`;
    }
    if(!['paused_review','safety_boundary','birthday_touch','public_service'].includes(kind)){
      direct+=` ${openingPersonalBit(c)}`;
    }
    const goalMap={
      paused_review:'人工复核暂停信号，不发送主动营销',
      safety_boundary:'守住专业边界，并提供可带去咨询的公开资料',
      birthday_touch:'完成生日祝福，保留低压力服务入口',
      public_service:'完成中性提醒，确认是否需要帮助',
      repurchase_inventory:'拿到剩余量或使用节奏回复，再判断是否复购',
      usage_care:'拿到使用体验或节奏反馈，再决定下一步服务',
      sleep_wakeup:'拿到“继续”或“暂停”的明确回复',
      logistics_service:'先解决物流或售后卡点，再恢复正常沟通',
      concern_solution:'把顾虑收缩成一个可回答的单点',
      high_intent_plan:'确认用户当前准备阶段和下一步',
      fresh_start:'获得首次回复，并确认了解阶段'
    };
    return {kind,name,hook,goal:goalMap[kind]||'优先获得真实回复，再进入需求确认',direct,restrained,consultant,reply_routes:openingReplyRoutes(kind,product),angle:openingAngle(c),personal_bit:openingPersonalBit(c)};
  }
  function suggestionFor(c,message,scene,task){
    const p=c.persona||{};
    const displayName=String(c.salutation||c.name||'').trim().replace(/\s+/g,'')||'您好';
    const focus=c.product_focus||'NMN焕活方案';
    const input=String(message||'').trim();
    const sensitive=/治疗|治好|药|医生|怀孕|孕期|严重|胸痛|呼吸困难/.test(input);
    const openingMode=sensitive||['proactive','ice_break','daily'].includes(scene)||['daily','intent','purchase_care','reactivation'].includes(task?.category);
    if(openingMode){
      const strategy=buildOpeningStrategy(c,task,scene,sensitive);
      const ctx=openingContext(c);
      const paused=strategy.kind==='paused_review';
      const priority=paused?'暂停观察':(ctx.tier==='高价值'||ctx.warmth==='高'||ctx.familiar?'A · 优先开口':'B · 低压建联');
      const rationale=(key)=>`${strategy.name}适合当前${ctx.tier||'未分层'}、${ctx.warmth||'待建立'}温度、${ctx.engagement||'暂无统计'}互动和「${ctx.concern||'待确认'}」状态。${key}版本保留一个明确目标，避免一次给多个卖点。`;
      const strategies=[
        {key:'direct',type:'直接型',label:`直接开口 · ${strategy.name}`,reply:strategy.direct,rationale:rationale('直接型')},
        {key:'restrained',type:'克制型',label:`克制开口 · ${strategy.name}`,reply:strategy.restrained,rationale:rationale('克制型')},
        {key:'consultant',type:'顾问型',label:`顾问开口 · ${strategy.name}`,reply:strategy.consultant,rationale:rationale('顾问型')}
      ];
      return {
        reply:strategy.direct,
        alternatives:[strategy.restrained,strategy.consultant],
        strategies,
        opening_plan:{
          priority,
          strategy_kind:strategy.kind,
          strategy_name:strategy.name,
          hook:strategy.hook,
          angle:strategy.angle,
          goal:strategy.goal,
          first_question:strategy.direct,
          basis:[strategy.hook,`称呼：${openingName(c)}`,`顾问：${c.owner||'待确认'}`,`产品线索：${ctx.product}`,`关心点：${ctx.concern||'待确认'}`,`关系温度：${ctx.warmth||'待建立'}`,`互动状态：${ctx.engagement||'暂无统计'}`,`授权状态：${c.consent||'待确认'}`],
          reply_routes:strategy.reply_routes,
          stop_rule:paused
            ?'该用户已处于暂停边界：不主动发送营销内容，只在用户主动咨询或完成授权复核后处理。'
            :'用户要求暂停、涉及医疗判断、表达拒绝或连续没有回应时，停止同类主动触达并转人工复核。'
        },
        next_turns:strategy.reply_routes.slice(0,3).map(route=>({when:route.type,reply:route.advisor_next})),
        human_score:strategy.kind==='safety_boundary'?86:92,
        human_checks:['称呼来自现有资料','一条消息只问一个目标','不提具体购买日期','不使用“多久之前购买”','不暴露内部评分、标签或优先级','发送前人工确认'],
        historical_basis:'参考历史触达：具体上下文、亲切称呼与单一问题优先；长清单和强稀缺表达降权。',
        reason:`以「${strategy.name}」处理${ctx.product}相关线索，并结合${ctx.concern||'当前待确认'}、${ctx.warmth||'待建立'}温度和${ctx.engagement||'暂无统计'}互动生成开口策略。`,
        policy_flags:sensitive?['触发医疗边界','禁止个体化用药建议','需要人工确认']:['不使用绝对功效','不把推断当事实','不涉及政治立场定向','不暴露内部信息','发送前人工确认'],
        provider:'Dotbest Human-tone Agent'
      };
    }
    const concern=String(p.concerns||'').trim();
    const concernPhrase=concern||'使用与复购';
    const concernLead=concern?`您之前比较在意${concern}`:'您可能还在比较和选择';
    const recency=Number(p.recency_days);
    const recencyLead=Number.isFinite(recency)&&recency>0
      ?(recency<=7?'您最近还比较活跃':recency<=30?'这段时间没怎么打扰您，怕信息一多反而乱':'这段时间一直没打扰您，今天先只确认一件事')
      :'想先和您确认一下';
    const lp=c.last_purchase||{};
    const purchased=Boolean(lp&&lp.hasPurchase);
    const lastProduct=String((lp&&lp.product)||'').trim()||String(c.product_focus||'').split('、')[0].trim()||'您之前关注的产品';
    const purchaseLead=purchased?`您之前在用${lastProduct}，想先看看这段时间用得顺不顺手`:'想先确认您目前的使用情况和需求';
    const priKey=p.warmth==='高'?'高关系温度':p.warmth==='中'?'中等关系温度':'尚待建立关系';
    const tierKey=p.value_tier||'';
    const rationaleBase=(styleHint)=>`该用户分层为${tierKey||'待分群'}、${priKey}、互动${p.engagement||'暂无统计'}，采用${styleHint}更贴合当前沟通温度。`;

    let direct='',restrained='',consultant='';
    let directR=rationaleBase('直接型：一次只问一个明确问题，降低回复门槛'),restrainedR=rationaleBase('克制型：给足退出空间，不制造被催促感'),consultantR=rationaleBase('顾问型：先给一个服务型下一步，再推进使用与复购判断');

    if(sensitive){
      const a=`${displayName}，您提到的情况会涉及专业医疗判断，我不能只凭产品信息下结论。建议先咨询医生或药师；需要的话，我把${focus}的公开成分信息和注意事项整理给您，方便您带着去问。`;
      const b=`${displayName}，这件事我先不替您下个体结论，您问医生或药师会更稳妥。要的话我发一份${focus}的成分和注意事项，您带着资料去咨询会更清楚。`;
      const c=`${displayName}，建议您把这次情况如实告诉医生或药师，再结合${focus}的公开成分边界一起判断。我可以先帮您把只讲成分和注意要点的说明整理好，您看要不要。`;
      direct=a;restrained=b;consultant=c;
      directR='涉及医疗边界时，直接型最清晰：先给专业建议方向，再提供可执行的下一步。';
      restrainedR='克制型放缓语气，尊重用户自主决策，不施加产品判断压力。';
      consultantR='顾问型强调带着专业信息去咨询，把中台定位在服务而非诊断。';
    }else if(task?.category==='birthday'){
      direct=`${displayName}，提前祝您生日快乐。希望新的一岁，工作和家里的事都顺顺利利，今天就是来送个祝福。`;
      restrained=`${displayName}，想起您生日快到了，先来送个祝福，愿您顺心顺利。今天不用特意回我，后面有需要随时说。`;
      consultant=`${displayName}，祝您生日快乐。借这个机会也想问一句：最近身体和状态都还好吗？有需要我配合安排的地方直接告诉我。`;
      directR=rationaleBase('生日关怀首轮只送祝福，不夹带产品信息');
      restrainedR=rationaleBase('祝福后明确不追回复，尊重服务边界');
      consultantR=rationaleBase('把祝福与一次低压力服务确认结合，为后续沟通留出口');
    }else if(task?.category==='public_event'){
      direct=`${displayName}，看到${c.city||'您所在地'}这两天有天气和出行提醒，今天出门的话多留一点时间，路上注意安全。`;
      restrained=`${displayName}，顺手提醒一句：${c.city||'您所在地'}这两天天气和出行有点变化，您安排时间时留意一下。不用特意回我。`;
      consultant=`${displayName}，${c.city||'您所在地'}这两天天气和交通有变动，您如果正好要出门，需要我帮您整理一份简短的注意事项吗？`;
      directR=rationaleBase('公共信息触达保持中性，只提醒不做营销');
      restrainedR=rationaleBase('合并提醒与免回复提示，避免打扰');
      consultantR=rationaleBase('把提醒转为一次可选的帮助，方便用户决定是否继续');
    }else if(task?.category==='purchase_care'){
      direct=`${displayName}，${purchaseLead}。想问一句：这段时间基本按计划在用，还是偶尔会忘？有哪里不清楚也可以直接告诉我。`;
      restrained=`${displayName}，${recencyLead}：您目前用得还顺手吗？如果暂时没空看，就不用回，等您方便再说。`;
      consultant=`${displayName}，${purchaseLead}。我先不催次数，只想确认一个最容易忽略的点：您现在是按原节奏用，还是有调整？我按您的实际情况再给下一步。`;
      directR=rationaleBase('购买后回到使用本身，不预设效果');
      restrainedR=rationaleBase('关怀消息允许对方不回复，降低压力');
      consultantR=rationaleBase('把关怀聚焦到使用节奏，再顺势判断续购与服务');
    }else if(task?.category==='reactivation'){
      direct=`${displayName}，${recencyLead}：您还想继续看一版简短要点，还是这件事先放一放？告诉我哪一种就行。`;
      restrained=`${displayName}，${recencyLead}。如果暂时不需要，我就不再继续发；如果您还想了解，我按最关心的一点简短说明。`;
      consultant=`${displayName}，${recencyLead}。记得您之前更在意${concernPhrase}，我可以把最关键的一点压成一页，需要就发，不需要也完全没关系。`;
      directR=rationaleBase('沉睡用户首选二选一，只确认是否继续');
      restrainedR=rationaleBase('明确提供退出选项，减少被推送的反感');
      consultantR=rationaleBase('回到用户曾关心的具体点，降低再次开口成本');
    }else if(task?.category==='daily'){
      direct=`${displayName}，我是负责服务您的顾问。看资料您关注${focus}，先问一个简单的问题：您是刚开始了解，还是已经对比过一些了？`;
      restrained=`${displayName}，简单和您打个招呼。您关注${focus}这件事我可以先不发资料，您如果暂时只想了解基础知识，告诉我就好。`;
      consultant=`${displayName}，您好，我先做一下自我介绍，方便您找得到我。关于${focus}，今天先只确认一个方向：您更想先看成分区别，还是日常怎么选？`;
      directR=rationaleBase('新客首次触达先建联，用一个易答问题开场');
      restrainedR=rationaleBase('克制型允许用户只做低压力回应，不塞资料');
      consultantR=rationaleBase('顾问型先自报身份，再给方向性选择，便于后续跟进');
    }else if(task?.category==='intent'){
      direct=`${displayName}，${concernLead}，到咱们约好的时间了。现在主要是这一点还没想清楚，还是有别的卡点？告诉我我先解决一个。`;
      restrained=`${displayName}，接着上次聊的${concernPhrase}，我问一句：您现在是还想再看，还是先放一放？怎么选都可以。`;
      consultant=`${displayName}，上次聊到${focus}，我先把您最关心的「${concernPhrase}」整理成一页，可以今天看，也可以放到您方便的时间。您更想看结论还是逐条说明？`;
      directR=rationaleBase('高意向用户直接确认卡点，避免泛化介绍');
      restrainedR=rationaleBase('延续话题但不催促，保留退出空间');
      consultantR=rationaleBase('给出结构化下一步，贴合其比较型沟通习惯');
    }else if(scene==='objection'){
      direct=`${displayName}，您会把安全和长期花费一起考虑，很正常。咱们先不急着定方案：您现在更想先把不适合的情况弄清楚，还是先把一个周期大概花费算明白？`;
      restrained=`${displayName}，这两个担心都是该问清楚的，尤其安全是第一位。咱们可以先只聊一个，另一个等有结论了再说，您选先聊哪个？`;
      consultant=`${displayName}，我先不推进方案，帮您把“预算”和“适用范围”拆成两点，按您需要逐一核对。您今天想先看哪一点？`;
      directR=rationaleBase('顾虑型用户给出二选一，快速定位卡点');
      restrainedR=rationaleBase('不急着跨过顾虑，把节奏交给用户');
      consultantR=rationaleBase('把顾虑结构化为可核对的两点，匹配其理性决策习惯');
    }else if(scene==='follow'){
      direct=`${displayName}，上次聊到${focus}，我把最关键的内容压成了三点。您想看的话我发，暂时不需要也没关系。`;
      restrained=`${displayName}，接着上次的话题，我这边还有一版简短要点。您要是有空告诉我一声，我就发；没空就下次。`;
      consultant=`${displayName}，上次您关心${concernPhrase}，我先准备了三小点，分别说清楚作用边界、使用方式和注意项。您想先看哪一块？`;
      directR=rationaleBase('跟进时先复述话题，把选择权交给用户');
      restrainedR=rationaleBase('克制型不催看资料，避免变成连续推送');
      consultantR=rationaleBase('把要点结构化，避免一次性倾倒长内容');
    }else if(scene==='ice_break'){
      direct=`${displayName}，看到您之前留意过${focus}。我先不发一大段资料，想问个简单的：您是刚开始了解，还是已经对比过一些了？`;
      restrained=`${displayName}，${recencyLead}。关于${focus}，您如果只是先随便看看，我就发个一页式总览；不想看也告诉我就好。`;
      consultant=`${displayName}，${purchaseLead}。今天先只问一个方向：您更在乎使用方式、成分来源，还是预算？我按您最在意的说。`;
      directR=rationaleBase('破冰用易答问题降低开口门槛');
      restrainedR=rationaleBase('克制型明确不打扰，任用户选择是否继续');
      consultantR=rationaleBase('结合购买或使用线索，先确认最在意的维度');
    }else if(scene==='close'){
      direct=`${displayName}，按刚才确认的情况，先从轻一点的选择更合适。我把内容、注意点和一个周期的明细发您，您看完再决定，不着急现在答复。`;
      restrained=`${displayName}，方案我整理好了，您方便时看，别因为我问了就急着定。看完有任何顾虑，我们再一条条过。`;
      consultant=`${displayName}，我先不催决定。给您两句话的下一步：确认适用范围与预算都清楚后，再选最贴近您节奏的方案。要我现在发明细吗？`;
      directR=rationaleBase('促单阶段给明确下一步，但不虚构紧迫感');
      restrainedR=rationaleBase('克制型主动撤掉时间压力，减少反感');
      consultantR=rationaleBase('把决策拆成可核对的步骤，贴合谨慎型用户');
    }else if(scene==='proactive'){
      const backRef=purchased?`您之前在用${lastProduct}，我这边还有印象`:`您之前比较关注${concernPhrase}`;
      direct=`${displayName}，${backRef}。今天先确认一件最实用的事：您是想按当前节奏继续，还是看看有没有更适合现在的选择？`;
      restrained=`${displayName}，${backRef}，我先不急着发方案。您如果想继续了解，我按最相关的一点做一页说明；暂时不需要也完全没关系。`;
      consultant=`${displayName}，${backRef}。我可以把${focus}的使用边界和可调整点整理一页，您方便时看，看完再按您的实际情况定下一步。`;
      directR=rationaleBase('主动触达先回到用户最近的真实关注点，再给一个二选一');
      restrainedR=rationaleBase('克制型给足暂停空间，把沟通节奏交给用户');
      consultantR=rationaleBase('顾问型先给一页低压力说明，为后续服务与复购判断留出口');
    }else{
      direct=`${displayName}，您刚才提到的点我收到了。咱们先只解决一个问题：关于${focus}，您最想先确认使用边界、主要区别，还是预算？`;
      restrained=`${displayName}，收到，我先不展开。您只需要告诉我一个方向：继续了解，还是先把${focus}放一放？我按您的节奏来。`;
      consultant=`${displayName}，${concernLead}。我可以把${focus}相关的三点快速说清楚，您先选最关心的一个，我再往下，避免信息太满。`;
      directR=rationaleBase('通用咨询先圈定一个具体问题，避免发散');
      restrainedR=rationaleBase('克制型尊重用户节奏，允许先暂停');
      consultantR=rationaleBase('顾问型把复杂内容切成小块，按点推进');
    }

    const activityLine=activityLineFor();
    const activityAllowed=Boolean(activityLine)&&!['purchase_care','reactivation','birthday','public_event'].includes(task?.category);
    const activityFriendly=activityAllowed&&(['consult','ice_break','follow','intent','proactive','daily'].includes(scene)||['daily','intent'].includes(task?.category));
    if(activityFriendly){direct+=` ${activityLine}`;consultant+=` ${activityLine}`;}

    const strategies=[
      {key:'direct',type:'直接型',label:'直接型',reply:direct,rationale:directR},
      {key:'restrained',type:'克制型',label:'克制型',reply:restrained,rationale:restrainedR},
      {key:'consultant',type:'顾问型',label:'顾问型',reply:consultant,rationale:consultantR}
    ];
    const nextTurns=[
      {when:'用户愿意继续',reply:'先复述用户选择，再只补充对应的一点信息，结尾问一个问题。'},
      {when:'用户说再考虑',reply:'确认其考虑点和下次联系时间，不马上追加优惠。'},
      {when:'用户拒绝或不需要',reply:'接受拒绝，确认是否暂停同类消息，并结束本轮。'}
    ];
    const baseFacts=[
      `称呼：${displayName}`,
      `顾问：${c.owner||'待确认'}`,
      purchased?`已购线索：${lastProduct}`:`关注方向：${focus}`,
      `关心点：${concern||'待确认'}`,
      `关系温度：${p.warmth||'待建立'}`,
      `互动状态：${p.engagement||'暂无统计'}`,
      `沟通偏好：${p.content_preference||'待观察'}`,
      `授权状态：${c.consent||'待确认'}`
    ].filter(Boolean);
    const objectiveMap={
      birthday:'完成自然祝福，并留下一个可回应的服务话题',
      public_event:'完成中性提醒，并确认是否需要帮助',
      purchase_care:'确认使用节奏，判断是否需要调整或复购服务',
      reactivation:'拿到一句“继续了解”或“先暂停”的明确回复',
      daily:'确认用户当前处于了解、比较还是准备使用阶段',
      intent:'定位一个具体卡点，为下一步方案做准备'
    };
    const goal=sensitive
      ?'先给专业边界，再确认用户是否需要整理公开资料'
      :objectiveMap[task?.category]||(scene==='objection'
        ?'把顾虑拆成一个可回答的问题'
        :scene==='close'
          ?'确认明细是否清楚，并获得推进或暂停的回复'
          :'优先获得一条真实回复，再进入需求确认');
    const paused=String(c.stage).includes('暂停')||String(c.consent).includes('拒绝');
    const openingPlan={
      priority:paused?'暂停观察':(p.value_tier==='高价值'||p.warmth==='高'||purchased?'A · 优先开口':'B · 低压建联'),
      goal,
      first_question:direct,
      basis:baseFacts,
      reply_routes:[
        {
          type:'愿意回复',
          advisor_next:'只补一条最相关的信息，再问“这个方向是否符合您的情况”；确认后进入搭配方案。',
          profile_value:'沉淀兴趣方向、当前阶段和有效开口方式。',
          conversion_value:'从开口进入需求确认，为方案或复购服务建立路径。'
        },
        {
          type:'犹豫或提问',
          advisor_next:'不连续推销，先用知识库回应一个问题，再问用户最想先解决哪一点。',
          profile_value:'沉淀具体顾虑、决策方式和偏好内容。',
          conversion_value:'把模糊观望转成可处理的单一卡点，提高下一次转化准确度。'
        },
        {
          type:'拒绝或暂停',
          advisor_next:'接受用户边界，确认暂停范围，结束本轮；不追加活动或优惠。',
          profile_value:'记录暂停授权、敏感话题和打扰信号。',
          conversion_value:'保护长期关系，只保留用户主动发起的服务入口。'
        },
        {
          type:'本轮未回复',
          advisor_next:'登记本次尝试和偏好的非打扰时段；下次换一个更轻的问候或服务入口。',
          profile_value:'记录触达结果，避免同一话术连续重复。',
          conversion_value:'通过低频、高质量触达逐步提高开口概率。'
        }
      ],
      stop_rule:paused
        ?'该用户已处于暂停边界：不主动发送营销内容，只在用户主动咨询或完成授权复核后处理。'
        :'用户要求暂停、涉及医疗判断、表达拒绝或连续没有回应时，停止同类主动触达并转人工复核。'
    };
    return {
      reply:direct,
      alternatives:[restrained,consultant],
      strategies,
      opening_plan:openingPlan,
      next_turns:nextTurns,
      human_score:sensitive?86:92,
      human_checks:['承接真实上下文','一条消息一个目标','只留一个易答问题','无虚构稀缺与效果','称呼来自现有资料','三种风格均不暴露内部判断'],
      historical_basis:'参考历史触达：具体上下文与单问句优先；长清单和强稀缺表达降权。',
      reason:`基于当前消息、${focus}关注事实与${p.decision_style||'已有沟通判断'}，生成直接型、克制型、顾问型三种可选话术${task?`，并匹配“${task.type}”任务场景`:''}。`,
      policy_flags:sensitive?['触发医疗边界','禁止个体化用药建议','需要人工确认']:['不使用绝对功效','不把推断当事实','不涉及政治立场定向','不暴露内部信息','发送前人工确认'],
      provider:'Dotbest Human-tone Agent'
    };
  }
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);const path=url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');const method=(options.method||'GET').toUpperCase();
    if(path==='/api/login'&&method==='POST'){loggedIn=true;return ok({display_name:'演示顾问A',role:'一线运营'})}
    if(path==='/api/logout'&&method==='POST'){loggedIn=false;return ok({})}
    if(path==='/api/me')return loggedIn?ok({id:1,display_name:'演示顾问A',role:'一线运营',permissions:['customer:read','conversation:reply','task:update']}):fail('请先登录',401);
    if(!loggedIn)return fail('请先登录',401);
    if(path==='/api/v1/private/resources'&&method==='GET')return ok({...resources});
    if(path==='/api/v1/private/resources'&&method==='PUT'){const p=body(options);resources={activity:String(p.activity||'').trim(),plan:String(p.plan||'').trim(),knowledge:String(p.knowledge||'').trim()};persistResources();return ok({...resources})}
    if(path==='/api/v1/private/workbench')return ok({metrics:{due:tasks.filter(x=>x.status==='pending').length,waiting:customers.filter(x=>x.stage==='待回复'||x.stage==='对话中').length,followups:customers.filter(x=>x.stage==='待跟进').length,paused:customers.filter(x=>x.stage==='暂停触达').length},categories,segments,queue:tasks.filter(x=>x.status==='pending').slice(0,6).map(t=>({...t,customer:customer(t.customer_id)})),completed_today:3});
    if(path==='/api/v1/private/user-assets')return ok({segments,categories,owners:ownerSummaries(customers),total_users:customers.length,updated_at:now()});
    const segMatch=path.match(/^\/api\/v1\/private\/segments\/([\w-]+)\/overview$/);
    if(segMatch){const code=segMatch[1];const segment=segments.find(x=>x.code===code);if(!segment)return fail('板块不存在');return ok(segmentOverview(segment))}
    if(path==='/api/v1/private/customers'&&method==='POST')return newCustomer(body(options));
    if(path==='/api/v1/private/customers/import'&&method==='POST')return importCustomers(body(options));
    let m=path.match(/^\/api\/v1\/private\/user-assets\/([\w-]+)\/customers$/);
    if(m){const code=m[1];const audience=categories.find(x=>x.code===code)||segments.find(x=>x.code===code);if(!audience)return fail('人群或板块不存在');const q=(url.searchParams.get('q')||'').toLowerCase();const owner=(url.searchParams.get('owner')||'').trim();const baseItems=audience.category_codes?customers.filter(x=>x.assetCodes.some(c=>audience.category_codes.includes(c))):customers.filter(x=>x.assetCodes.includes(code));let items=baseItems;if(owner)items=items.filter(x=>x.owner===owner);if(q)items=items.filter(x=>`${x.name}${x.salutation||''}${x.phone}${x.owner}${x.remark||''}${x.product_focus}${x.stage}`.toLowerCase().includes(q));return ok({audience,items,owners:ownerSummaries(baseItems),pagination:{page:1,total:items.length}})}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)$/);if(m){const c=customer(m[1]);return c?ok(c):fail('用户不存在')}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/ai-profile\/refresh$/);if(m&&method==='POST'){const c=customer(m[1]);c.ai_profile.generated_at=now();return ok(c.ai_profile)}
    if(path==='/api/v1/private/conversations'){const owner=(url.searchParams.get('owner')||'').trim();const base=customers.filter(x=>x.stage!=='暂停触达');const items=base.filter(x=>!owner||x.owner===owner).map(c=>({conversation_id:c.id,customer_id:c.id,name:c.name,salutation:c.salutation,owner:c.owner,stage:c.stage,product_focus:c.product_focus,last_message:c.last_message,last_time:c.last_time,priority:c.priority,unread:c.stage==='待回复'||c.stage==='对话中'}));return ok({items,owners:ownerSummaries(base)})}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/agent-conversations$/);if(m&&method==='POST'){const c=customer(m[1]);if(!c)return fail('用户不存在');return ok(conversations.get(c.id),201)}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)$/);if(m){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const cc=customer(conv.customer_id);return ok({conversation:{...conv,suggestion:conv.suggestion||suggestionFor(cc,'','proactive',null)},customer:cc})}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/messages$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options),c=customer(conv.customer_id),task=tasks.find(x=>x.id===data.task_id);conv.scene=data.scene||task?.recommended_scene||'consult';conv.messages.push({role:data.task_id?'system_task':'customer',content:String(data.message||task?.prompt||''),time:'刚刚'});conv.suggestion=suggestionFor(c,String(data.message||task?.prompt||''),conv.scene,task);if(!data.task_id){c.last_message=String(data.message||'');c.last_time='刚刚';c.stage='待回复'}return ok({conversation_id:conv.id,suggestion:conv.suggestion,task})}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/mark-sent$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options);conv.messages.push({role:'operator',content:String(data.reply||''),time:'刚刚'});conv.suggestion=null;const c=customer(conv.customer_id),task=tasks.find(x=>x.id===data.task_id);if(task)task.status='done';c.stage='待跟进';c.next_action='等待用户回复，避免重复触达';c.next_at='2天后';return ok({sent:true,conversation:conv,task_completed:Boolean(task)})}
    if(path==='/api/v1/private/tasks'&&method==='GET'){const category=url.searchParams.get('category')||'all';const filtered=tasks.filter(t=>category==='all'||t.category===category);return ok({items:filtered.map(t=>({...t,customer:customer(t.customer_id)})),all_items:tasks.map(t=>({...t,customer:customer(t.customer_id)})),pending:tasks.filter(x=>x.status==='pending').length,categories:taskCategories,performance:performance()})}
    if(path==='/api/v1/private/tasks/optimization/refresh'&&method==='POST'){optimizationVersion+=1;return ok(performance().optimization)}
    m=path.match(/^\/api\/v1\/private\/tasks\/([\w-]+)$/);if(m&&method==='GET'){const t=tasks.find(x=>x.id===m[1]);return t?ok({...t,customer:customer(t.customer_id),performance:performance()}):fail('任务不存在')}
    m=path.match(/^\/api\/v1\/private\/tasks\/([\w-]+)\/status$/);if(m&&method==='POST'){const t=tasks.find(x=>x.id===m[1]);if(!t)return fail('任务不存在');t.status=body(options).status||'done';return ok(t)}
    if(path==='/api/v1/private/scripts')return ok({items:scripts,scenes:[...new Set(scripts.map(x=>x.scene))],lifecycle:[{customer_type:'新客',path:['触达激活','需求转化','成交转化','售后复购','相关裂变']},{customer_type:'存量老客',path:['沉睡唤醒','用户关怀','复购增购','定期维护','裂变转介']}],historical_learning:historicalLearning});
    if(path==='/api/v1/private/governance')return ok({role:'一线运营',allowed:['查看本人负责用户的脱敏资料','查看内部辅助摘要及事实依据','生成、编辑和复制回复建议','更新本人触达任务与跟进记录'],blocked:['访问后台订单管理','查看经营决策与利润报表','导出完整手机号等敏感字段','将内部标签、评分或推断直接发送给客户'],audit:[{time:'今天 09:18',action:'生成回复建议',object:'示例用户01',result:'通过合规检查'},{time:'昨天 17:42',action:'暂停触达',object:'示例用户07',result:'已写入免打扰'}]});
    return fail('演示接口不存在');
  };
})();
